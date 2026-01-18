import { Client } from 'basic-ftp';
import * as chokidar from 'chokidar';
import path from 'path';
import fs from 'fs-extra';
import { decrypt } from '../utils/encryption.js';
import { getDb } from '../db.js';
import { logStore } from './LogStore.js';

interface SyncLog {
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
}

interface UploadProgress {
  filename: string;
  totalBytes: number;
  bytesTransferred: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
  startTime: number;
}

interface OverallProgress {
  activeUploads: UploadProgress[];
  queueLength: number;
  totalFilesInBatch: number;
  completedFiles: number;
}

class SyncSession {
  private client: Client;
  private watcher: chokidar.FSWatcher | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private logs: SyncLog[] = [];
  private pendingDownloads: Set<string>;

  // Upload queue for realtime processing
  private uploadQueue: string[] = [];
  private isProcessingQueue = false;

  // Connection pool for parallel uploads (dynamic based on config)
  private poolSize: number;
  private connectionPool: Client[] = [];
  private poolConnected: boolean[] = [];
  private poolBusy: boolean[] = []; // Track if connection is currently in use
  private activeUploads = 0;

  // Delete queue
  private deleteQueue: Set<string> = new Set();
  private isProcessingDeletes = false;

  // Upload progress tracking
  private uploadProgress: Map<number, UploadProgress> = new Map();
  private totalFilesInBatch = 0;
  private completedFilesInBatch = 0;

  // Persistent connection for non-parallel ops
  private isConnected = false;

  public connectionId: number;
  public config: any;
  public localRoot: string;

  constructor(connectionId: number, config: any) {
    this.connectionId = connectionId;
    this.config = config;
    this.client = new Client(60000);
    this.pendingDownloads = new Set();

    // Dynamic pool size from config (1-10, default 3)
    this.poolSize = Math.max(1, Math.min(10, config.parallel_connections || 3));

    // Initialize connection pool
    for (let i = 0; i < this.poolSize; i++) {
      this.connectionPool.push(new Client(30000));
      this.poolConnected.push(false);
      this.poolBusy.push(false); // Not busy initially
    }

    if (this.config.local_path && this.config.local_path.trim() !== '') {
      this.localRoot = this.config.local_path;
    } else {
      this.localRoot = path.resolve(process.cwd(), 'sync_data', this.connectionId.toString());
    }
  }

  // Connect a pool client
  private async connectPoolClient(index: number) {
    if (this.poolConnected[index] && !this.connectionPool[index].closed) {
      return;
    }

    const password = decrypt(this.config.password_hash);
    if (!password) throw new Error('Cannot decrypt password');

    await this.connectionPool[index].access({
      host: this.config.server,
      user: this.config.username,
      password: password,
      port: this.config.port || 21,
      secure: this.config.secure ? true : false,
      secureOptions: this.config.secure ? { rejectUnauthorized: false } : undefined
    });

    this.poolConnected[index] = true;
  }

  // Add file to queue and start parallel processing
  private queueFileForUpload(localPath: string) {
    this.uploadQueue.push(localPath);
    this.totalFilesInBatch++;
    this.log('info', `Queued: ${path.basename(localPath)} (${this.uploadQueue.length} pending)`);

    // Start processing if not already at max capacity
    this.processUploadQueue();
  }

  // Process queue with parallel connections
  private async processUploadQueue() {
    // Don't process if queue is empty
    if (this.uploadQueue.length === 0) return;

    // Find an available (not busy) connection
    let clientIndex = -1;
    for (let i = 0; i < this.poolSize; i++) {
      if (!this.poolBusy[i]) {
        clientIndex = i;
        break;
      }
    }

    // All connections are busy, wait for one to become free
    if (clientIndex === -1) return;

    // Mark this connection as busy immediately
    this.poolBusy[clientIndex] = true;

    // Connect if not already connected
    if (!this.poolConnected[clientIndex] || this.connectionPool[clientIndex].closed) {
      try {
        await this.connectPoolClient(clientIndex);
        this.log('success', `Pool connection ${clientIndex + 1} connected`);
      } catch (err: any) {
        this.log('error', `Pool connection ${clientIndex + 1} failed: ${err.message}`);
        this.poolBusy[clientIndex] = false;
        return;
      }
    }

    // Get next file from queue
    const localPath = this.uploadQueue.shift();
    if (!localPath) {
      this.poolBusy[clientIndex] = false;
      return;
    }

    // Upload in background
    this.uploadWithPoolClient(clientIndex, localPath).finally(() => {
      this.poolBusy[clientIndex] = false;
      // Process more files if available
      this.processUploadQueue();
    });

    // Try to start more parallel uploads on other connections
    this.processUploadQueue();
  }

  // Upload a single file using pool client
  private async uploadWithPoolClient(clientIndex: number, localPath: string) {
    const client = this.connectionPool[clientIndex];
    const filename = path.basename(localPath);
    const startTime = Date.now();

    try {
      if (!fs.existsSync(localPath)) {
        this.log('error', `File not found: ${filename}`);
        return;
      }

      const stats = await fs.stat(localPath);
      const totalBytes = stats.size;

      // Initialize progress tracking for this connection
      this.uploadProgress.set(clientIndex, {
        filename,
        totalBytes,
        bytesTransferred: 0,
        percent: 0,
        speedMBps: 0,
        etaSeconds: 0,
        startTime
      });

      // Throttled progress tracking - update only every 200ms to reduce overhead
      let lastProgressUpdate = 0;
      client.trackProgress((info) => {
        const now = Date.now();
        if (now - lastProgressUpdate < 200) return; // Throttle updates
        lastProgressUpdate = now;

        const elapsed = (now - startTime) / 1000; // seconds
        const speedBps = elapsed > 0 ? info.bytes / elapsed : 0;
        const speedMBps = speedBps / (1024 * 1024);
        const percent = totalBytes > 0 ? Math.round((info.bytes / totalBytes) * 100) : 0;
        const remainingBytes = totalBytes - info.bytes;
        const etaSeconds = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;

        this.uploadProgress.set(clientIndex, {
          filename,
          totalBytes,
          bytesTransferred: info.bytes,
          percent,
          speedMBps: Math.round(speedMBps * 100) / 100,
          etaSeconds,
          startTime
        });
      });

      const remotePath = this.toRemotePath(localPath, this.localRoot);
      const remoteDir = path.posix.dirname(remotePath);

      await client.ensureDir(remoteDir);

      // Use stream with large buffer (4MB) for maximum throughput
      const readStream = fs.createReadStream(localPath, {
        highWaterMark: 4 * 1024 * 1024 // 4MB buffer for maximum throughput
      });
      await client.uploadFrom(readStream, remotePath);

      // Stop progress tracking and record stats
      client.trackProgress();
      this.uploadProgress.delete(clientIndex);
      this.completedFilesInBatch++;

      // Reset batch counters when all files are done
      if (this.uploadQueue.length === 0 && this.uploadProgress.size === 0) {
        this.totalFilesInBatch = 0;
        this.completedFilesInBatch = 0;
      }

      // Record transfer stats
      try {
        await this.recordTransfer(totalBytes, 'upload');
      } catch { }

      this.log('success', `Uploaded: ${filename}`);
    } catch (err: any) {
      client.trackProgress(); // Stop tracking on error
      this.uploadProgress.delete(clientIndex);
      this.log('error', `Failed: ${filename} - ${err.message}`);

      // Mark connection as disconnected for reconnection
      if (err.message.includes('closed') || err.message.includes('FIN')) {
        this.poolConnected[clientIndex] = false;
      }
    }
  }

  // Upload a single file (used by batch processor)
  private async uploadSingleFile(localPath: string) {
    if (!fs.existsSync(localPath)) {
      throw new Error('File not found');
    }

    const remotePath = this.toRemotePath(localPath, this.localRoot);
    const remoteDir = path.posix.dirname(remotePath);

    await this.client.ensureDir(remoteDir);

    // Use stream with large buffer (4MB) for maximum throughput
    const readStream = fs.createReadStream(localPath, {
      highWaterMark: 4 * 1024 * 1024 // 4MB buffer
    });
    await this.client.uploadFrom(readStream, remotePath);

    // Record stats
    try {
      const stats = await fs.stat(localPath);
      await this.recordTransfer(stats.size, 'upload');
    } catch { }

    this.log('success', `Uploaded: ${path.basename(localPath)}`);
  }

  // Ensure persistent connection is established
  private async ensureConnection() {
    if (this.isConnected && !this.client.closed) {
      return; // Already connected
    }

    // Close old connection if any
    try {
      if (!this.client.closed) {
        this.client.close();
      }
    } catch { }

    // Create fresh client
    this.client = new Client(60000);

    const password = decrypt(this.config.password_hash);
    if (!password) throw new Error('Cannot decrypt password');

    this.log('info', `Connecting to ${this.config.server}...`);

    await this.client.access({
      host: this.config.server,
      user: this.config.username,
      password: password,
      port: this.config.port || 21,
      secure: this.config.secure ? true : false,
      secureOptions: this.config.secure ? { rejectUnauthorized: false } : undefined
    });

    this.isConnected = true;
    this.log('success', 'Connected to FTP server');
  }

  private async log(type: 'info' | 'error' | 'success', message: string) {
    const logEntry: SyncLog = {
      timestamp: new Date().toISOString(),
      type,
      message
    };
    this.logs.unshift(logEntry);
    if (this.logs.length > 50) this.logs.pop();
    console.log(`[Sync-${this.connectionId}] ${type.toUpperCase()}: ${message}`);

    // Persist to file-based LogStore (fire and forget)
    try {
      logStore.addLog(this.connectionId, type, message);
    } catch (e) {
      console.error('Failed to save log to LogStore', e);
    }
  }

  private async recordTransfer(bytes: number, direction: 'upload' | 'download') {
    try {
      logStore.addTransferStat(this.connectionId, bytes, direction);
    } catch (e) {
      console.error('Failed to save transfer stats', e);
    }
  }

  public getLogs() {
    return this.logs;
  }

  public getProgress(): OverallProgress {
    return {
      activeUploads: Array.from(this.uploadProgress.values()),
      queueLength: this.uploadQueue.length,
      totalFilesInBatch: this.totalFilesInBatch,
      completedFiles: this.completedFilesInBatch
    };
  }



  public async start() {
    const mode = this.config.sync_mode || 'bi_directional';
    this.log('info', `Starting sync session (Mode: ${mode})...`);

    await fs.ensureDir(this.localRoot);
    this.log('info', `Local directory: ${this.localRoot}`);

    // 1. Setup Watcher (Local -> Remote)
    // Only for bi_directional OR upload_only
    if (mode === 'bi_directional' || mode === 'upload_only') {
      this.watcher = chokidar.watch(this.localRoot, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        usePolling: true, // Enable polling for reliable detection on Windows
        interval: 300,
        binaryInterval: 500,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
      });

      this.watcher
        .on('add', p => this.handleLocalChange(p, this.localRoot))
        .on('change', p => this.handleLocalChange(p, this.localRoot))
        .on('unlink', p => this.handleLocalDelete(p, this.localRoot));

      this.log('success', 'Local watcher started');
    }

    // 2. Initial Sync & Interval (Remote -> Local)
    if (mode === 'bi_directional') {
      this.runSyncCycle(this.localRoot);
      this.intervalTimer = setInterval(() => this.runSyncCycle(this.localRoot), 60000);
      this.log('success', 'Bi-directional polling started');
    } else if (mode === 'download_only') {
      this.log('success', 'Download-only started (One-time scan)');
      // Run once then disconnect
      this.runSyncCycle(this.localRoot).then(() => {
        this.log('success', 'All downloads finished. Connection closed.');
        this.client.close();
      }).catch(err => {
        this.log('error', `Download process failed: ${err.message}`);
        this.client.close();
      });
    }
  }

  public async stop() {
    this.log('info', 'Stopping sync session...');
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    try {
      if (!this.client.closed) {
        this.client.close();
      }
    } catch (e) {
      // Ignore
    }
    this.log('info', 'Sync session stopped');
  }

  private toRemotePath(localPath: string, localRoot: string) {
    const relative = path.relative(localRoot, localPath);
    const remoteRoot = this.config.target_directory || '/';
    return path.posix.join(remoteRoot, relative.split(path.sep).join('/'));
  }

  public async manualUpload(localFilename: string) {
    try {
      const localPath = path.join(this.localRoot, localFilename);

      if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`);

      await this.ensureConnection();
      const remotePath = this.toRemotePath(localPath, this.localRoot);
      const remoteDir = path.posix.dirname(remotePath);
      await this.client.ensureDir(remoteDir);
      await this.client.uploadFrom(localPath, remotePath);

      try {
        const stats = fs.statSync(localPath);
        await this.recordTransfer(stats.size, 'upload');
      } catch { }
      this.log('success', `Manual Upload: ${localFilename}`);
    } catch (err: any) {
      this.isConnected = false;
      this.log('error', `Manual upload failed: ${err.message}`);
    }
  }

  public async manualDownload(remoteFilePath: string) {
    try {
      const remoteRoot = this.config.target_directory || '/';
      let relPath = path.posix.relative(remoteRoot, remoteFilePath);
      if (relPath.startsWith('..')) {
        relPath = path.basename(remoteFilePath);
      }

      const localPath = path.join(this.localRoot, relPath.split('/').join(path.sep));

      await this.ensureConnection();
      await fs.ensureDir(path.dirname(localPath));
      await this.client.downloadTo(localPath, remoteFilePath);
      this.log('success', `Manual Download: ${path.basename(remoteFilePath)}`);

      try {
        const stats = fs.statSync(localPath);
        await this.recordTransfer(stats.size, 'download');
      } catch { }
    } catch (err: any) {
      this.isConnected = false;
      this.log('error', `Manual download failed: ${err.message}`);
    }
  }

  private handleLocalChange(localPath: string, localRoot: string) {
    // Simply add file to batch queue - it will be uploaded with other files
    this.queueFileForUpload(localPath);
  }

  // Queue file for deletion - process immediately (realtime mode)
  private queueFileForDelete(localPath: string, localRoot: string) {
    if (!this.config.sync_deletions) return;

    this.deleteQueue.add(JSON.stringify({ localPath, localRoot }));
    this.log('info', `Queued delete: ${path.basename(localPath)} (${this.deleteQueue.size} pending)`);

    // Start processing immediately if not already processing
    if (!this.isProcessingDeletes) {
      this.processDeleteQueue();
    }
  }

  // Process all queued deletes sequentially
  private async processDeleteQueue() {
    if (this.isProcessingDeletes || this.deleteQueue.size === 0) return;
    this.isProcessingDeletes = true;

    const itemsToDelete = Array.from(this.deleteQueue);
    this.deleteQueue.clear();

    this.log('info', `Starting batch delete of ${itemsToDelete.length} files...`);

    try {
      await this.ensureConnection();

      let successCount = 0;
      let failCount = 0;

      for (const item of itemsToDelete) {
        try {
          const { localPath, localRoot } = JSON.parse(item);
          const remotePath = this.toRemotePath(localPath, localRoot);
          await this.client.remove(remotePath);
          this.log('success', `Deleted: ${path.basename(localPath)}`);
          successCount++;
        } catch (err: any) {
          if (err.code !== 550 && !err.message.includes('No such file')) {
            failCount++;
            this.log('error', `Delete failed: ${err.message}`);
          }
        }
      }

      this.log('success', `Batch delete complete: ${successCount} deleted, ${failCount} failed`);
    } catch (err: any) {
      this.log('error', `Batch delete failed: ${err.message}`);
    }

    this.isProcessingDeletes = false;
  }

  private handleLocalDelete(localPath: string, localRoot: string) {
    this.queueFileForDelete(localPath, localRoot);
  }

  private handleLocalDeleteDir(localPath: string, localRoot: string) {
    // For now, skip directory deletes as they're complex and can conflict
    if (!this.config.sync_deletions) return;
    this.log('info', `Directory delete detected (skipped): ${path.basename(localPath)}`);
  }

  private async runSyncCycle(localRoot: string) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.log('info', 'Starting periodic sync scan...');

    try {
      await this.ensureConnection();

      const remoteRoot = this.config.target_directory || '/';
      const remoteFiles = await this.listRemoteFiles(remoteRoot);

      let downloadCount = 0;

      for (const file of remoteFiles) {
        const relPath = path.posix.relative(remoteRoot, file.path);
        const localPath = path.join(localRoot, relPath.split('/').join(path.sep));

        let shouldDownload = false;

        if (!fs.existsSync(localPath)) {
          shouldDownload = true;
        } else {
          const localStats = fs.statSync(localPath);
          const remoteTime = new Date(file.modifiedAt || 0).getTime();
          const localTime = localStats.mtime.getTime();
          if (remoteTime > localTime + 2000) {
            shouldDownload = true;
          }
        }

        if (shouldDownload) {
          this.log('info', `Downloading: ${file.name}`);
          await fs.ensureDir(path.dirname(localPath));

          // Mark as pending download so watcher ignores it
          this.pendingDownloads.add(localPath);

          try {
            await this.client.downloadTo(localPath, file.path);
            downloadCount++;
            this.recordTransfer(file.size, 'download');
            this.log('success', `Downloaded: ${file.name}`);
          } catch (err: any) {
            this.pendingDownloads.delete(localPath); // Failed, so remove from ignore list
            throw err;
          }

          // Safety cleanup: remove from Set after 5 seconds just in case watcher didn't fire
          setTimeout(() => this.pendingDownloads.delete(localPath), 5000);
        }
      }

      if (downloadCount === 0) {
        this.log('info', 'Sync scan complete. No new files.');
      } else {
        this.log('success', `Sync scan complete. Downloaded ${downloadCount} files.`);
      }

    } catch (err: any) {
      this.log('error', `Sync scan error: ${err.message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  private async listRemoteFiles(dir: string): Promise<any[]> {
    let files: any[] = [];
    try {
      const list = await this.client.list(dir);
      for (const item of list) {
        const itemPath = path.posix.join(dir, item.name);
        if (item.isDirectory) {
          const subFiles = await this.listRemoteFiles(itemPath);
          files = files.concat(subFiles);
        } else {
          files.push({
            name: item.name,
            path: itemPath,
            size: item.size,
            modifiedAt: item.modifiedAt
          });
        }
      }
    } catch (err: any) {
      this.log('error', `List failed for ${dir}: ${err.message}`);
      // ignore
    }
    return files;
  }
}

class SyncManager {
  private sessions: Map<number, SyncSession> = new Map();

  private async getSession(connectionId: number): Promise<SyncSession> {
    if (this.sessions.has(connectionId)) {
      return this.sessions.get(connectionId)!;
    }
    const db = await getDb();
    const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
    if (!config) throw new Error('Connection not found');

    const session = new SyncSession(connectionId, config);
    this.sessions.set(connectionId, session);
    return session;
  }

  public async startSync(connectionId: number) {
    const session = await this.getSession(connectionId);
    await session.start();
  }

  public async stopSync(connectionId: number) {
    const session = this.sessions.get(connectionId);
    if (session) {
      await session.stop();
      this.sessions.delete(connectionId);
    }
  }

  public async manualUpload(connectionId: number, filename: string) {
    const session = await this.getSession(connectionId);
    await session.manualUpload(filename);
  }

  public async manualDownload(connectionId: number, remotePath: string) {
    const session = await this.getSession(connectionId);
    await session.manualDownload(remotePath);
  }

  public getStatus(connectionId: number) {
    return {
      running: this.sessions.has(connectionId),
      logs: this.sessions.get(connectionId)?.getLogs() || []
    };
  }

  public getProgress(connectionId: number): OverallProgress | null {
    const session = this.sessions.get(connectionId);
    if (!session) return null;
    return session.getProgress();
  }
}

export default new SyncManager();
