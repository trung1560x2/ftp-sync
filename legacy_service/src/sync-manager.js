const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');
const config = require('./config');
const logger = require('./logger');
const ftpService = require('./ftp-service');

class SyncManager {
    constructor() {
        this.isSyncing = false;
        this.watcher = null;
        this.timer = null;
    }

    async start() {
        logger.info(`Starting Sync Manager in mode: ${config.syncMode}`);
        logger.info(`Local Root: ${config.localRoot}`);
        logger.info(`Remote Root: ${config.remoteRoot}`);

        // 1. Setup Watcher (Local -> Remote)
        if (config.syncMode === 'bi_directional' || config.syncMode === 'upload_only') {
            this.setupWatcher();
        }

        // 2. Setup Interval Sync (Remote -> Local / Full Check)
        if (config.syncMode === 'bi_directional' || config.syncMode === 'download_only') {
            // Chạy ngay lần đầu
            this.runSyncCycle();
            // Lặp lại
            this.timer = setInterval(() => this.runSyncCycle(), config.syncInterval);
        }
    }

    setupWatcher() {
        logger.info('Initializing Local File Watcher...');
        this.watcher = chokidar.watch(config.localRoot, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true, // Không upload toàn bộ lúc khởi động, để sync cycle lo
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });

        this.watcher
            .on('add', path => this.handleLocalChange(path))
            .on('change', path => this.handleLocalChange(path))
            .on('unlink', path => this.handleLocalDelete(path));
    }

    async handleLocalChange(localPath) {
        // Chỉ upload nếu không đang trong quá trình sync cycle (để tránh loop vô tận nếu download kích hoạt watcher)
        // Tuy nhiên, chokidar có thể phân biệt, và ta có thể check timestamp.
        // Đơn giản nhất: Upload luôn, FTP Service sẽ lo việc kết nối.
        logger.info(`Watcher detected change: ${localPath}`);
        try {
            await ftpService.uploadFile(localPath);
        } catch (err) {
            logger.error(`Watcher Upload Error: ${err.message}`);
        }
    }

    async handleLocalDelete(localPath) {
        logger.info(`Watcher detected delete: ${localPath}`);
        try {
            await ftpService.deleteFile(localPath);
        } catch (err) {
            logger.error(`Watcher Delete Error: ${err.message}`);
        }
    }

    async runSyncCycle() {
        if (this.isSyncing) {
            logger.warn('Sync cycle skipped - Previous cycle still running');
            return;
        }

        this.isSyncing = true;
        logger.info('Starting Periodic Sync Cycle...');

        try {
            // 1. Get Remote Files
            const remoteFiles = await ftpService.listRemoteFiles();
            const remoteMap = new Map(); // path relative -> file info
            
            remoteFiles.forEach(f => {
                const relPath = path.posix.relative(config.remoteRoot, f.path);
                remoteMap.set(relPath, f);
            });

            // 2. Scan Local Files (để so sánh)
            // (Đơn giản hoá: ta chỉ check xem remote có gì mới để kéo về, 
            // còn local mới thì watcher đã lo, nhưng ta cũng nên check lại để đảm bảo consistency)
            
            // Xử lý Download (Remote -> Local)
            for (const [relPath, remoteFile] of remoteMap) {
                const localPath = path.join(config.localRoot, relPath.split('/').join(path.sep));
                
                let shouldDownload = false;

                if (!fs.existsSync(localPath)) {
                    logger.info(`New remote file found: ${relPath}`);
                    shouldDownload = true;
                } else {
                    const localStats = fs.statSync(localPath);
                    // So sánh thời gian (cho phép sai số 2s)
                    const remoteTime = new Date(remoteFile.modifiedAt).getTime();
                    const localTime = localStats.mtime.getTime();

                    if (remoteTime > localTime + 2000) {
                        logger.info(`Remote file newer: ${relPath} (Remote: ${remoteFile.modifiedAt} > Local: ${localStats.mtime})`);
                        shouldDownload = true;
                    }
                }

                if (shouldDownload) {
                    await ftpService.downloadFile(remoteFile.path);
                }
            }

            // Xử lý Upload những file local bị sót (chưa có trên remote)
            // (Optional: Tuỳ thuộc vào yêu cầu "Sync 2 chiều" chặt chẽ đến mức nào. 
            // Để đơn giản và hiệu quả, ta tin tưởng Watcher cho chiều Local -> Remote, 
            // nhưng ở đây ta có thể scan local để tìm file chưa có trên remote)
            
            // Note: Scan toàn bộ local directory mỗi lần có thể chậm nếu folder lớn. 
            // Tạm thời ta tập trung vào Download update từ server.

        } catch (err) {
            logger.error(`Sync Cycle Error: ${err.message}`);
        } finally {
            this.isSyncing = false;
            logger.info('Sync Cycle Completed.');
            // Ngắt kết nối để tiết kiệm resource server nếu interval quá lâu
            if (config.syncInterval > 60000) {
                await ftpService.disconnect();
            }
        }
    }
}

module.exports = new SyncManager();
