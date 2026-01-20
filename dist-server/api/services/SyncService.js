import { TransferClientFactory } from './transfer/TransferClientFactory.js';
import * as chokidar from 'chokidar';
import path from 'path';
import fs from 'fs-extra';
import PQueue from 'p-queue';
import { decrypt } from '../utils/encryption.js';
import { getDb } from '../db.js';
import { logStore } from './LogStore.js';
import { shouldIgnore, clearIgnoreCache } from './IgnoreService.js';
import { SimpleMutex } from '../utils/SimpleMutex.js';
class SyncSession {
    // Sync Queue with concurrency control
    syncQueue;
    poolSize;
    // Connection pool for reuse
    connectionPool = [];
    availableClients = [];
    // Main control connection (for listing, watching)
    client;
    isConnected = false;
    mutex = new SimpleMutex();
    // Upload progress tracking
    uploadProgress = new Map(); // Key: taskId (UUID)
    // Delete queue (can be handled by p-queue too, but maybe separate for now?)
    // keeping delete queue simple for now, or move to p-queue?
    // Let's use p-queue for everything to control concurrency.
    // But delete is fast. Let's keep separate simple queue for deletes if logic is complex, 
    // OR just push delete tasks to syncQueue.
    // Existing delete logic is batch-based. Let's keep it as is for now to minimize risk, 
    // but we must ensure it doesn't conflict with transfers.
    deleteQueue = new Set();
    isProcessingDeletes = false;
    totalFilesInBatch = 0;
    completedFilesInBatch = 0;
    // Cache for known existing remote directories to avoid redundant checks
    remoteDirCache = new Set();
    // Watcher
    watcher = null;
    intervalTimer = null;
    // Logs
    logs = [];
    connectionId;
    config;
    localRoot;
    pendingDownloads = new Set();
    isSyncing = false;
    constructor(connectionId, config) {
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
        if (this.config.local_path && this.config.local_path.trim() !== '') {
            this.localRoot = this.config.local_path;
        }
        else {
            this.localRoot = path.resolve(process.cwd(), 'sync_data', this.connectionId.toString());
        }
    }
    // Get a free client (or create new one)
    async acquireClient() {
        // Aggressive check: Loop until we find a working client or run out
        while (this.availableClients.length > 0) {
            const client = this.availableClients.shift();
            if (!client.closed) { // Assuming client is still good if not closed
                // Optional: Could verify with a NOOP/PWD here, but might be slow
                return client;
            }
            // If closed, discard (it's already removed shift()) and try next
        }
        const protocol = this.config.protocol || 'ftp';
        const client = TransferClientFactory.createClient(protocol, 60000); // Higher timeout for reuse
        // Connect immediately
        const password = decrypt(this.config.password_hash);
        if (!password)
            throw new Error('Cannot decrypt password');
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
    removeClient(client) {
        const index = this.connectionPool.indexOf(client);
        if (index !== -1) {
            this.connectionPool.splice(index, 1);
        }
    }
    releaseClient(client) {
        if (client && !client.closed) {
            this.availableClients.push(client);
        }
    }
    // Add file to queue
    async queueFileForUpload(localPath) {
        if (await shouldIgnore(this.localRoot, localPath)) {
            this.log('info', `Ignored (upload): ${path.basename(localPath)}`);
            return;
        }
        this.totalFilesInBatch++;
        this.log('info', `Queued: ${path.basename(localPath)}`);
        // Add to p-queue
        this.syncQueue.add(() => this.uploadFile(localPath));
    }
    // New upload task (replaces processUploadQueue logic)
    async uploadFile(localPath, retryCount = 0) {
        const filename = path.basename(localPath);
        const startTime = Date.now();
        const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        let client = null;
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
                if (now - lastProgressUpdate < 200)
                    return;
                lastProgressUpdate = now;
                const elapsed = (now - startTime) / 1000;
                const speedBps = elapsed > 0 ? info.bytes / elapsed : 0;
                const speedMBps = speedBps / (1024 * 1024);
                const percent = totalBytes > 0 ? Math.round((info.bytes / totalBytes) * 100) : 0;
                const remainingBytes = totalBytes - info.bytes;
                this.uploadProgress.set(taskId, {
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
                        }
                        else if (conflictResolution === 'different_size') {
                            if (remoteStats.size === stats.size) {
                                shouldUpload = false;
                                skipReason = 'Same size';
                            }
                        }
                    }
                }
                catch { }
            }
            if (shouldUpload) {
                const bufferSizeMB = this.config.buffer_size || 16;
                const readStream = fs.createReadStream(localPath, {
                    highWaterMark: bufferSizeMB * 1024 * 1024
                });
                await client.uploadFrom(readStream, remotePath);
                this.log('success', `Uploaded: ${filename}`);
                try {
                    await this.recordTransfer(stats.size, 'upload');
                }
                catch { }
            }
            else {
                this.log('info', `Skipped: ${filename} (${skipReason})`);
            }
        }
        catch (err) {
            this.log('error', `Failed: ${filename} - ${err.message}`);
            // Aggressive Cleanup: On ANY error, assume the worst and drop the client
            if (client) {
                try {
                    client.close();
                }
                catch { }
                this.removeClient(client);
                client = null; // Mark null so it isn't released back to pool
            }
            // Auto-retry on 425, 421 (Too many connections), 530 (Login limit), or Connection Closed errors
            if (retryCount < 5 && (err.code === 425 ||
                err.code === 421 ||
                err.code === 530 ||
                err.message.includes('425') ||
                err.message.includes('421') ||
                err.message.includes('530') ||
                err.message.includes('closed') ||
                err.message.includes('ECONNRESET') ||
                err.message.includes('FIN packet unexpectedly') ||
                err.message.includes('Operation not permitted'))) {
                const delay = 1000 + Math.random() * 2000;
                this.log('info', `Retrying ${filename} due to error (Attempt ${retryCount + 2}/5) in ${Math.round(delay)}ms...`);
                // Force cleanup
                if (client) {
                    client.trackProgress(); // Clear listener
                    try {
                        client.close();
                    }
                    catch { }
                    this.removeClient(client);
                    client = null; // Prevent finally from releasing it
                }
                this.uploadProgress.delete(taskId);
                // Add random delay to avoid Thundering Herd on server limits
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.uploadFile(localPath, retryCount + 1);
            }
        }
        finally {
            if (client) {
                client.trackProgress(); // Clear listener
                this.releaseClient(client);
            }
            this.uploadProgress.delete(taskId);
            this.completedFilesInBatch++;
            if (this.syncQueue.pending === 0 && this.syncQueue.size === 0) {
                this.totalFilesInBatch = 0;
                this.completedFilesInBatch = 0;
            }
        }
    }
    // Upload a single file (used by batch processor)
    async uploadSingleFile(localPath) {
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
                    }
                    else if (conflictResolution === 'different_size') {
                        if (remoteStats.size === stats.size) {
                            this.log('info', `Skipped: ${path.basename(localPath)} (Same size)`);
                            return;
                        }
                    }
                }
            }
            catch (e) { /* ignore stat error */ }
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
        }
        catch { }
        this.log('success', `Uploaded: ${path.basename(localPath)}`);
    }
    // Ensure persistent connection is established
    async ensureConnection() {
        if (this.isConnected && !this.client.closed) {
            return; // Already connected
        }
        // Close old connection if any
        try {
            if (!this.client.closed) {
                this.client.close();
            }
        }
        catch { }
        // Create fresh client
        const protocol = this.config.protocol || 'ftp';
        this.client = TransferClientFactory.createClient(protocol, 60000);
        const password = decrypt(this.config.password_hash);
        if (!password)
            throw new Error('Cannot decrypt password');
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
    async log(type, message) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            message
        };
        this.logs.unshift(logEntry);
        if (this.logs.length > 50)
            this.logs.pop();
        console.log(`[Sync-${this.connectionId}] ${type.toUpperCase()}: ${message}`);
        // Persist to file-based LogStore (fire and forget)
        try {
            logStore.addLog(this.connectionId, type, message);
        }
        catch (e) {
            console.error('Failed to save log to LogStore', e);
        }
    }
    async recordTransfer(bytes, direction) {
        try {
            logStore.addTransferStat(this.connectionId, bytes, direction);
        }
        catch (e) {
            console.error('Failed to save transfer stats', e);
        }
    }
    getLogs() {
        return this.logs;
    }
    getProgress() {
        return {
            activeUploads: Array.from(this.uploadProgress.values()),
            queueLength: this.syncQueue.size,
            totalFilesInBatch: this.totalFilesInBatch,
            completedFiles: this.completedFilesInBatch
        };
    }
    async start() {
        const mode = this.config.sync_mode || 'bi_directional';
        this.log('info', `Starting sync session (Mode: ${mode})...`);
        await fs.ensureDir(this.localRoot);
        this.log('info', `Local directory: ${this.localRoot}`);
        // 1. Setup Watcher (Local -> Remote)
        // Only for bi_directional OR upload_only
        if (mode === 'bi_directional' || mode === 'upload_only') {
            this.watcher = chokidar.watch(this.localRoot, {
                ignored: /(^|[\/\\])(\..|node_modules|vendor|storage|dist|build)/, // Ignore dotfiles and heavy folders
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
            this.log('success', 'Local watcher started (Ignoring: node_modules, vendor, storage...)');
        }
        // 2. Initial Sync & Interval (Remote -> Local)
        if (mode === 'bi_directional') {
            this.runSyncCycle(this.localRoot);
            this.intervalTimer = setInterval(() => this.runSyncCycle(this.localRoot), 60000);
            this.log('success', 'Bi-directional polling started');
        }
        else if (mode === 'download_only') {
            this.log('success', 'Download-only mode active. Auto-sync disabled.');
            // One-time scan disabled per user request.
            // Session remains active for manual operations.
        }
    }
    async stop() {
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
        }
        catch (e) {
            // Ignore
        }
        // Close all pool clients
        for (const client of this.connectionPool) {
            try {
                if (!client.closed)
                    client.close();
            }
            catch { }
        }
        this.connectionPool = [];
        this.availableClients = [];
        this.log('info', 'Sync session stopped');
    }
    toRemotePath(localPath, localRoot) {
        const relative = path.relative(localRoot, localPath);
        const remoteRoot = this.config.target_directory || '/';
        return path.posix.join(remoteRoot, relative.split(path.sep).join('/'));
    }
    async manualUpload(localFilename, remoteName) {
        // Use pool client instead of main client to allow parallelism
        const localPath = path.join(this.localRoot, localFilename);
        const filename = path.basename(localPath);
        let client = null;
        try {
            if (!fs.existsSync(localPath))
                throw new Error(`Local file not found: ${localPath}`);
            client = await this.acquireClient();
            // Use remoteName if provided, otherwise use localFilename
            const effectiveRemoteName = (remoteName || localFilename).replace(/\\/g, '/');
            const remotePath = path.posix.join(this.config.target_directory || '/', effectiveRemoteName);
            const remoteDir = path.posix.dirname(remotePath);
            if (!this.remoteDirCache.has(remoteDir)) {
                await client.ensureDir(remoteDir);
                this.remoteDirCache.add(remoteDir);
            }
            await client.uploadFrom(localPath, remotePath);
            try {
                const stats = fs.statSync(localPath);
                await this.recordTransfer(stats.size, 'upload');
            }
            catch { }
            this.log('success', `Manual Upload: ${localFilename}${remoteName ? ` -> ${remoteName}` : ''}`);
        }
        catch (err) {
            this.log('error', `Manual upload failed: ${err.message}`);
            if (client && (err.message.includes('closed') || err.message.includes('FIN'))) {
                try {
                    client.close();
                }
                catch { }
            }
            throw err;
        }
        finally {
            if (client)
                this.releaseClient(client);
        }
    }
    async manualDownload(remoteFilePath) {
        let client = null;
        try {
            client = await this.acquireClient();
            const remoteRoot = this.config.target_directory || '/';
            // Manual path resolution instead of path.posix.relative
            const normalizePath = (p) => p.replace(/\\/g, '/');
            const normRemotePath = normalizePath(remoteFilePath);
            const normRemoteRoot = normalizePath(remoteRoot);
            let relPath = '';
            if (normRemoteRoot === '/' || normRemoteRoot === '') {
                relPath = normRemotePath.startsWith('/') ? normRemotePath.substring(1) : normRemotePath;
            }
            else if (normRemotePath.startsWith(normRemoteRoot)) {
                relPath = normRemotePath.substring(normRemoteRoot.length);
                if (relPath.startsWith('/'))
                    relPath = relPath.substring(1);
            }
            else {
                relPath = path.basename(remoteFilePath);
            }
            const localPath = path.join(this.localRoot, relPath.split('/').join(path.sep));
            await fs.ensureDir(path.dirname(localPath));
            await client.downloadTo(localPath, remoteFilePath);
            this.log('success', `Manual Download: ${path.basename(remoteFilePath)}`);
            try {
                const stats = fs.statSync(localPath);
                await this.recordTransfer(stats.size, 'download');
            }
            catch { }
        }
        catch (err) {
            this.log('error', `Manual download failed: ${err.message}`);
            if (client && (err.message.includes('closed') || err.message.includes('FIN'))) {
                try {
                    client.close();
                }
                catch { }
            }
            throw err;
        }
        finally {
            if (client)
                this.releaseClient(client);
        }
    }
    async handleLocalChange(localPath, localRoot) {
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
    async queueFileForDelete(localPath, localRoot) {
        if (!this.config.sync_deletions)
            return;
        // Check if file should be ignored
        if (await shouldIgnore(this.localRoot, localPath)) {
            this.log('info', `Ignored (delete): ${path.basename(localPath)}`);
            return;
        }
        this.deleteQueue.add(JSON.stringify({ localPath, localRoot }));
        this.log('info', `Queued delete: ${path.basename(localPath)} (${this.deleteQueue.size} pending)`);
        // Start processing immediately if not already processing
        if (!this.isProcessingDeletes) {
            this.processDeleteQueue();
        }
    }
    // Process all queued deletes sequentially
    async processDeleteQueue() {
        if (this.isProcessingDeletes || this.deleteQueue.size === 0)
            return;
        this.isProcessingDeletes = true;
        // Keep processing until queue is empty
        while (this.deleteQueue.size > 0) {
            // Take a snapshot of current items
            const itemsToDelete = Array.from(this.deleteQueue);
            // We don't clear immediately in case of total failure, but for now let's assume we handle retries internally
            this.deleteQueue.clear();
            this.log('info', `Starting batch delete of ${itemsToDelete.length} files...`);
            let client = null;
            let retryCount = 0;
            let success = false;
            // Retry loop for the entire batch (or remaining items)
            while (!success && retryCount < 5) {
                try {
                    // Use a dedicated client from pool instead of main shared client
                    client = await this.acquireClient();
                    let successCount = 0;
                    let failCount = 0;
                    const failedItems = [];
                    for (const item of itemsToDelete) {
                        try {
                            const { localPath, localRoot } = JSON.parse(item);
                            const remotePath = this.toRemotePath(localPath, localRoot);
                            await client.remove(remotePath);
                            this.log('success', `Deleted: ${path.basename(localPath)}`);
                            successCount++;
                        }
                        catch (err) {
                            // 550 = File not found (already deleted?), that's a success for us
                            if (err.code === 550 || err.message.includes('No such file')) {
                                successCount++; // Treat as success
                            }
                            else {
                                // If connection error, throw to outer loop to retry batch
                                if (err.message.includes('closed') || err.message.includes('ECONNRESET') || err.message.includes('FIN')) {
                                    throw err;
                                }
                                failCount++;
                                this.log('error', `Delete failed: ${err.message}`);
                                // If it's a permission/logic error, don't retry this item endlessly
                            }
                        }
                    }
                    this.log('success', `Batch delete complete: ${successCount} deleted, ${failCount} failed`);
                    success = true;
                }
                catch (err) {
                    retryCount++;
                    const delay = 1000 + Math.random() * 2000;
                    this.log('error', `Batch delete connection error: ${err.message}. Retrying (${retryCount}/5) in ${Math.round(delay)}ms...`);
                    if (client) {
                        try {
                            client.close();
                        }
                        catch { }
                        this.removeClient(client);
                        client = null;
                    }
                    if (retryCount >= 5) {
                        this.log('error', `Batch delete failed after 5 retries. Restoring items to queue.`);
                        // Restore items to queue to try again later?
                        for (const item of itemsToDelete) {
                            this.deleteQueue.add(item);
                        }
                    }
                    else {
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
                finally {
                    if (client) {
                        this.releaseClient(client);
                        client = null;
                    }
                }
            }
        }
        this.isProcessingDeletes = false;
    }
    async handleLocalDelete(localPath, localRoot) {
        await this.queueFileForDelete(localPath, localRoot);
    }
    handleLocalDeleteDir(localPath, localRoot) {
        // For now, skip directory deletes as they're complex and can conflict
        if (!this.config.sync_deletions)
            return;
        this.log('info', `Directory delete detected (skipped): ${path.basename(localPath)}`);
    }
    async runSyncCycle(localRoot) {
        if (this.isSyncing)
            return;
        this.isSyncing = true;
        this.log('info', 'Starting periodic sync scan...');
        try {
            // 1. List Files
            const remoteRoot = this.config.target_directory || '/';
            let remoteFiles = [];
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
                }
                else {
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
                    }
                    catch (err) {
                        this.pendingDownloads.delete(localPath);
                        throw err;
                    }
                    setTimeout(() => this.pendingDownloads.delete(localPath), 5000);
                }
            }
            if (downloadCount === 0) {
                this.log('info', 'Sync scan complete. No new files.');
            }
            else {
                this.log('success', `Sync scan complete. Downloaded ${downloadCount} files.`);
            }
        }
        catch (err) {
            // If error (e.g. connection lost), we mark unconnected so next retry reconnects
            this.isConnected = false;
            this.log('error', `Sync scan error: ${err.message}`);
        }
        finally {
            this.isSyncing = false;
            // If we finished a sync cycle and have pending uploads that were blocked by suspension (though runSyncCycle shouldn't run if suspended),
            // we might want to check queue. But usually runSyncCycle is for downloads.
        }
    }
    // Replaced listRemoteFilesPolling with Unified version
    async listRemoteFilesUnified(dir) {
        let files = [];
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
                    if (item.isDirectory) {
                        const subFiles = await this.listRemoteFilesUnified(itemPath);
                        files = files.concat(subFiles);
                    }
                    else {
                        files.push({
                            name: item.name,
                            path: itemPath,
                            size: item.size,
                            modifiedAt: item.modifiedAt
                        });
                    }
                }
                return files; // Success
            }
            catch (err) {
                retryCount++;
                this.log('error', `List failed for ${dir}: ${err.message}. Retrying (${retryCount}/3)...`);
                this.isConnected = false;
                try {
                    if (this.client)
                        this.client.close();
                }
                catch { }
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
    async listRemoteFilesInteractive(dir) {
        return this.mutex.run(async () => {
            await this.ensureConnection();
            return this.client.list(dir);
        });
    }
    // --- Bulk Sync Implementation ---
    async processBulkSync(items, basePath) {
        this.log('info', `Starting bulk sync of ${items.length} items...`);
        // Group by action to optimize
        const uploads = items.filter(i => i.direction === 'upload');
        const downloads = items.filter(i => i.direction === 'download');
        // Process Uploads (Async/Background via Queue)
        // Note: For uploads, use localName to read local file, path (remote name) for destination
        for (const item of uploads) {
            // Use localName if available, fallback to path for reading local files
            const localFileName = item.localName || item.path;
            const fullPath = path.join(this.localRoot, basePath === '/' ? '' : basePath, localFileName);
            if (item.isDirectory) {
                // For directories, we need to handle case-sensitivity in the recursive function
                await this.queueDirectoryUpload(fullPath);
            }
            else {
                await this.queueFileForUpload(fullPath);
            }
        }
        // Process Downloads (Sequential for now to avoid overwhelming connection)
        // For downloads we need the full remote path - use item.path (remote name)
        const remoteRoot = this.config.target_directory || '/';
        for (const item of downloads) {
            const relPath = path.posix.join(basePath === '/' ? '' : basePath, item.path);
            const remotePath = path.posix.join(remoteRoot, relPath);
            if (item.isDirectory) {
                await this.downloadDirectory(remotePath);
            }
            else {
                await this.manualDownload(remotePath);
            }
        }
    }
    async queueDirectoryUpload(localDirPath) {
        if (!fs.existsSync(localDirPath))
            return;
        try {
            const items = await fs.readdir(localDirPath);
            for (const item of items) {
                const itemPath = path.join(localDirPath, item);
                const stats = await fs.stat(itemPath);
                if (stats.isDirectory()) {
                    await this.queueDirectoryUpload(itemPath);
                }
                else {
                    await this.queueFileForUpload(itemPath);
                }
            }
        }
        catch (err) {
            this.log('error', `Failed to queue directory ${path.basename(localDirPath)}: ${err.message}`);
        }
    }
    async downloadDirectory(remoteDirPath) {
        this.log('info', `Downloading directory: ${path.basename(remoteDirPath)}...`);
        try {
            let files = [];
            // listRemoteFilesUnified handles its own locking per-directory
            files = await this.listRemoteFilesUnified(remoteDirPath);
            this.log('info', `Found ${files.length} files in ${path.basename(remoteDirPath)}`);
            for (const file of files) {
                await this.manualDownload(file.path);
            }
        }
        catch (err) {
            this.log('error', `Failed to download directory ${path.basename(remoteDirPath)}: ${err.message}`);
        }
    }
    async getContentDiff(localFilename, remoteName) {
        return this.mutex.run(async () => {
            await this.ensureConnection();
            const localPath = path.join(this.localRoot, localFilename);
            const effectiveRemoteName = (remoteName || localFilename).replace(/\\/g, '/');
            const remoteRoot = this.config.target_directory || '/';
            const remotePath = path.posix.join(remoteRoot, effectiveRemoteName);
            let localContent = null;
            let remoteContent = null;
            // Read Local
            try {
                if (fs.existsSync(localPath)) {
                    // Check size to avoid killing server
                    const stats = fs.statSync(localPath);
                    if (stats.size > 1024 * 1024 * 5) { // 5MB limit
                        localContent = "File too large to display ( > 5MB )";
                    }
                    else {
                        localContent = await fs.readFile(localPath, 'utf8');
                    }
                }
            }
            catch (err) {
                localContent = null;
            }
            // Read Remote
            try {
                // We need to download to a buffer
                // basic-ftp doesn't strictly support downloadToBuffer easily without a stream
                // Use a temporary WritableStream implementation
                const chunks = [];
                const writable = new (require('stream').Writable)({
                    write(chunk, encoding, callback) {
                        chunks.push(chunk);
                        callback();
                    }
                });
                await this.client.downloadTo(writable, remotePath);
                const buffer = Buffer.concat(chunks);
                if (buffer.length > 1024 * 1024 * 5) {
                    remoteContent = "File too large to display ( > 5MB )";
                }
                else {
                    remoteContent = buffer.toString('utf8');
                }
            }
            catch (err) {
                // If file doesn't exist remotely
                remoteContent = null;
            }
            return { local: localContent, remote: remoteContent };
        });
    }
}
class SyncManager {
    sessions = new Map();
    async getSession(connectionId) {
        if (this.sessions.has(connectionId)) {
            return this.sessions.get(connectionId);
        }
        const db = await getDb();
        const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
        if (!config)
            throw new Error('Connection not found');
        const session = new SyncSession(connectionId, config);
        this.sessions.set(connectionId, session);
        return session;
    }
    async startSync(connectionId) {
        const session = await this.getSession(connectionId);
        await session.start();
    }
    async stopSync(connectionId) {
        const session = this.sessions.get(connectionId);
        if (session) {
            await session.stop();
            this.sessions.delete(connectionId);
        }
    }
    async manualUpload(connectionId, filename, remoteName) {
        const session = await this.getSession(connectionId);
        await session.manualUpload(filename, remoteName);
    }
    async manualDownload(connectionId, remotePath) {
        const session = await this.getSession(connectionId);
        await session.manualDownload(remotePath);
    }
    async processBulkSync(connectionId, items, basePath) {
        const session = await this.getSession(connectionId);
        await session.processBulkSync(items, basePath);
    }
    async listRemoteFilesInteractive(connectionId, dir) {
        const session = await this.getSession(connectionId);
        return session.listRemoteFilesInteractive(dir);
    }
    async getContentDiff(connectionId, filename, remoteName) {
        const session = await this.getSession(connectionId);
        return session.getContentDiff(filename, remoteName);
    }
    // Removed suspend/resume exports since we use shared connection
    /*
    public async suspendSync(connectionId: number) { ... }
    public async resumeSync(connectionId: number) { ... }
    */
    getStatus(connectionId) {
        return {
            running: this.sessions.has(connectionId),
            logs: this.sessions.get(connectionId)?.getLogs() || []
        };
    }
    getProgress(connectionId) {
        const session = this.sessions.get(connectionId);
        if (!session)
            return null;
        return session.getProgress();
    }
}
export default new SyncManager();
