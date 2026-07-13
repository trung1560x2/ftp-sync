import { TransferClientFactory } from './transfer/TransferClientFactory.js';
import * as chokidar from 'chokidar';
import path from 'path';
import fs from 'fs-extra';
import PQueue from 'p-queue';
import { decrypt } from '../utils/encryption.js';
import { getDb } from '../db.js';
import { logStore } from './LogStore.js';
import { shouldIgnore, clearIgnoreCache, getIgnoreInstance } from './IgnoreService.js';
import { TransferClient } from './transfer/TransferClient.js';
import { SimpleMutex } from '../utils/SimpleMutex.js';
import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import util from 'util';
import { ConnectionPool } from './transfer/ConnectionPool.js';
import { ProgressTracker, OverallProgress, UploadProgress } from './transfer/ProgressTracker.js';
import { fileURLToPath } from 'url';
import ChecksumVerifier from './ChecksumVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SyncLog {
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
}



class SyncSession {
  // Sync Queue with concurrency control
  private syncQueue: PQueue;
  private poolSize: number;

  // Extracted Connection Pool and Progress Tracker
  private connectionPool: ConnectionPool;
  private progressTracker: ProgressTracker;

  // Main control connection (for listing, watching)
  private client: TransferClient;
  private isConnected = false;
  private mutex: SimpleMutex = new SimpleMutex();

  // Delete queue (can be handled by p-queue too, but maybe separate for now?)
  // keeping delete queue simple for now, or move to p-queue?
  // Let's use p-queue for everything to control concurrency.
  // But delete is fast. Let's keep separate simple queue for deletes if logic is complex, 
  // OR just push delete tasks to syncQueue.
  // Existing delete logic is batch-based. Let's keep it as is for now to minimize risk, 
  // but we must ensure it doesn't conflict with transfers.
  private deleteQueue: Set<string> = new Set();
  private isProcessingDeletes = false;

  // Cache for known existing remote directories to avoid redundant checks
  private remoteDirCache: Set<string> = new Set();

  // Watcher
  private watcher: chokidar.FSWatcher | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  // Logs
  private logs: SyncLog[] = [];

  // Sessionization properties
  private activeSession: any = null;
  private sessionStartTime = 0;
  private sessionCloseTimer: NodeJS.Timeout | null = null;

  public connectionId: number;
  public config: any;
  public localRoot: string;
  private pendingDownloads: Set<string> = new Set();
  private isSyncing = false;
  public isLocalCacheWarmed = false;

  // Properties mapping for backwards compatibility with ProgressTracker
  private get filesUploaded() { return this.progressTracker.filesUploaded; }
  private set filesUploaded(v: number) { this.progressTracker.filesUploaded = v; }

  private get filesSkipped() { return this.progressTracker.filesSkipped; }
  private set filesSkipped(v: number) { this.progressTracker.filesSkipped = v; }

  private get filesDeleted() { return this.progressTracker.filesDeleted; }
  private set filesDeleted(v: number) { this.progressTracker.filesDeleted = v; }

  private get filesFailed() { return this.progressTracker.filesFailed; }
  private set filesFailed(v: number) { this.progressTracker.filesFailed = v; }

  private get totalFilesInBatch() { return this.progressTracker.totalFilesInBatch; }
  private set totalFilesInBatch(v: number) { this.progressTracker.totalFilesInBatch = v; }

  private get completedFilesInBatch() { return this.progressTracker.completedFilesInBatch; }
  private set completedFilesInBatch(v: number) { this.progressTracker.completedFilesInBatch = v; }

  private get batchStartTime() { return this.progressTracker.batchStartTime; }
  private set batchStartTime(v: number) { this.progressTracker.batchStartTime = v; }

  private get uploadProgress() { return this.progressTracker.getUploadProgress(); }

  private recordWindowBytes(bytes: number, type: 'upload' | 'download') {
    this.progressTracker.recordWindowBytes(bytes, type);
  }

  private getWindowSpeed(type: 'upload' | 'download') {
    return this.progressTracker.getWindowSpeed(type);
  }

  public onProgress?: (progress: OverallProgress) => void;

  private notifyProgress() {
    if (this.onProgress) {
      this.onProgress(this.getProgress());
    }
  }

  public getFilesUploaded() { return this.filesUploaded; }
  public getFilesSkipped() { return this.filesSkipped; }
  public getFilesDeleted() { return this.filesDeleted; }
  public getFilesFailed() { return this.filesFailed; }
  public getIsSyncing() { return this.isSyncing || this.syncQueue.pending > 0 || this.syncQueue.size > 0; }
  public getLastSyncStatus() {
    return this.filesFailed > 0 ? 'failed' : 'success';
  }
  public isCacheWarmed(): boolean { return this.isLocalCacheWarmed; }

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

    this.connectionPool = new ConnectionPool(this.connectionId, this.config, this.poolSize, (type, msg) => this.log(type, msg));
    this.progressTracker = new ProgressTracker();

    if (this.config.local_path && this.config.local_path.trim() !== '') {
      this.localRoot = this.config.local_path.replace(/^['"]|['"]$/g, '');
    } else {
      this.localRoot = path.resolve(process.cwd(), 'sync_data', this.connectionId.toString().replace(/^['"]|['"]$/g, ''));
    }
  }

  public async runWithClient<T>(fn: (client: TransferClient) => Promise<T>, isInteractive = false): Promise<T> {
    if (isInteractive) {
      return this.mutex.run(async () => {
        await this.ensureConnection();
        return fn(this.client);
      });
    } else {
      const client = await this.acquireClient();
      try {
        return await fn(client);
      } finally {
        this.releaseClient(client);
      }
    }
  }

  private async updateLocalCache(localPath: string) {
    try {
      const db = await getDb();
      const relPath = path.relative(this.localRoot, localPath).replace(/\\/g, '/');
      const stats = await fs.stat(localPath);
      await db.run(
        `INSERT OR REPLACE INTO local_file_cache 
         (connection_id, rel_path, name, is_directory, size, modified_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        this.connectionId,
        relPath,
        path.basename(localPath),
        stats.isDirectory() ? 1 : 0,
        stats.size,
        stats.mtime.toISOString()
      );
    } catch (err) {
      // Ignore
    }
  }

  private async deleteFromLocalCache(localPath: string) {
    try {
      const db = await getDb();
      const relPath = path.relative(this.localRoot, localPath).replace(/\\/g, '/');
      await db.run(
        'DELETE FROM local_file_cache WHERE connection_id = ? AND rel_path = ?',
        this.connectionId,
        relPath
      );
    } catch (err) {
      // Ignore
    }
  }

  private async getLocalScannerBinaryPath(): Promise<string | null> {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'local_scanner.exe' : 'local_scanner';
    const resourcesPath = (process as any).resourcesPath;

    // 1. Check process.resourcesPath (packaged app with asarUnpack)
    if (resourcesPath) {
      const pathsToTry = [
        path.join(resourcesPath, 'app.asar.unpacked', 'bin', binaryName),
        path.join(resourcesPath, 'bin', binaryName),
        path.join(resourcesPath, binaryName)
      ];
      for (const p of pathsToTry) {
        if (await fs.pathExists(p)) return p;
      }
    }

    // 2. Check relative to compiled output path in dist-server/api/services (3 levels up)
    const devPath1 = path.resolve(__dirname, '..', '..', '..', 'bin', binaryName);
    if (await fs.pathExists(devPath1)) return devPath1;

    // 3. Check relative to TS source path in api/services (2 levels up)
    const devPath2 = path.resolve(__dirname, '..', '..', 'bin', binaryName);
    if (await fs.pathExists(devPath2)) return devPath2;

    // 4. Fallback to process.cwd()
    const devPath3 = path.resolve(process.cwd(), 'bin', binaryName);
    if (await fs.pathExists(devPath3)) return devPath3;

    return null;
  }

  private async scanLocalNonBlocking(currentDir: string, base: string, ig: any, depth = 0): Promise<any[]> {
    if (depth > 8) return [];
    try {
      if (!fs.existsSync(currentDir)) return [];
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      let results: any[] = [];

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(base, fullPath).replace(/\\/g, '/');

        // Check if ignored BEFORE stat'ing or recursing to avoid entering giant directories
        if (ig && ig.ignores(relPath)) {
          continue;
        }

        // Yield to event loop periodically to keep UI responsive
        if (results.length > 0 && results.length % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }

        const isDir = entry.isDirectory();
        let size = 0;
        let modifiedAt = new Date().toISOString();
        
        if (!isDir) {
          try {
            const stat = await fs.stat(fullPath);
            size = stat.size;
            modifiedAt = stat.mtime.toISOString();
          } catch (e) {}
        }

        results.push({
          relPath,
          name: entry.name,
          isDirectory: isDir ? 1 : 0,
          size,
          modifiedAt
        });

        if (isDir) {
          const subResults = await this.scanLocalNonBlocking(fullPath, base, ig, depth + 1);
          results = results.concat(subResults);
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  private async indexLocalFiles() {
    this.log('info', 'Starting local file cache indexing...');
    const tStart = Date.now();
    try {
      const db = await getDb();
      await db.run('DELETE FROM local_file_cache WHERE connection_id = ?', this.connectionId);

      let filesToIndex: Array<{ relPath: string, name: string, isDirectory: number, size: number, modifiedAt: string }> = [];
      const ig = await getIgnoreInstance(this.localRoot);

      // Try Rust scanner first
      try {
        const binaryPath = await this.getLocalScannerBinaryPath();

        if (binaryPath) {
          const ignoredFolders = ['.git', 'node_modules', 'vendor', '.idea', '.vscode', 'storage', 'bootstrap/cache', 'dist', 'build', 'coverage'];
          const ignoredList = ignoredFolders.join(',');
          const args = ['--path', this.localRoot, '--ignored', ignoredList, '--recursive'];

          const execFileAsync = util.promisify(execFile);
          const { stdout } = await execFileAsync(binaryPath, args, { maxBuffer: 20 * 1024 * 1024 });
          const items = JSON.parse(stdout);

          filesToIndex = items.map((item: any) => ({
            relPath: item.relPath,
            name: item.name,
            isDirectory: item.isDirectory ? 1 : 0,
            size: item.size,
            modifiedAt: new Date(item.modifiedAt).toISOString()
          }));
        } else {
          throw new Error('Rust binary not found at any resolved paths');
        }
      } catch (err: any) {
        this.log('info', `Rust local scanner not used, falling back to JS: ${err.message}`);
        filesToIndex = await this.scanLocalNonBlocking(this.localRoot, this.localRoot, ig);
      }

      // Filter files with IgnoreService (final pass for complex ignore rules)
      if (ig) {
        filesToIndex = filesToIndex.filter(file => !ig.ignores(file.relPath));
      }

      // Perform chunked bulk insert for maximum speed and non-blocking operation
      if (filesToIndex.length > 0) {
        await db.run('BEGIN TRANSACTION');
        try {
          const chunkSize = 100;
          for (let i = 0; i < filesToIndex.length; i += chunkSize) {
            const chunk = filesToIndex.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const query = `INSERT OR REPLACE INTO local_file_cache 
              (connection_id, rel_path, name, is_directory, size, modified_at) 
              VALUES ${placeholders}`;
            
            const params: any[] = [];
            for (const file of chunk) {
              params.push(
                this.connectionId,
                file.relPath,
                file.name,
                file.isDirectory,
                file.size,
                file.modifiedAt
              );
            }
            await db.run(query, ...params);
            
            // Yield periodically to let event loop breathe between chunks
            await new Promise(resolve => setImmediate(resolve));
          }
          await db.run('COMMIT');
        } catch (err) {
          await db.run('ROLLBACK');
          throw err;
        }
      }

      this.isLocalCacheWarmed = true;
      this.log('success', `Local file cache indexed successfully (${filesToIndex.length} items in ${Date.now() - tStart}ms)`);
    } catch (err: any) {
      this.log('error', `Local file cache indexing failed: ${err.message}`);
    }
  }

  private async acquireClient(): Promise<TransferClient> {
    return this.connectionPool.acquire();
  }

  private removeClient(client: TransferClient) {
    this.connectionPool.remove(client);
  }

  private releaseClient(client: TransferClient) {
    this.connectionPool.release(client);
  }

  // Add file to queue
  private async queueFileForUpload(localPath: string): Promise<void> {
    if (await shouldIgnore(this.localRoot, localPath)) {
      this.log('info', `Ignored (upload): ${path.basename(localPath)}`);
      return;
    }

    this.totalFilesInBatch++;
    this.notifyProgress();
    this.log('info', `Queued: ${path.basename(localPath)}`);

    try {
      const stats = await fs.stat(localPath);
      await this.addToQueueDb(localPath, 'upload', stats.size);
    } catch (e) {}

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
    let offset = 0;
    const remotePath = this.toRemotePath(localPath, this.localRoot);

    this.startSession();
    try {
      if (!fs.existsSync(localPath)) {
        this.log('error', `File not found: ${filename}`);
        this.addFileToSession(filename, remotePath, 0, 'upload', 'failed', 'File not found locally');
        return;
      }

      const stats = await fs.stat(localPath);
      const totalBytes = stats.size;

      // Ensure task is recorded in DB queue
      const db = await getDb();
      const queuedTask = await db.get(
        'SELECT status, bytes_transferred FROM sync_transfer_queue WHERE connection_id = ? AND file_path = ?',
        this.connectionId,
        localPath
      );

      if (!queuedTask) {
        await this.addToQueueDb(localPath, 'upload', totalBytes);
      } else if (queuedTask.status === 'interrupted') {
        // If it was interrupted, we will check if we can resume
        await this.updateQueueStatusDb(localPath, 'syncing', queuedTask.bytes_transferred);
      } else {
        await this.updateQueueStatusDb(localPath, 'syncing', 0);
      }

      // Acquire Client
      client = await this.acquireClient();

      const remoteDir = path.posix.dirname(remotePath);

      // Check dir cache
      if (!this.remoteDirCache.has(remoteDir)) {
        await client.ensureDir(remoteDir);
        this.remoteDirCache.add(remoteDir);
      }

      // Check if we should resume (only if it was marked interrupted)
      if (queuedTask && queuedTask.status === 'interrupted') {
        try {
          const remoteStats = await client.stat(remotePath);
          if (remoteStats && remoteStats.size > 0 && remoteStats.size < totalBytes) {
            offset = remoteStats.size;
            this.log('info', `Resuming upload for ${filename} at offset ${offset} bytes (${Math.round((offset/totalBytes)*100)}% done)`);
          }
        } catch (e) {
          // If stat fails, we just upload from the beginning
        }
      }

      // Initialize progress
      this.uploadProgress.set(taskId, {
        type: 'upload',
        filename,
        totalBytes,
        bytesTransferred: offset,
        percent: totalBytes > 0 ? Math.round((offset / totalBytes) * 100) : 0,
        speedMBps: 0,
        etaSeconds: 0,
        startTime
      });
      this.notifyProgress();

      // Throttled progress tracking
      let lastProgressUpdate = 0;
      let lastDbUpdate = Date.now();
      client.trackProgress((info) => {
        const now = Date.now();
        if (now - lastProgressUpdate < 200) return;
        lastProgressUpdate = now;

        const currentTransferred = info.bytes + offset;
        const elapsed = (now - startTime) / 1000;
        const speedBps = elapsed > 0 ? info.bytes / elapsed : 0;
        const speedMBps = speedBps / (1024 * 1024);
        const percent = totalBytes > 0 ? Math.min(100, Math.round((currentTransferred / totalBytes) * 100)) : 0;
        const remainingBytes = Math.max(0, totalBytes - currentTransferred);

        // Record delta to window
        const prevProgress = this.uploadProgress.get(taskId);
        const prevBytes = prevProgress ? prevProgress.bytesTransferred : offset;
        const delta = currentTransferred - prevBytes;
        if (delta > 0) {
          this.recordWindowBytes(delta, 'upload');
        }

        this.uploadProgress.set(taskId, {
          type: 'upload',
          filename,
          totalBytes,
          bytesTransferred: currentTransferred,
          percent,
          speedMBps: Math.round(speedMBps * 100) / 100,
          etaSeconds: speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0,
          startTime
        });
        this.notifyProgress();

        // Throttle database progress updates to every 2 seconds
        if (now - lastDbUpdate > 2000) {
          lastDbUpdate = now;
          this.updateQueueStatusDb(localPath, 'syncing', currentTransferred);
        }
      });

      // Conflict Resolution
      const conflictResolution = this.config.conflict_resolution || 'overwrite';
      let shouldUpload = true;
      let skipReason = '';

      if (offset === 0 && conflictResolution !== 'overwrite') {
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
          start: offset,
          highWaterMark: bufferSizeMB * 1024 * 1024
        });
        await client.uploadFrom(readStream, remotePath, { localStart: offset });

        if (this.config.enable_checksum) {
          this.log('info', `Verifying checksum for ${filename}...`);
          const localHash = await ChecksumVerifier.computeLocalHash(localPath);
          const remoteHash = await ChecksumVerifier.computeRemoteHash(client, remotePath);
          if (localHash !== remoteHash) {
            throw new Error(`Checksum mismatch! Local: ${localHash}, Remote: ${remoteHash}`);
          }
          this.log('success', `Checksum verified successfully for ${filename}`);
        }

        // Record final remaining bytes to window
        const prevProgress = this.uploadProgress.get(taskId);
        const prevBytes = prevProgress ? prevProgress.bytesTransferred : offset;
        const remainingDelta = stats.size - prevBytes;
        if (remainingDelta > 0) {
          this.recordWindowBytes(remainingDelta, 'upload');
        }

        this.log('success', `Uploaded${offset > 0 ? ' (Resumed)' : ''}: ${filename}`);
        this.filesUploaded++;

        try { await this.recordTransfer(stats.size - offset, 'upload'); } catch { }
        await this.removeFromQueueDb(localPath);
        this.addFileToSession(filename, remotePath, stats.size, 'upload', 'success');
      } else {
        this.log('info', `Skipped: ${filename} (${skipReason})`);
        this.filesSkipped++;
        await this.removeFromQueueDb(localPath);
        this.addFileToSession(filename, remotePath, stats.size, 'upload', 'skipped', skipReason);
      }

    } catch (err: any) {
      this.log('error', `Failed: ${filename} - ${err.message}`);
      this.filesFailed++;
      await this.updateQueueStatusDb(localPath, 'failed', offset);
      this.addFileToSession(filename, remotePath, 0, 'upload', 'failed', err.message);
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

        this.uploadProgress.delete(taskId);
        this.notifyProgress();

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

      this.notifyProgress();

      // Only reset counters when all queued work is done AND completed equals total
      if (this.syncQueue.pending === 0 && this.syncQueue.size === 0 &&
        this.completedFilesInBatch >= this.totalFilesInBatch && this.totalFilesInBatch > 0) {
        // Delay reset slightly to allow frontend to see 100% state
        setTimeout(() => {
          if (this.syncQueue.pending === 0 && this.syncQueue.size === 0) {
            this.totalFilesInBatch = 0;
            this.completedFilesInBatch = 0;
            this.filesUploaded = 0;
            this.filesSkipped = 0;
            this.filesDeleted = 0;
            this.filesFailed = 0;
            this.notifyProgress();
          }
        }, 2000);
      }
      this.debounceCloseSession();
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
      await logStore.addLog(this.connectionId, type, message);
    } catch (e) {
      console.error('Failed to save log to LogStore', e);
    }

    // Persist to flat text log file (fire and forget)
    try {
      const logDir = path.resolve(process.cwd(), 'sync_data', 'logs');
      fs.ensureDir(logDir)
        .then(() => {
          const logFile = path.join(logDir, `connection_${this.connectionId}.log`);
          const logLine = `[${logEntry.timestamp}] [${type.toUpperCase()}] ${message}\n`;
          return fs.appendFile(logFile, logLine);
        })
        .catch(err => {
          console.error('Failed to append to log file', err);
        });
    } catch (e) {
      console.error('Failed to write to text log file', e);
    }
  }

  private async recordTransfer(bytes: number, direction: 'upload' | 'download') {
    try {
      await logStore.addTransferStat(this.connectionId, bytes, direction);
    } catch (e) {
      console.error('Failed to save transfer stats', e);
    }
  }

  private startSession() {
    if (this.activeSession) {
      if (this.sessionCloseTimer) {
        clearTimeout(this.sessionCloseTimer);
        this.sessionCloseTimer = null;
      }
      return;
    }
    
    const shortId = 'sync-' + Math.random().toString(36).substring(2, 8);
    this.activeSession = {
      id: shortId,
      connection_id: this.connectionId,
      timestamp: new Date().toISOString(),
      status: 'success',
      duration: 0,
      files: []
    };
    this.sessionStartTime = Date.now();
    this.log('info', `Started new sync session: ${shortId}`);
  }

  private addFileToSession(name: string, relPath: string, size: number, direction: 'upload' | 'download' | 'delete', status: 'success' | 'failed' | 'skipped', message?: string) {
    if (!this.activeSession) {
      this.startSession();
    }
    
    const formattedRelPath = relPath.replace(/\\/g, '/');
    this.activeSession.files.push({
      name,
      path: formattedRelPath,
      size,
      direction,
      status,
      message
    });

    if (status === 'failed') {
      this.activeSession.status = 'failed';
    }

    // If it's a success, copy the file to backup folder (no size limit)
    if (status === 'success' && direction !== 'delete') {
      try {
        const targetDir = this.config.target_directory || '/';
        const normRelPath = formattedRelPath.replace(/^\//, '');
        const normTargetDir = targetDir.replace(/^\/|\/$/g, '');

        let actualRelPath = normRelPath;
        if (normTargetDir && normRelPath.startsWith(normTargetDir)) {
          actualRelPath = normRelPath.substring(normTargetDir.length).replace(/^\//, '');
        }

        const backupFile = logStore.getBackupFilePath(
          this.connectionId,
          this.activeSession.id,
          actualRelPath,
          this.config.backup_path
        );
        
        const sourcePath = path.join(this.localRoot, actualRelPath);

        if (fs.existsSync(sourcePath)) {
          fs.ensureDirSync(path.dirname(backupFile));
          fs.copySync(sourcePath, backupFile);
          console.log(`[Backup] Saved version for ${name} in session ${this.activeSession.id} at ${backupFile}`);
        }
      } catch (err) {
        console.error('Failed to create file version backup:', err);
      }
    }
  }

  private debounceCloseSession() {
    if (this.sessionCloseTimer) {
      clearTimeout(this.sessionCloseTimer);
    }
    
    this.sessionCloseTimer = setTimeout(() => {
      // Only close if queue is empty
      if (this.syncQueue.pending === 0 && this.syncQueue.size === 0) {
        this.closeSession();
      } else {
        // If queue not empty, re-debounce
        this.debounceCloseSession();
      }
    }, 3000);
  }

  private async closeSession() {
    if (!this.activeSession) return;
    
    this.activeSession.duration = Date.now() - this.sessionStartTime;
    try {
      await logStore.addSyncSession(this.activeSession);
      await this.log('success', `Completed sync session: ${this.activeSession.id} (${this.activeSession.files.length} files processed)`);
    } catch (e) {
      console.error('Failed to save sync session to LogStore', e);
    }

    // Update last_sync_time/duration/status in database
    const sessionData = this.activeSession;
    try {
      const db = await getDb();
      await db.run(
        `UPDATE ftp_connections SET last_sync_time = ?, last_sync_duration = ?, last_sync_status = ? WHERE id = ?`,
        new Date().toISOString(),
        sessionData.duration,
        sessionData.status,
        this.connectionId
      );
    } catch (err: any) {
      console.error('Failed to update last_sync info:', err);
    }
    
    this.activeSession = null;
    if (this.sessionCloseTimer) {
      clearTimeout(this.sessionCloseTimer);
      this.sessionCloseTimer = null;
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
      completedFiles: this.completedFilesInBatch,
      filesUploaded: this.filesUploaded,
      filesSkipped: this.filesSkipped,
      filesDeleted: this.filesDeleted,
      filesFailed: this.filesFailed,
      uploadSpeedMBps: this.getWindowSpeed('upload'),
      downloadSpeedMBps: this.getWindowSpeed('download')
    };
  }



  public async start() {
    const mode = this.config.sync_mode || 'bi_directional';
    this.log('info', `Starting sync session (Mode: ${mode})...`);

    await fs.ensureDir(this.localRoot);
    this.log('info', `Local directory: ${this.localRoot}`);

    // Warm local file cache in background
    this.indexLocalFiles();

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

    // Close active session first so data is persisted before cleanup
    if (this.sessionCloseTimer) {
      clearTimeout(this.sessionCloseTimer);
      this.sessionCloseTimer = null;
    }
    this.closeSession();

    try {
      if (!this.client.closed) {
        this.client.close();
      }
    } catch (e) {
      // Ignore
    }

    // Close all pool clients
    await this.connectionPool.destroyAll();

    this.log('info', 'Sync session stopped');
  }

  private toRemotePath(localPath: string, localRoot: string) {
    const relative = path.relative(localRoot, localPath);
    const remoteRoot = this.config.target_directory || '/';
    return path.posix.join(remoteRoot, relative.split(path.sep).join('/'));
  }

  public async manualUpload(localFilename: string, remoteName?: string, isSubTask = false) {
    if (!isSubTask) {
      this.totalFilesInBatch = 1;
      this.completedFilesInBatch = 0;
      this.filesUploaded = 0;
      this.filesSkipped = 0;
      this.filesDeleted = 0;
      this.filesFailed = 0;
      this.batchStartTime = Date.now();
      this.notifyProgress();
    }

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
        const currentTaskId = taskId;
        const startTime = Date.now();
        const totalBytes = fs.statSync(localPath).size;

        this.uploadProgress.set(currentTaskId, {
          type: 'upload',
          filename: localFilename,
          totalBytes,
          bytesTransferred: 0,
          percent: 0,
          speedMBps: 0,
          etaSeconds: 0,
          startTime
        });
        this.notifyProgress();

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

          // Record delta to window
          const prevProgress = this.uploadProgress.get(currentTaskId);
          const prevBytes = prevProgress ? prevProgress.bytesTransferred : 0;
          const delta = info.bytes - prevBytes;
          if (delta > 0) {
            this.recordWindowBytes(delta, 'upload');
          }

          this.uploadProgress.set(currentTaskId, {
            type: 'upload',
            filename: localFilename,
            totalBytes,
            bytesTransferred: info.bytes,
            percent,
            speedMBps: Math.round(speedMBps * 100) / 100,
            etaSeconds: speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0,
            startTime
          });
          this.notifyProgress();
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

        if (this.config.enable_checksum) {
          this.log('info', `Verifying checksum for ${localFilename}...`);
          const localHash = await ChecksumVerifier.computeLocalHash(localPath);
          const remoteHash = await ChecksumVerifier.computeRemoteHash(client, remotePath);
          if (localHash !== remoteHash) {
            throw new Error(`Checksum mismatch! Local: ${localHash}, Remote: ${remoteHash}`);
          }
          this.log('success', `Checksum verified successfully for ${localFilename}`);
        }

        // Record final remaining bytes to window
        const prevProgress = this.uploadProgress.get(taskId);
        const prevBytes = prevProgress ? prevProgress.bytesTransferred : 0;
        const remainingDelta = totalBytes - prevBytes;
        if (remainingDelta > 0) {
          this.recordWindowBytes(remainingDelta, 'upload');
        }

        try {
          const stats = fs.statSync(localPath);
          await this.recordTransfer(stats.size, 'upload');
        } catch { }
        this.log('success', `Manual Upload: ${localFilename}${remoteName ? ` -> ${remoteName}` : ''}`);
        // Update local cache
        await this.updateLocalCache(localPath);
        this.filesUploaded++;

      } catch (err: any) {
        this.log('error', `Manual upload failed: ${err.message}`);
        this.filesFailed++;

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
        this.completedFilesInBatch++;
        this.notifyProgress();
      }
    };

    return performUpload();
  }

  public async manualDownload(remoteFilePath: string, isSubTask = false) {
    if (!isSubTask) {
      this.totalFilesInBatch = 1;
      this.completedFilesInBatch = 0;
      this.filesUploaded = 0;
      this.filesSkipped = 0;
      this.filesDeleted = 0;
      this.filesFailed = 0;
      this.batchStartTime = Date.now();
      this.notifyProgress();
    }

    const remoteRoot = this.config.target_directory || '/';
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

    let client: TransferClient | null = null;
    let retryCount = 0;
    let offset = 0;

    const performDownload = async (): Promise<void> => {
      let taskId: string | undefined;
      this.startSession();
      try {
        client = await this.acquireClient();

        // For download, we might need to get remote size first for percentage
        let totalBytes = 0;
        try {
          const stats = await client.stat(remoteFilePath);
          if (stats) totalBytes = stats.size;
        } catch { }

        // Ensure task is recorded in DB queue
        const db = await getDb();
        const queuedTask = await db.get(
          'SELECT status, bytes_transferred FROM sync_transfer_queue WHERE connection_id = ? AND file_path = ?',
          this.connectionId,
          localPath
        );

        if (!queuedTask) {
          await this.addToQueueDb(localPath, 'download', totalBytes);
        } else if (queuedTask.status === 'interrupted') {
          await this.updateQueueStatusDb(localPath, 'syncing', queuedTask.bytes_transferred);
        } else {
          await this.updateQueueStatusDb(localPath, 'syncing', 0);
        }

        // Check if we should resume (only if it was marked interrupted)
        if (queuedTask && queuedTask.status === 'interrupted' && fs.existsSync(localPath)) {
          try {
            const localStats = fs.statSync(localPath);
            if (localStats.size > 0 && localStats.size < totalBytes) {
              offset = localStats.size;
              this.log('info', `Resuming download for ${path.basename(remoteFilePath)} at offset ${offset} bytes (${Math.round((offset/totalBytes)*100)}% done)`);
            }
          } catch (e) {
            // ignore
          }
        }

        // Progress Tracking Setup
        taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const currentTaskId = taskId;
        const startTime = Date.now();

        this.uploadProgress.set(currentTaskId, {
          type: 'download',
          filename: path.basename(remoteFilePath),
          totalBytes,
          bytesTransferred: offset,
          percent: totalBytes > 0 ? Math.round((offset / totalBytes) * 100) : 0,
          speedMBps: 0,
          etaSeconds: 0,
          startTime
        });
        this.notifyProgress();

        let lastProgressUpdate = 0;
        let lastDbUpdate = Date.now();
        client.trackProgress((info) => {
          const now = Date.now();
          if (now - lastProgressUpdate < 200) return;
          lastProgressUpdate = now;

          const currentTransferred = info.bytes + offset;
          const elapsed = (now - startTime) / 1000;
          const speedBps = elapsed > 0 ? info.bytes / elapsed : 0;
          const speedMBps = speedBps / (1024 * 1024);
          const percent = totalBytes > 0 ? Math.min(100, Math.round((currentTransferred / totalBytes) * 100)) : 0;
          const remainingBytes = Math.max(0, totalBytes - currentTransferred);

          // Record delta to window
          const prevProgress = this.uploadProgress.get(currentTaskId);
          const prevBytes = prevProgress ? prevProgress.bytesTransferred : offset;
          const delta = currentTransferred - prevBytes;
          if (delta > 0) {
            this.recordWindowBytes(delta, 'download');
          }

          this.uploadProgress.set(currentTaskId, {
            type: 'download',
            filename: path.basename(remoteFilePath),
            totalBytes,
            bytesTransferred: currentTransferred,
            percent,
            speedMBps: Math.round(speedMBps * 100) / 100,
            etaSeconds: speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0,
            startTime
          });
          this.notifyProgress();

          // Throttle database progress updates to every 2 seconds
          if (now - lastDbUpdate > 2000) {
            lastDbUpdate = now;
            this.updateQueueStatusDb(localPath, 'syncing', currentTransferred);
          }
        });

        await fs.ensureDir(path.dirname(localPath));
        await client.downloadTo(localPath, remoteFilePath, offset);

        if (this.config.enable_checksum) {
          this.log('info', `Verifying checksum for ${path.basename(remoteFilePath)}...`);
          const localHash = await ChecksumVerifier.computeLocalHash(localPath);
          const remoteHash = await ChecksumVerifier.computeRemoteHash(client, remoteFilePath);
          if (localHash !== remoteHash) {
            throw new Error(`Checksum mismatch! Local: ${localHash}, Remote: ${remoteHash}`);
          }
          this.log('success', `Checksum verified successfully for ${path.basename(remoteFilePath)}`);
        }

        // Record final remaining bytes to window
        const prevProgress = this.uploadProgress.get(taskId);
        const prevBytes = prevProgress ? prevProgress.bytesTransferred : offset;
        const remainingDelta = totalBytes - prevBytes;
        if (remainingDelta > 0) {
          this.recordWindowBytes(remainingDelta, 'download');
        }
        this.log('success', `Downloaded${offset > 0 ? ' (Resumed)' : ''}: ${path.basename(remoteFilePath)}`);

        // Update local cache
        await this.updateLocalCache(localPath);
        await this.removeFromQueueDb(localPath);

        try {
          const stats = fs.statSync(localPath);
          await this.recordTransfer(stats.size - offset, 'download');
          this.addFileToSession(path.basename(remoteFilePath), relPath, stats.size, 'download', 'success');
        } catch {
          this.addFileToSession(path.basename(remoteFilePath), relPath, totalBytes, 'download', 'success');
        }

      } catch (err: any) {
        this.log('error', `Manual download failed: ${err.message}`);
        await this.updateQueueStatusDb(localPath, 'failed', offset);
        this.addFileToSession(path.basename(remoteFilePath), relPath, 0, 'download', 'failed', err.message);

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
        this.notifyProgress();
        if (client) {
          client.trackProgress();
          this.releaseClient(client);
        }
        this.debounceCloseSession();
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

    // Update local cache
    await this.updateLocalCache(localPath);

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

    this.totalFilesInBatch++;
    this.deleteQueue.add(JSON.stringify({ localPath, localRoot }));
    this.log('info', `Queued delete: ${path.basename(localPath)}`);
    this.notifyProgress();

    // Add delete task to main syncQueue to respect global concurrency
    this.syncQueue.add(() => this.processSingleDelete(localPath, localRoot));
  }

  // Process a single delete (wrapped in syncQueue)
  private async processSingleDelete(localPath: string, localRoot: string) {
    const filename = path.basename(localPath);
    const remotePath = this.toRemotePath(localPath, localRoot);
    let client: TransferClient | null = null;
    this.startSession();
    try {
      client = await this.acquireClient();
      await client.remove(remotePath);
      this.log('success', `Deleted: ${filename}`);
      this.filesDeleted++;
      this.addFileToSession(filename, remotePath, 0, 'delete', 'success');
    } catch (err: any) {
      // 550 = File not found (already deleted?), that's a success for us
      if (err.code === 550 || err.message.includes('No such file')) {
        this.log('success', `Deleted (Not found): ${filename}`);
        this.filesDeleted++;
        this.addFileToSession(filename, remotePath, 0, 'delete', 'skipped', 'Not found on server');
      } else {
        this.log('error', `Delete failed: ${filename} - ${err.message}`);
        this.filesFailed++;
        this.addFileToSession(filename, remotePath, 0, 'delete', 'failed', err.message);
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
      this.completedFilesInBatch++;
      this.notifyProgress();
      this.debounceCloseSession();
    }
  }

  // Deprecated batch processor
  private async processDeleteQueue() {
    return;
    // Logic moved to single task via syncQueue
  }

  private async handleLocalDelete(localPath: string, localRoot: string) {
    // Remove from local cache
    await this.deleteFromLocalCache(localPath);

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

    // Reset batch progress counters
    this.totalFilesInBatch = 0;
    this.completedFilesInBatch = 0;
    this.filesUploaded = 0;
    this.filesSkipped = 0;
    this.filesDeleted = 0;
    this.filesFailed = 0;
    this.batchStartTime = Date.now();
    this.notifyProgress();

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

      // Count files that need download first to populate totalFilesInBatch correctly
      const filesToDownload: any[] = [];
      const ig = await getIgnoreInstance(localRoot);

      // Asynchronous non-blocking file checks in parallel
      const checkTasks = remoteFiles.map(async (file) => {
        const relPath = path.posix.relative(remoteRoot, file.path);
        const normalizedRelPath = relPath.split(path.sep).join('/');
        
        if (ig.ignores(normalizedRelPath)) return null;

        const localPath = path.join(localRoot, relPath.split('/').join(path.sep));
        
        try {
          const exists = await fs.pathExists(localPath);
          if (!exists) {
            return { file, localPath };
          }
          
          const localStats = await fs.stat(localPath);
          const remoteTime = new Date(file.modifiedAt || 0).getTime();
          const localTime = localStats.mtime.getTime();
          if (remoteTime > localTime + 2000) {
            return { file, localPath };
          }
        } catch (e) {
          // If stat fails, download it to be safe
          return { file, localPath };
        }
        return null;
      });

      const checkResults = await Promise.all(checkTasks);
      for (const res of checkResults) {
        if (res) {
          filesToDownload.push(res);
        }
      }

      this.totalFilesInBatch = filesToDownload.length;
      this.notifyProgress();

      for (const { file, localPath } of filesToDownload) {
        this.log('info', `Downloading: ${file.name}`);
        this.pendingDownloads.add(localPath);

        try {
          // ACQUIRE MUTEX FOR DOWNLOAD
          await this.mutex.run(async () => {
            await this.manualDownload(file.path, true);
          });

          downloadCount++;
        } catch (err: any) {
          this.pendingDownloads.delete(localPath);
          this.log('error', `Download failed for ${file.name}: ${err.message}`);
        } finally {
          this.completedFilesInBatch++;
          this.notifyProgress();
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
    await this.connectionPool.warm();
  }

  public async processBulkSync(items: { path: string, localName?: string | null, direction: 'upload' | 'download', isDirectory: boolean }[], basePath: string) {
    this.log('info', `Starting bulk sync of ${items.length} items (Pool size: ${this.poolSize})...`);

    this.totalFilesInBatch = items.filter(i => !i.isDirectory).length;
    this.completedFilesInBatch = 0;
    this.filesUploaded = 0;
    this.filesSkipped = 0;
    this.filesDeleted = 0;
    this.filesFailed = 0;
    this.batchStartTime = Date.now();
    this.notifyProgress();

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
        // skipIgnoreCheck=true: manual bulk sync from Visual Diff bypasses .ftpignore
        queuePromises.push(this.queueDirectoryUpload(fullPath, true));
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
          await this.manualDownload(remotePath, true);
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

  private async queueDirectoryUpload(localDirPath: string, skipIgnoreCheck = false) {
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
          queuePromises.push(this.queueDirectoryUpload(itemPath, skipIgnoreCheck));
        } else {
          // Queue file WITHOUT awaiting - just add to PQueue
          this.queueFileForUploadNonBlocking(itemPath, skipIgnoreCheck);
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
  // skipIgnoreCheck: when true, bypass .ftpignore check (used for manual Visual Diff uploads)
  private queueFileForUploadNonBlocking(localPath: string, skipIgnoreCheck = false): void {
    const doQueue = async () => {
      // Only check ignore patterns during auto-sync, not manual uploads
      if (!skipIgnoreCheck) {
        const ignored = await shouldIgnore(this.localRoot, localPath);
        if (ignored) {
          this.log('info', `Ignored (upload): ${path.basename(localPath)}`);
          return;
        }
      }

      this.totalFilesInBatch++;
      this.notifyProgress();
      this.log('info', `Queued: ${path.basename(localPath)}`);

      try {
        const stats = await fs.stat(localPath);
        await this.addToQueueDb(localPath, 'upload', stats.size);
      } catch (e) {}

      // Add to p-queue but DON'T return the promise
      this.syncQueue.add(async () => {
        if (!fs.existsSync(localPath)) return;
        await this.uploadFile(localPath);
      });
    };
    doQueue();
  }

  private async downloadDirectory(remoteDirPath: string) {
    this.log('info', `Downloading directory: ${path.basename(remoteDirPath)}...`);
    try {
      let files: any[] = [];
      // listRemoteFilesUnified handles its own locking per-directory
      files = await this.listRemoteFilesUnified(remoteDirPath);

      this.log('info', `Found ${files.length} files in ${path.basename(remoteDirPath)}`);

      // Initialize batch progress for directory download
      this.totalFilesInBatch = files.length;
      this.completedFilesInBatch = 0;
      this.filesUploaded = 0;
      this.filesSkipped = 0;
      this.filesDeleted = 0;
      this.filesFailed = 0;
      this.batchStartTime = Date.now();
      this.notifyProgress();

      // Queue all files for parallel download instead of sequential
      // Each file will be processed by PQueue with concurrency control
      const downloadPromises = files.map(file => 
        this.syncQueue.add(async () => {
          try {
            await this.manualDownload(file.path, true);
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

  public async getRemoteFile(remotePath: string): Promise<{ content: string; modifiedAt: string; size: number }> {
    return this.mutex.run(async () => {
      await this.ensureConnection();

      const stats = await this.client.stat(remotePath);
      if (!stats) throw new Error('File not found');

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
        throw new Error('File is too large to edit (limit is 5MB).');
      }

      return {
        content: buffer.toString('utf8'),
        modifiedAt: stats.modifiedAt ? stats.modifiedAt.toISOString() : new Date().toISOString(),
        size: stats.size
      };
    });
  }

  public async saveRemoteFile(remotePath: string, content: string, lastModifiedAt?: string): Promise<{ success: boolean; modifiedAt: string }> {
    return this.mutex.run(async () => {
      await this.ensureConnection();

      if (lastModifiedAt) {
        try {
          const stats = await this.client.stat(remotePath);
          if (stats && stats.modifiedAt) {
            const currentModified = stats.modifiedAt.getTime();
            const expectedModified = new Date(lastModifiedAt).getTime();

            if (currentModified > expectedModified + 2000) {
              throw new Error('CONFLICT_DETECTED: The file on the remote server has been modified by someone else since you loaded it. Please reload the file to merge changes.');
            }
          }
        } catch (statErr: any) {
          if (!statErr.message.includes('not found') && !statErr.message.includes('No such file') && !statErr.message.includes('450')) {
            throw statErr;
          }
        }
      }

      const readable = new (require('stream').Readable)();
      readable.push(content);
      readable.push(null);

      await this.client.uploadFrom(readable, remotePath);

      const stats = await this.client.stat(remotePath);
      if (!stats) throw new Error('Failed to retrieve stats after saving');

      return {
        success: true,
        modifiedAt: stats.modifiedAt ? stats.modifiedAt.toISOString() : new Date().toISOString()
      };
    });
  }

  public async resumeInterrupted(interruptedItems: any[]) {
    this.log('info', `Resuming ${interruptedItems.length} interrupted transfers from previous crash...`);

    // Reset session batch counters
    this.totalFilesInBatch = interruptedItems.length;
    this.completedFilesInBatch = 0;
    this.filesUploaded = 0;
    this.filesSkipped = 0;
    this.filesDeleted = 0;
    this.filesFailed = 0;
    this.batchStartTime = Date.now();
    this.notifyProgress();

    // Pre-warm connection pool
    await this.warmConnectionPool();

    // Enqueue each item into the sync queue. PQueue will process them with concurrency control.
    for (const item of interruptedItems) {
      if (item.direction === 'upload') {
        this.syncQueue.add(async () => {
          if (!fs.existsSync(item.file_path)) {
            this.log('error', `Local file not found for resume: ${path.basename(item.file_path)}`);
            await this.removeFromQueueDb(item.file_path);
            this.completedFilesInBatch++;
            this.notifyProgress();
            return;
          }
          await this.uploadFile(item.file_path);
        });
      } else {
        this.syncQueue.add(async () => {
          try {
            // Calculate remoteFilePath
            const relative = path.relative(this.localRoot, item.file_path);
            const remoteRoot = this.config.target_directory || '/';
            const remoteFilePath = path.posix.join(remoteRoot, relative.split(path.sep).join('/'));

            await this.manualDownload(remoteFilePath, true);
          } catch (e: any) {
            this.log('error', `Resume download failed for ${path.basename(item.file_path)}: ${e.message}`);
          } finally {
            this.completedFilesInBatch++;
            this.notifyProgress();
          }
        });
      }
    }
  }

  private async addToQueueDb(filePath: string, direction: 'upload' | 'download', totalSize: number) {
    try {
      const db = await getDb();
      await db.run(
        `INSERT OR REPLACE INTO sync_transfer_queue 
         (connection_id, file_path, direction, total_size, bytes_transferred, status, updated_at) 
         VALUES (?, ?, ?, ?, 0, 'pending', CURRENT_TIMESTAMP)`,
        this.connectionId,
        filePath,
        direction,
        totalSize
      );
    } catch (err: any) {
      console.error(`[SyncService] Failed to add file to DB queue: ${err.message}`);
    }
  }

  private async updateQueueStatusDb(filePath: string, status: 'pending' | 'syncing' | 'completed' | 'failed' | 'interrupted', bytesTransferred = 0) {
    try {
      const db = await getDb();
      await db.run(
        `UPDATE sync_transfer_queue 
         SET status = ?, bytes_transferred = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE connection_id = ? AND file_path = ?`,
        status,
        bytesTransferred,
        this.connectionId,
        filePath
      );
    } catch (err: any) {
      console.error(`[SyncService] Failed to update file queue status in DB: ${err.message}`);
    }
  }

  private async removeFromQueueDb(filePath: string) {
    try {
      const db = await getDb();
      await db.run(
        `DELETE FROM sync_transfer_queue 
         WHERE connection_id = ? AND file_path = ?`,
        this.connectionId,
        filePath
      );
    } catch (err: any) {
      console.error(`[SyncService] Failed to remove file from DB queue: ${err.message}`);
    }
  }

  public async restoreFileVersion(sessionId: string, relPath: string): Promise<void> {
    const targetDir = this.config.target_directory || '/';
    const normRelPath = relPath.replace(/\\/g, '/').replace(/^\//, '');
    const normTargetDir = targetDir.replace(/^\/|\/$/g, '');

    let actualRelPath = normRelPath;
    if (normTargetDir && normRelPath.startsWith(normTargetDir)) {
      actualRelPath = normRelPath.substring(normTargetDir.length).replace(/^\//, '');
    }

    const backupFile = logStore.getBackupFilePath(
      this.connectionId,
      sessionId,
      actualRelPath,
      this.config.backup_path
    );

    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found at ${backupFile}`);
    }

    const localPath = path.join(this.localRoot, actualRelPath);
    await fs.ensureDir(path.dirname(localPath));
    await fs.copy(backupFile, localPath);
    this.log('info', `Restored ${path.basename(actualRelPath)} locally from session ${sessionId}`);

    // Now trigger manual upload to sync with FTP server
    await this.ensureConnection();
    await this.manualUpload(actualRelPath);
    this.log('success', `Successfully rolled back ${path.basename(actualRelPath)} to version from session ${sessionId}`);
  }
}

class SyncManager extends EventEmitter {
  private sessions: Map<number, SyncSession> = new Map();

  constructor() {
    super();
  }

  public getActiveConnections(): number[] {
    return Array.from(this.sessions.keys());
  }

  private async getSession(connectionId: number): Promise<SyncSession> {
    if (this.sessions.has(connectionId)) {
      return this.sessions.get(connectionId)!;
    }
    const db = await getDb();
    const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
    if (!config) throw new Error('Connection not found');

    const session = new SyncSession(connectionId, config);
    session.onProgress = (progress) => {
      this.emit('progress', connectionId, progress);
    };
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

  public async restoreFileVersion(connectionId: number, sessionId: string, relPath: string) {
    const session = await this.getSession(connectionId);
    await session.restoreFileVersion(sessionId, relPath);
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

  public async getRemoteFile(connectionId: number, remotePath: string): Promise<{ content: string; modifiedAt: string; size: number }> {
    const session = await this.getSession(connectionId);
    return session.getRemoteFile(remotePath);
  }

  public async saveRemoteFile(connectionId: number, remotePath: string, content: string, lastModifiedAt?: string): Promise<{ success: boolean; modifiedAt: string }> {
    const session = await this.getSession(connectionId);
    return session.saveRemoteFile(remotePath, content, lastModifiedAt);
  }

  public async runWithClient<T>(connectionId: number, fn: (client: TransferClient) => Promise<T>, isInteractive = false): Promise<T> {
    const session = await this.getSession(connectionId);
    return session.runWithClient(fn, isInteractive);
  }

  public isCacheWarmed(connectionId: number): boolean {
    const session = this.sessions.get(connectionId);
    if (!session) return false;
    return session.isCacheWarmed();
  }

  public clearAllCacheWarmed(): void {
    for (const session of this.sessions.values()) {
      session.isLocalCacheWarmed = false;
    }
  }

  // Removed suspend/resume exports since we use shared connection
  /* 
  public async suspendSync(connectionId: number) { ... }
  public async resumeSync(connectionId: number) { ... }
  */

  public async getStatus(connectionId: number) {
    const session = this.sessions.get(connectionId);
    // Merge persisted logs with fresh in-memory logs for real-time accuracy
    const dbLogs = await logStore.getLogs(connectionId, 10);
    const inMemoryLogs = session ? session.getLogs() : [];

    // Combine: use in-memory first (most recent), fill with DB logs
    // Deduplicate by timestamp+message
    const seen = new Set<string>();
    const combined: { timestamp: string; type: string; message: string }[] = [];

    for (const log of inMemoryLogs) {
      const key = `${log.timestamp}|${log.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(log);
      }
    }
    for (const l of dbLogs) {
      const key = `${l.created_at}|${l.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({ timestamp: l.created_at, type: l.type, message: l.message });
      }
    }

    // Sort by timestamp descending (newest first) and limit to 20
    combined.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const logs = combined.slice(0, 20);

    return {
      running: this.sessions.has(connectionId),
      isSyncing: session ? session.getIsSyncing() : false,
      logs
    };
  }

  public getProgress(connectionId: number): OverallProgress | null {
    const session = this.sessions.get(connectionId);
    if (!session) return null;
    return session.getProgress();
  }

  public async getInterruptedSessions(): Promise<any[]> {
    const db = await getDb();
    const rows = await db.all(`
      SELECT 
        q.connection_id,
        c.name as connection_name,
        c.server,
        COUNT(*) as file_count,
        SUM(q.total_size) as total_size,
        SUM(q.bytes_transferred) as bytes_transferred
      FROM sync_transfer_queue q
      JOIN ftp_connections c ON q.connection_id = c.id
      WHERE q.status = 'interrupted'
      GROUP BY q.connection_id
    `);
    return rows;
  }

  public async resumeInterruptedSync(connectionId: number) {
    const session = await this.getSession(connectionId);
    
    // Fetch all interrupted files for this connection
    const db = await getDb();
    const interruptedItems = await db.all(
      "SELECT * FROM sync_transfer_queue WHERE connection_id = ? AND status = 'interrupted'",
      connectionId
    );

    if (interruptedItems.length === 0) {
      return;
    }

    await session.resumeInterrupted(interruptedItems);
  }

  public async discardInterruptedSync(connectionId: number) {
    const db = await getDb();
    await db.run("DELETE FROM sync_transfer_queue WHERE connection_id = ?", connectionId);
    console.log(`Discarded interrupted transfers for connection ${connectionId}`);
  }
}

export default new SyncManager();
