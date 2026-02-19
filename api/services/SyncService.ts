import { TransferClientFactory } from './transfer/TransferClientFactory.js';
import * as chokidar from 'chokidar';
import path from 'path';
import fs from 'fs-extra';
import PQueue from 'p-queue';
import { decrypt } from '../utils/encryption.js';
import { getDb } from '../db.js';
import { logStore } from './LogStore.js';
import { shouldIgnore, clearIgnoreCache } from './IgnoreService.js';
import { TransferClient } from './transfer/TransferClient.js';
import { SimpleMutex } from '../utils/SimpleMutex.js';

interface SyncLog {
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
}

interface UploadProgress {
  type: 'upload' | 'download';
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
  // Sync Queue with concurrency control
  private syncQueue: PQueue;
  private poolSize: number;

  // Connection pool for reuse
  private connectionPool: TransferClient[] = [];
  private availableClients: TransferClient[] = [];

  // Main control connection (for listing, watching)
  private client: TransferClient;
  private isConnected = false;
  private mutex: SimpleMutex = new SimpleMutex();

  // Upload progress tracking
  private uploadProgress: Map<string, UploadProgress> = new Map(); // Key: taskId (UUID)

  // Delete queue (can be handled by p-queue too, but maybe separate for now?)
  // keeping delete queue simple for now, or move to p-queue?
  // Let's use p-queue for everything to control concurrency.
  // But delete is fast. Let's keep separate simple queue for deletes if logic is complex, 
  // OR just push delete tasks to syncQueue.
  // Existing delete logic is batch-based. Let's keep it as is for now to minimize risk, 
  // but we must ensure it doesn't conflict with transfers.
  private deleteQueue: Set<string> = new Set();
  private isProcessingDeletes = false;

  private totalFilesInBatch = 0;
  private completedFilesInBatch = 0;

  // Cache for known existing remote directories to avoid redundant checks
  private remoteDirCache: Set<string> = new Set();

  // Watcher
  private watcher: chokidar.FSWatcher | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  // Logs
  private logs: SyncLog[] = [];

  public connectionId: number;
  public config: any;
  public localRoot: string;
  private pendingDownloads: Set<string> = new Set();
  private isSyncing = false;

  constructor(connectionId: number, config: any) {
    this.connectionId = connectionId;
    this.config = config;
    const protocol = this.config.protocol || 'ftp';
    this.client = TransferClientFactory.createClient(protocol, 60000);
    this.pendingDownloads = new Set();

    // Dynamic pool size from config (1-10, default 2)
    this.poolSize = Math.max(1, Math.min(10, config.parallel_connections || 2));

    // Initialize PQueue
    this.syncQueue = new PQueue({ concurrency: this.poolSize });

    this.connectionPool = [];

    // DEBUG: Log config to understand why local_path is ignored
    console.log(`[SyncService] Init Connection ${connectionId}`, {
      local_path: this.config.local_path,
      id_type: typeof connectionId
    });

    if (this.config.local_path && this.config.local_path.trim() !== '') {
      this.localRoot = this.config.local_path.replace(/^['"]|['"]$/g, '');
    } else {
      this.localRoot = path.resolve(process.cwd(), 'sync_data', this.connectionId.toString().replace(/^['"]|['"]$/g, ''));
    }
  }

  // Get a free client (or create new one)
  private async acquireClient(): Promise<TransferClient> {
    // Check available pool clients - skip checkConnection for recently-used ones (< 30s idle)
    while (this.availableClients.length > 0) {
      const entry = this.availableClients.shift()! as any;
      const client: TransferClient = entry.client || entry;
      const lastUsed: number = entry.lastUsed || 0;
      const idleSeconds = (Date.now() - lastUsed) / 1000;

      // If used within last 30s, assume still alive (skip network ping)
      if (idleSeconds < 30) {
        if (!client.closed) return client;
        // closed while in pool - discard and try next
        try { client.close(); } catch { }
        this.removeClient(client);
        continue;
      }

      // Idle > 30s: do a quick check to verify still alive
      try {
        if (await client.checkConnection()) return client;
      } catch { }

      try { client.close(); } catch { }
      this.removeClient(client);
    }

    // Need to create a new connection
    if (this.connectionPool.length >= this.poolSize) {
      // Pool full but all busy - wait a tiny bit and retry (should be rare)
      await new Promise(r => setTimeout(r, 50));
      return this.acquireClient();
    }

    const protocol = this.config.protocol || 'ftp';
    const client = TransferClientFactory.createClient(protocol, 60000);

    const password = decrypt(this.config.password_hash);
    if (!password) throw new Error('Cannot decrypt password');

    // Small jitter to avoid thundering herd
    await new Promise(r => setTimeout(r, Math.random() * 100));

    await client.connect({
      host: this.config.server,
      username: this.config.username,
      password: password,
      port: this.config.port || (this.config.protocol === 'sftp' ? 22 : 21),
      secure: this.config.secure ? true : false,
      secureOptions: this.config.secure ? {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      } : undefined,
      privateKey: this.config.private_key
    });

    this.connectionPool.push(client);
    return client;
  }

  private removeClient(client: TransferClient) {
    const index = this.connectionPool.indexOf(client);
    if (index !== -1) {
      this.connectionPool.splice(index, 1);
    }
    // Also remove from available
    this.availableClients = this.availableClients.filter((e: any) => {
      const c = e.client || e;
      return c !== client;
    }) as any;
  }

  private releaseClient(client: TransferClient) {
    if (client && !client.closed) {
      // Store with timestamp so acquireClient can skip checkConnection for fresh clients
      (this.availableClients as any).push({ client, lastUsed: Date.now() });
    }
  }

  // Add file to queue
  private async queueFileForUpload(localPath: string): Promise<void> {
    if (await shouldIgnore(this.localRoot, localPath)) {
      this.log('info', `Ignored (upload): ${path.basename(localPath)}`);
      return;
    }

    this.totalFilesInBatch++;
    this.log('info', `Queued: ${path.basename(localPath)}`);

    // Add to p-queue and return the promise so we can await it if needed
    return this.syncQueue.add(async () => {
      // Double check existence before start (in case deleted while in queue)
      if (!fs.existsSync(localPath)) return;
      await this.uploadFile(localPath);
    });
  }

  // New upload task (replaces processUploadQueue logic)
  private async uploadFile(localPath: string, retryCount = 0) {
    const filename = path.basename(localPath);
    const startTime = Date.now();
    const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    let client: TransferClient | null = null;

    try {
      if (!fs.existsSync(localPath)) {
        this.log('error', `File not found: ${filename}`);
        return;
      }

      const stats = await fs.stat(localPath);
      const totalBytes = stats.size;

      // Acquire Client
      client = await this.acquireClient();

      // Initialize progress
      this.uploadProgress.set(taskId, {
        type: 'upload',
        filename,
        totalBytes,
        bytesTransferred: 0,
        percent: 0,
        speedMBps: 0,
        etaSeconds: 0,
        startTime
      });

      // Throttled progress tracking
      let lastProgressUpdate = 0;
      client.trackProgress((info) => {
        const now = Date.now();
        if (now - lastProgressUpdate < 200) return;
        lastProgressUpdate = now;

        const elapsed = (now - startTime) / 1000;
        const speedBps = elapsed > 0 ? info.bytes / elapsed : 0;
        const speedMBps = speedBps / (1024 * 1024);
        const percent = totalBytes > 0 ? Math.round((info.bytes / totalBytes) * 100) : 0;
        const remainingBytes = totalBytes - info.bytes;

        this.uploadProgress.set(taskId, {
          type: 'upload',
          filename,
          totalBytes,
          bytesTransferred: info.bytes,
          percent,
          speedMBps: Math.round(speedMBps * 100) / 100,
          etaSeconds: speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0,
          startTime
        });
      });

      const remotePath = this.toRemotePath(localPath, this.localRoot);
      const remoteDir = path.posix.dirname(remotePath);

      // Check dir cache
      if (!this.remoteDirCache.has(remoteDir)) {
        await client.ensureDir(remoteDir);
        this.remoteDirCache.add(remoteDir);
      }

      // Conflict Resolution
      const conflictResolution = this.config.conflict_resolution || 'overwrite';
      let shouldUpload = true;
      let skipReason = '';

      if (conflictResolution !== 'overwrite') {
        try {
          const remoteStats = await client.stat(remotePath);
          if (remoteStats) {
            if (conflictResolution === 'newer') {
              const remoteTime = remoteStats.modifiedAt ? remoteStats.modifiedAt.getTime() : 0;
              if (stats.mtime.getTime() <= remoteTime + 2000) {
                shouldUpload = false;
                skipReason = 'Remote newer/same';
              }
            } else if (conflictResolution === 'different_size') {
              if (remoteStats.size === stats.size) {
                shouldUpload = false;
                skipReason = 'Same size';
              }
            }
          }
        } catch { }
      }

      if (shouldUpload) {
        const bufferSizeMB = this.config.buffer_size || 16;
        const readStream = fs.createReadStream(localPath, {
          highWaterMark: bufferSizeMB * 1024 * 1024
        });
        await client.uploadFrom(readStream, remotePath);
        this.log('success', `Uploaded: ${filename}`);

        try { await this.recordTransfer(stats.size, 'upload'); } catch { }
      } else {
        this.log('info', `Skipped: ${filename} (${skipReason})`);
      }

    } catch (err: any) {
      this.log('error', `Failed: ${filename} - ${err.message}`);
      // Aggressive Cleanup: On ANY error, assume the worst and drop the client
      if (client) {
        try { client.close(); } catch { }
        this.removeClient(client);
        client = null; // Mark null so it isn't released back to pool
      }

      // Auto-retry on 425, 421 (Too many connections), 530 (Login limit), or Connection Closed errors
      if (retryCount < 5 && (
        err.code === 425 ||
        err.code === 421 ||
        err.code === 530 ||
        err.message.includes('425') ||
        err.message.includes('421') ||
        err.message.includes('530') ||
        err.message.includes('closed') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('FIN packet unexpectedly') ||
        err.message.includes('Operation not permitted')
      )) {
        const delay = 1000 + Math.random() * 2000;
        this.log('info', `Retrying ${filename} due to error (Attempt ${retryCount + 2}/5) in ${Math.round(delay)}ms...`);

        // Force cleanup
        if (client) {
          client.trackProgress(); // Clear listener
          try { client.close(); } catch { }
          this.removeClient(client);
          client = null; // Prevent finally from releasing it
        }
        this.uploadProgress.delete(taskId);

        // Add random delay to avoid Thundering Herd on server limits
        await new Promise(resolve => setTimeout(resolve, delay));

        // IMPORTANT: Don't increment completedFilesInBatch here - let the retry handle it
        // We use a separate call that bypasses the finally increment
        await this.uploadFile(localPath, retryCount + 1);
        return; // Return without going through finally's increment
      }
    } finally {
      if (client) {
        client.trackProgress(); // Clear listener
        this.releaseClient(client);
      }
      this.uploadProgress.delete(taskId);

      // Only increment if this is not a retry attempt (retryCount 0 means first attempt)
      // For retries, the final successful attempt will increment
      if (retryCount === 0 || this.completedFilesInBatch < this.totalFilesInBatch) {
        this.completedFilesInBatch++;
      }

      // Cap completedFiles to never exceed totalFiles
      if (this.completedFilesInBatch > this.totalFilesInBatch && this.totalFilesInBatch > 0) {
        this.completedFilesInBatch = this.totalFilesInBatch;
      }

      // Only reset counters when all queued work is done AND completed equals total
      // This prevents premature reset during folder scanning
      if (this.syncQueue.pending === 0 && this.syncQueue.size === 0 &&
        this.completedFilesInBatch >= this.totalFilesInBatch && this.totalFilesInBatch > 0) {
        // Delay reset slightly to allow frontend to see 100% state
        setTimeout(() => {
          if (this.syncQueue.pending === 0 && this.syncQueue.size === 0) {
            this.totalFilesInBatch = 0;
            this.completedFilesInBatch = 0;
          }
        }, 2000);
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

    // Only check/create directory if not in cache
    if (!this.remoteDirCache.has(remoteDir)) {
      await this.client.ensureDir(remoteDir);
      this.remoteDirCache.add(remoteDir);
    }

    // Conflict Resolution Logic
    const conflictResolution = this.config.conflict_resolution || 'overwrite';
    if (conflictResolution !== 'overwrite') {
      try {
        const remoteStats = await this.client.stat(remotePath);
        if (remoteStats) {
          const stats = await fs.stat(localPath);
          if (conflictResolution === 'newer') {
            const remoteTime = remoteStats.modifiedAt ? remoteStats.modifiedAt.getTime() : 0;
            if (stats.mtime.getTime() <= remoteTime + 2000) {
              this.log('info', `Skipped: ${path.basename(localPath)} (Remote is newer/same)`);
              return;
            }
          } else if (conflictResolution === 'different_size') {
            if (remoteStats.size === stats.size) {
              this.log('info', `Skipped: ${path.basename(localPath)} (Same size)`);
              return;
            }
          }
        }
      } catch (e) { /* ignore stat error */ }
    }

    // Use stream with configurable buffer for maximum throughput
    const bufferSizeMB = this.config.buffer_size || 16;
    const readStream = fs.createReadStream(localPath, {
      highWaterMark: bufferSizeMB * 1024 * 1024 // Buffer size in MB from config
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
    if (this.isConnected && await this.client.checkConnection()) {
      return; // Already connected and valid
    }

    // Close old connection if any
    try {
      if (!this.client.closed) {
        this.client.close();
      }
    } catch { }

    // Create fresh client
    const protocol = this.config.protocol || 'ftp';
    this.client = TransferClientFactory.createClient(protocol, 60000);

    const password = decrypt(this.config.password_hash);
    if (!password) throw new Error('Cannot decrypt password');

    this.log('info', `Connecting to ${this.config.server}...`);

    await this.client.connect({
      host: this.config.server,
      username: this.config.username,
      password: password,
      port: this.config.port || (this.config.protocol === 'sftp' ? 22 : 21),
      secure: this.config.secure ? true : false,
      secureOptions: this.config.secure ? {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      } : undefined,
      privateKey: this.config.private_key
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
      queueLength: this.syncQueue.size,
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

        ignored: [
          /(^|[\/\\])\.git([\/\\]|$)/,
          /(^|[\/\\])\.svn([\/\\]|$)/,
          ...(this.config.exclude_paths || '')
            .split(/[\n,]/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)
            .map((s: string) => s.includes('*') ? s : `**/${s}/**`)
        ],
        persistent: true,
        ignoreInitial: true,
        usePolling: this.config.force_polling || false, // Only poll if explicitly requested in config
        interval: 2000,
        binaryInterval: 3000,
        awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 500 }
      });

      this.watcher
        .on('add', p => this.handleLocalChange(p, this.localRoot))
        .on('change', p => this.handleLocalChange(p, this.localRoot))
        .on('unlink', p => this.handleLocalDelete(p, this.localRoot));

      this.log('success', `Local watcher started (Using Exclude Paths from config)`);
    }

    // 2. Initial Sync & Interval (Remote -> Local)
    if (mode === 'bi_directional') {
      this.runSyncCycle(this.localRoot);
      this.intervalTimer = setInterval(() => this.runSyncCycle(this.localRoot), 60000);
      this.log('success', 'Bi-directional polling started');
    } else if (mode === 'download_only') {
      this.log('success', 'Download-only mode active. Auto-sync disabled.');
      // One-time scan disabled per user request.
      // Session remains active for manual operations.
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

    // Close all pool clients
    for (const client of this.connectionPool) {
      try {
        if (!client.closed) client.close();
      } catch { }
    }
    this.connectionPool = [];
    this.availableClients = [];

    this.log('info', 'Sync session stopped');
  }

  private toRemotePath(localPath: string, localRoot: string) {
    const relative = path.relative(localRoot, localPath);
    const remoteRoot = this.config.target_directory || '/';
    return path.posix.join(remoteRoot, relative.split(path.sep).join('/'));
  }

  public async manualUpload(localFilename: string, remoteName?: string) {
    // Use pool client instead of main client to allow parallelism
    const localPath = path.join(this.localRoot, localFilename);
    const filename = path.basename(localPath);
    let client: TransferClient | null = null;
    let retryCount = 0;

    const performUpload = async (): Promise<void> => {
      let taskId: string | undefined;
      try {
        if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`);

        client = await this.acquireClient();

        // Progress Tracking Setup
        // Progress Tracking Setup
        taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const startTime = Date.now();
        const totalBytes = fs.statSync(localPath).size;

        this.uploadProgress.set(taskId, {
          type: 'upload',
          filename: localFilename,
          totalBytes,
          bytesTransferred: 0,
          percent: 0,
          speedMBps: 0,
          etaSeconds: 0,
          startTime
        });

        let lastProgressUpdate = 0;
        client.trackProgress((info) => {
          const now = Date.now();
          if (now - lastProgressUpdate < 200) return;
          lastProgressUpdate = now;

          const elapsed = (now - startTime) / 1000;
          const speedBps = elapsed > 0 ? info.bytes / elapsed : 0;
          const speedMBps = speedBps / (1024 * 1024);
          const percent = totalBytes > 0 ? Math.round((info.bytes / totalBytes) * 100) : 0;
          const remainingBytes = totalBytes - info.bytes;

          this.uploadProgress.set(taskId, {
            type: 'upload',
            filename: localFilename,
            totalBytes,
            bytesTransferred: info.bytes,
            percent,
            speedMBps: Math.round(speedMBps * 100) / 100,
            etaSeconds: speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0,
            startTime
          });
        });

        // Use remoteName if provided, otherwise use localFilename
        const effectiveRemoteName = (remoteName || localFilename).replace(/\\/g, '/');
        const remotePath = path.posix.join(
          this.config.target_directory || '/',
          effectiveRemoteName
        );
        const remoteDir = path.posix.dirname(remotePath);

        if (!this.remoteDirCache.has(remoteDir)) {
          await client.ensureDir(remoteDir);
          this.remoteDirCache.add(remoteDir);
        }

        const bufferSizeMB = this.config.buffer_size || 16;
        const readStream = fs.createReadStream(localPath, {
          highWaterMark: bufferSizeMB * 1024 * 1024
        });
        await client.uploadFrom(readStream, remotePath);

        try {
          const stats = fs.statSync(localPath);
          await this.recordTransfer(stats.size, 'upload');
        } catch { }
        this.log('success', `Manual Upload: ${localFilename}${remoteName ? ` -> ${remoteName}` : ''}`);

      } catch (err: any) {
        this.log('error', `Manual upload failed: ${err.message}`);

        if (client) {
          try { client.close(); } catch { }
          this.removeClient(client);
          client = null;
        }

        // Retry Logic
        if (retryCount < 3 && (
          err.code === 425 || err.code === 421 || err.code === 530 ||
          err.message.includes('425') || err.message.includes('421') ||
          err.message.includes('530') || err.message.includes('closed') ||
          err.message.includes('ECONNRESET') || err.message.includes('FIN packet unexpectedly') || err.message.includes('Operation not permitted')
        )) {
          retryCount++;
          const delay = 1000 + Math.random() * 2000;
          this.log('info', `Retrying manual upload ${filename} (Attempt ${retryCount}) in ${Math.round(delay)}ms...`);
          await new Promise(r => setTimeout(r, delay));
          return performUpload();
        }

        throw err;
      } finally {
        // Cleanup progress
        if (taskId) this.uploadProgress.delete(taskId);
        if (client) {
          client.trackProgress(); // Clear listener
          this.releaseClient(client);
        }
      }
    };

    return performUpload();
  }

  public async manualDownload(remoteFilePath: string) {
    let client: TransferClient | null = null;
    let retryCount = 0;

    const performDownload = async (): Promise<void> => {
      let taskId: string | undefined;
      try {
        client = await this.acquireClient();

        // Progress Tracking Setup
        // Progress Tracking Setup
        taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const startTime = Date.now();
        // For download, we might need to get remote size first for percentage
        let totalBytes = 0;
        try {
          const stats = await client.stat(remoteFilePath);
          totalBytes = stats.size;
        } catch { }

        this.uploadProgress.set(taskId, {
          type: 'download',
          filename: path.basename(remoteFilePath),
          totalBytes,
          bytesTransferred: 0,
          percent: 0,
          speedMBps: 0,
          etaSeconds: 0,
          startTime
        });

        let lastProgressUpdate = 0;
        client.trackProgress((info) => {
          const now = Date.now();
          if (now - lastProgressUpdate < 200) return;
          lastProgressUpdate = now;

          const elapsed = (now - startTime) / 1000;
          const speedBps = elapsed > 0 ? info.bytes / elapsed : 0;
          const speedMBps = speedBps / (1024 * 1024);
          const percent = totalBytes > 0 ? Math.round((info.bytes / totalBytes) * 100) : 0;
          const remainingBytes = totalBytes - info.bytes;

          this.uploadProgress.set(taskId, {
            type: 'download',
            filename: path.basename(remoteFilePath),
            totalBytes,
            bytesTransferred: info.bytes,
            percent,
            speedMBps: Math.round(speedMBps * 100) / 100,
            etaSeconds: speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0,
            startTime
          });
        });

        const remoteRoot = this.config.target_directory || '/';

        // Manual path resolution instead of path.posix.relative
        const normalizePath = (p: string) => p.replace(/\\/g, '/');
        const normRemotePath = normalizePath(remoteFilePath);
        const normRemoteRoot = normalizePath(remoteRoot);

        let relPath = '';
        if (normRemoteRoot === '/' || normRemoteRoot === '') {
          relPath = normRemotePath.startsWith('/') ? normRemotePath.substring(1) : normRemotePath;
        } else if (normRemotePath.startsWith(normRemoteRoot)) {
          relPath = normRemotePath.substring(normRemoteRoot.length);
          if (relPath.startsWith('/')) relPath = relPath.substring(1);
        } else {
          relPath = path.basename(remoteFilePath);
        }

        const localPath = path.join(this.localRoot, relPath.split('/').join(path.sep));

        await fs.ensureDir(path.dirname(localPath));
        await client.downloadTo(localPath, remoteFilePath);
        this.log('success', `Manual Download: ${path.basename(remoteFilePath)}`);

        try {
          const stats = fs.statSync(localPath);
          await this.recordTransfer(stats.size, 'download');
        } catch { }

      } catch (err: any) {
        this.log('error', `Manual download failed: ${err.message}`);

        if (client) {
          try { client.close(); } catch { }
          this.removeClient(client);
          client = null;
        }

        // Retry Logic
        if (retryCount < 3 && (
          err.code === 425 || err.code === 421 || err.code === 530 ||
          err.message.includes('425') || err.message.includes('421') ||
          err.message.includes('530') || err.message.includes('closed') ||
          err.message.includes('ECONNRESET') || err.message.includes('FIN packet unexpectedly') || err.message.includes('Operation not permitted')
        )) {
          retryCount++;
          const delay = 1000 + Math.random() * 2000;
          this.log('info', `Retrying manual download ${path.basename(remoteFilePath)} (Attempt ${retryCount}) in ${Math.round(delay)}ms...`);
          await new Promise(r => setTimeout(r, delay));
          return performDownload();
        }

        throw err;
      } finally {
        // Cleanup progress
        if (taskId) this.uploadProgress.delete(taskId);
        if (client) {
          client.trackProgress();
          this.releaseClient(client);
        }
      }
    };

    return performDownload();
  }

  private async handleLocalChange(localPath: string, localRoot: string) {
    // Check if .ftpignore file changed - clear cache
    if (path.basename(localPath) === '.ftpignore') {
      clearIgnoreCache(this.localRoot);
      this.log('info', 'Reloaded .ftpignore patterns');
      return;
    }

    // Simply add file to batch queue - it will be uploaded with other files
    await this.queueFileForUpload(localPath);
  }

  // Queue file for deletion - process immediately (realtime mode)
  private async queueFileForDelete(localPath: string, localRoot: string) {
    if (!this.config.sync_deletions) return;

    // Check if file should be ignored
    if (await shouldIgnore(this.localRoot, localPath)) {
      this.log('info', `Ignored (delete): ${path.basename(localPath)}`);
      return;
    }

    this.deleteQueue.add(JSON.stringify({ localPath, localRoot }));
    this.log('info', `Queued delete: ${path.basename(localPath)}`);

    // Add delete task to main syncQueue to respect global concurrency
    this.syncQueue.add(() => this.processSingleDelete(localPath, localRoot));
  }

  // Process a single delete (wrapped in syncQueue)
  private async processSingleDelete(localPath: string, localRoot: string) {
    const filename = path.basename(localPath);
    let client: TransferClient | null = null;
    try {
      client = await this.acquireClient();
      const remotePath = this.toRemotePath(localPath, localRoot);
      await client.remove(remotePath);
      this.log('success', `Deleted: ${filename}`);
    } catch (err: any) {
      // 550 = File not found (already deleted?), that's a success for us
      if (err.code === 550 || err.message.includes('No such file')) {
        this.log('success', `Deleted (Not found): ${filename}`);
      } else {
        this.log('error', `Delete failed: ${filename} - ${err.message}`);
        // Retry once? Or just let it fail. For built files, usually re-upload happens anyway.
        // If error is connection related, maybe we should retry.
        if (err.message.includes('closed') || err.message.includes('FIN')) {
          throw err; // Allow P-Queue or retry logic if we had it?
        }
      }
    } finally {
      if (client) {
        // Don't release if error? 
        // acquireClient logic handles errors by creating new ones if pool is empty/bad.
        // But here we must be careful not to return bad client.
        // Let's rely on acquireClient to check viability next time.
        this.releaseClient(client);
      }
      // Remove from set
      this.deleteQueue.delete(JSON.stringify({ localPath, localRoot }));
    }
  }

  // Deprecated batch processor
  private async processDeleteQueue() {
    return;
    // Logic moved to single task via syncQueue
  }

  private async handleLocalDelete(localPath: string, localRoot: string) {
    await this.queueFileForDelete(localPath, localRoot);
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
      // 1. List Files
      const remoteRoot = this.config.target_directory || '/';
      let remoteFiles: any[] = [];

      // Use mutex for listing (handled internally by listRemoteFilesUnified per directory)
      // This allows Visual Diff to interleave requests between directory scans
      await this.ensureConnection();
      remoteFiles = await this.listRemoteFilesUnified(remoteRoot);

      let downloadCount = 0;

      for (const file of remoteFiles) {
        // INTERLEAVING POINT: We release mutex here so user actions can squeeze in.

        const relPath = path.posix.relative(remoteRoot, file.path);
        const localPath = path.join(localRoot, relPath.split('/').join(path.sep));

        // ... (ignore check logic unchanged) ...
        if (await shouldIgnore(localRoot, localPath)) {
          continue;
        }

        let shouldDownload = false;

        if (!fs.existsSync(localPath)) {
          shouldDownload = true;
        } else {
          // ... (time check logic unchanged) ...
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
          this.pendingDownloads.add(localPath);

          try {
            // ACQUIRE MUTEX FOR DOWNLOAD
            await this.mutex.run(async () => {
              await this.ensureConnection(); // Ensure just in case
              await this.client.downloadTo(localPath, file.path);
            });

            downloadCount++;
            this.recordTransfer(file.size, 'download');
            this.log('success', `Downloaded: ${file.name}`);
          } catch (err: any) {
            this.pendingDownloads.delete(localPath);
            throw err;
          }

          setTimeout(() => this.pendingDownloads.delete(localPath), 5000);
        }
      }

      if (downloadCount === 0) {
        this.log('info', 'Sync scan complete. No new files.');
      } else {
        this.log('success', `Sync scan complete. Downloaded ${downloadCount} files.`);
      }

    } catch (err: any) {
      // If error (e.g. connection lost), we mark unconnected so next retry reconnects
      this.isConnected = false;
      this.log('error', `Sync scan error: ${err.message}`);
    } finally {
      this.isSyncing = false;
      // If we finished a sync cycle and have pending uploads that were blocked by suspension (though runSyncCycle shouldn't run if suspended),
      // we might want to check queue. But usually runSyncCycle is for downloads.
    }
  }

  // Replaced listRemoteFilesPolling with Unified version
  private async listRemoteFilesUnified(dir: string): Promise<any[]> {
    let files: any[] = [];
    let retryCount = 0;

    while (retryCount < 3) {
      try {
        // Acquire lock ONLY for the directory listing, then release it
        const list = await this.mutex.run(async () => {
          await this.ensureConnection();
          return this.client.list(dir);
        });

        for (const item of list) {
          const itemPath = path.posix.join(dir, item.name);

          // Optimization: Check ignore patterns before recursing into directories
          // Calculate local equivalent path to check against ignore service
          const relPath = path.posix.relative(this.config.target_directory || '/', itemPath);
          const localPath = path.join(this.localRoot, relPath.split('/').join(path.sep));

          if (await shouldIgnore(this.localRoot, localPath)) {
            continue;
          }

          if (item.isDirectory) {
            const subFiles = await this.listRemoteFilesUnified(itemPath);
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
        return files; // Success
      } catch (err: any) {
        retryCount++;
        this.log('error', `List failed for ${dir}: ${err.message}. Retrying (${retryCount}/3)...`);
        this.isConnected = false;
        try { if (this.client) this.client.close(); } catch { }

        if (retryCount >= 3) {
          this.log('error', `List failed permanently for ${dir}`);
          return []; // Return empty on permanent failure to avoid crash
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return files;
  }

  // Unified Interactive Listing
  public async listRemoteFilesInteractive(dir: string): Promise<any[]> {
    return this.mutex.run(async () => {
      await this.ensureConnection();
      return this.client.list(dir);
    });
  }


  // --- Bulk Sync Implementation ---

  // Pre-warm the connection pool so all slots are ready before transfers start
  public async warmConnectionPool() {
    const warmCount = Math.min(this.poolSize, 5); // Warm up to poolSize connections
    this.log('info', `Pre-warming ${warmCount} connections...`);
    const warmTasks = Array.from({ length: warmCount }, async (_, i) => {
      try {
        // Stagger slightly to avoid hitting server all at once
        await new Promise(r => setTimeout(r, i * 80));
        const client = await this.acquireClient();
        this.releaseClient(client); // Return to pool immediately
      } catch (e: any) {
        this.log('error', `Pool warm-up failed for slot ${i}: ${e.message}`);
      }
    });
    await Promise.all(warmTasks);
    this.log('info', `Connection pool ready (${this.availableClients.length} connections)`);
  }

  public async processBulkSync(items: { path: string, localName?: string | null, direction: 'upload' | 'download', isDirectory: boolean }[], basePath: string) {
    this.log('info', `Starting bulk sync of ${items.length} items (Pool size: ${this.poolSize})...`);

    // Pre-warm connection pool so transfers start immediately without cold-start delay
    await this.warmConnectionPool();

    // Group by action to optimize
    const uploads = items.filter(i => i.direction === 'upload');
    const downloads = items.filter(i => i.direction === 'download');

    // Process Uploads - queue ALL files immediately, let PQueue manage concurrency
    // CRITICAL: Do NOT await queueFileForUpload - it waits for the whole upload to finish!
    const queuePromises: Promise<void>[] = [];
    for (const item of uploads) {
      const localFileName = item.localName || item.path;
      const fullPath = path.join(this.localRoot, basePath === '/' ? '' : basePath, localFileName);

      if (item.isDirectory) {
        // queueDirectoryUpload returns after scanning & queuing (non-blocking)
        queuePromises.push(this.queueDirectoryUpload(fullPath));
      } else {
        // Queue the file WITHOUT awaiting the transfer itself
        this.totalFilesInBatch++;
        this.log('info', `Queued: ${path.basename(fullPath)}`);
        this.syncQueue.add(async () => {
          if (!fs.existsSync(fullPath)) return;
          await this.uploadFile(fullPath);
        });
      }
    }
    // Wait for all directory scans to complete (they queue their own files internally)
    await Promise.all(queuePromises);

    // Process Downloads in parallel batches (matching pool size for max throughput)
    const remoteRoot = this.config.target_directory || '/';
    const downloadTasks = downloads.map(item => async () => {
      const relPath = path.posix.join(basePath === '/' ? '' : basePath, item.path);
      const remotePath = path.posix.join(remoteRoot, relPath);
      try {
        if (item.isDirectory) {
          await this.downloadDirectory(remotePath);
        } else {
          await this.manualDownload(remotePath);
        }
      } catch (e: any) {
        this.log('error', `Bulk download failed for ${item.path}: ${e.message}`);
      }
    });

    const batchSize = Math.max(1, this.poolSize);
    for (let i = 0; i < downloadTasks.length; i += batchSize) {
      await Promise.all(downloadTasks.slice(i, i + batchSize).map(t => t()));
    }
  }

  private async queueDirectoryUpload(localDirPath: string) {
    if (!fs.existsSync(localDirPath)) return;

    try {
      const items = await fs.readdir(localDirPath);
      this.log('info', `Scanning folder: ${path.basename(localDirPath)} (${items.length} items)...`);
      
      // Process all items in parallel for faster scanning
      const queuePromises: Promise<void>[] = [];
      
      for (const item of items) {
        const itemPath = path.join(localDirPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          // Recursively queue subdirectory (await to ensure all files are counted)
          queuePromises.push(this.queueDirectoryUpload(itemPath));
        } else {
          // Queue file WITHOUT awaiting - just add to PQueue
          this.queueFileForUploadNonBlocking(itemPath);
        }
      }
      
      // Wait for all subdirectory scans to complete
      await Promise.all(queuePromises);
      this.log('info', `Finished scanning: ${path.basename(localDirPath)}`);
    } catch (err: any) {
      this.log('error', `Failed to queue directory ${path.basename(localDirPath)}: ${err.message}`);
    }
  }

  // Non-blocking version that doesn't return the upload promise
  private queueFileForUploadNonBlocking(localPath: string): void {
    // Check ignore patterns synchronously if possible, or skip check for speed
    // For now, we'll do async check but not await it
    shouldIgnore(this.localRoot, localPath).then(ignored => {
      if (ignored) {
        this.log('info', `Ignored (upload): ${path.basename(localPath)}`);
        return;
      }

      this.totalFilesInBatch++;
      this.log('info', `Queued: ${path.basename(localPath)}`);

      // Add to p-queue but DON'T return the promise
      this.syncQueue.add(async () => {
        if (!fs.existsSync(localPath)) return;
        await this.uploadFile(localPath);
      });
    });
  }

  private async downloadDirectory(remoteDirPath: string) {
    this.log('info', `Downloading directory: ${path.basename(remoteDirPath)}...`);
    try {
      let files: any[] = [];
      // listRemoteFilesUnified handles its own locking per-directory
      files = await this.listRemoteFilesUnified(remoteDirPath);

      this.log('info', `Found ${files.length} files in ${path.basename(remoteDirPath)}`);

      // Queue all files for parallel download instead of sequential
      // Each file will be processed by PQueue with concurrency control
      const downloadPromises = files.map(file => 
        this.syncQueue.add(async () => {
          try {
            await this.manualDownload(file.path);
          } catch (e: any) {
            this.log('error', `Failed to download file ${file.name}: ${e.message}`);
          }
        })
      );

      // Wait for all downloads to complete
      await Promise.all(downloadPromises);
    } catch (err: any) {
      this.log('error', `Failed to download directory ${path.basename(remoteDirPath)}: ${err.message}`);
    }
  }

  public async getContentDiff(localFilename: string, remoteName?: string): Promise<{ local: string | null, remote: string | null }> {
    return this.mutex.run(async () => {
      await this.ensureConnection();

      const localPath = path.join(this.localRoot, localFilename);
      const effectiveRemoteName = (remoteName || localFilename).replace(/\\/g, '/');
      const remoteRoot = this.config.target_directory || '/';
      const remotePath = path.posix.join(remoteRoot, effectiveRemoteName);

      let localContent: string | null = null;
      let remoteContent: string | null = null;

      // Read Local
      try {
        if (fs.existsSync(localPath)) {
          // Check size to avoid killing server
          const stats = fs.statSync(localPath);
          if (stats.size > 1024 * 1024 * 5) { // 5MB limit
            localContent = "File too large to display ( > 5MB )";
          } else {
            localContent = await fs.readFile(localPath, 'utf8');
          }
        }
      } catch (err) {
        localContent = null;
      }

      // Read Remote
      try {
        // We need to download to a buffer
        // basic-ftp doesn't strictly support downloadToBuffer easily without a stream
        // Use a temporary WritableStream implementation
        const chunks: Buffer[] = [];
        const writable = new (require('stream').Writable)({
          write(chunk: any, encoding: any, callback: any) {
            chunks.push(chunk);
            callback();
          }
        });

        await this.client.downloadTo(writable, remotePath);

        const buffer = Buffer.concat(chunks);

        if (buffer.length > 1024 * 1024 * 5) {
          remoteContent = "File too large to display ( > 5MB )";
        } else {
          remoteContent = buffer.toString('utf8');
        }

      } catch (err: any) {
        // If file doesn't exist remotely
        remoteContent = null;
      }

      return { local: localContent, remote: remoteContent };
    });
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

  public clearSession(connectionId: number) {
    // Stop and remove session from cache so next request fetches fresh config
    this.stopSync(connectionId);
  }

  public async manualUpload(connectionId: number, filename: string, remoteName?: string) {
    const session = await this.getSession(connectionId);
    await session.manualUpload(filename, remoteName);
  }

  public async manualDownload(connectionId: number, remotePath: string) {
    const session = await this.getSession(connectionId);
    await session.manualDownload(remotePath);
  }

  public async ensureConnected(connectionId: number) {
    const session = await this.getSession(connectionId);
    await session.warmConnectionPool();
  }

  public async processBulkSync(connectionId: number, items: { path: string, localName?: string | null, direction: 'upload' | 'download', isDirectory: boolean }[], basePath: string) {
    const session = await this.getSession(connectionId);
    await session.processBulkSync(items, basePath);
  }

  public async listRemoteFilesInteractive(connectionId: number, dir: string) {
    const session = await this.getSession(connectionId);
    return session.listRemoteFilesInteractive(dir);
  }

  public async getContentDiff(connectionId: number, filename: string, remoteName?: string) {
    const session = await this.getSession(connectionId);
    return session.getContentDiff(filename, remoteName);
  }

  // Removed suspend/resume exports since we use shared connection
  /* 
  public async suspendSync(connectionId: number) { ... }
  public async resumeSync(connectionId: number) { ... }
  */

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
