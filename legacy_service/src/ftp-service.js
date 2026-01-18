const ftp = require('basic-ftp');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const fs = require('fs-extra');

class FtpService {
    constructor() {
        this.client = new ftp.Client();
        // this.client.ftp.verbose = true; // Bật nếu muốn debug chi tiết FTP commands
    }

    async connect() {
        try {
            if (this.client.closed) {
                await this.client.access({
                    host: config.ftp.host,
                    user: config.ftp.user,
                    password: config.ftp.password,
                    secure: config.ftp.secure,
                    port: config.ftp.port
                });
                logger.info('FTP Connected');
            }
        } catch (err) {
            logger.error('FTP Connection Error: %s', err.message);
            throw err;
        }
    }

    async disconnect() {
        if (!this.client.closed) {
            this.client.close();
            logger.info('FTP Disconnected');
        }
    }

    // Chuyển đổi đường dẫn Window sang FTP path (dùng /)
    toFtpPath(localPath) {
        const relative = path.relative(config.localRoot, localPath);
        const ftpPath = path.posix.join(config.remoteRoot, relative.split(path.sep).join('/'));
        return ftpPath;
    }

    // Upload file
    async uploadFile(localPath) {
        await this.connect();
        const remotePath = this.toFtpPath(localPath);
        const remoteDir = path.posix.dirname(remotePath);

        try {
            await this.client.ensureDir(remoteDir);
            await this.client.uploadFrom(localPath, remotePath);
            logger.info(`Uploaded: ${localPath} -> ${remotePath}`);
        } catch (err) {
            logger.error(`Upload Failed: ${localPath} - ${err.message}`);
        }
    }

    // Download file
    async downloadFile(remotePath) {
        await this.connect();
        // Tính toán local path từ remote path
        const relPath = path.posix.relative(config.remoteRoot, remotePath);
        const localPath = path.join(config.localRoot, relPath.split('/').join(path.sep));
        
        try {
            await fs.ensureDir(path.dirname(localPath));
            await this.client.downloadTo(localPath, remotePath);
            logger.info(`Downloaded: ${remotePath} -> ${localPath}`);
            
            // Cập nhật timestamp của file local giống với server (nếu có thể lấy được)
            // basic-ftp không return timestamp sau download ngay, cần logic phụ nếu muốn chính xác tuyệt đối
        } catch (err) {
            logger.error(`Download Failed: ${remotePath} - ${err.message}`);
        }
    }

    // Lấy danh sách file đệ quy từ server
    async listRemoteFiles(dir = config.remoteRoot) {
        await this.connect();
        let files = [];
        try {
            const list = await this.client.list(dir);
            for (const item of list) {
                const itemPath = path.posix.join(dir, item.name);
                if (item.isDirectory) {
                    const subFiles = await this.listRemoteFiles(itemPath);
                    files = files.concat(subFiles);
                } else {
                    files.push({
                        path: itemPath,
                        size: item.size,
                        modifiedAt: item.modifiedAt // Date object
                    });
                }
            }
        } catch (err) {
            logger.error(`List Failed at ${dir}: ${err.message}`);
        }
        return files;
    }

    async deleteFile(localPath) {
        await this.connect();
        const remotePath = this.toFtpPath(localPath);
        try {
            await this.client.remove(remotePath);
            logger.info(`Deleted Remote: ${remotePath}`);
        } catch (err) {
            // Ignore error if file doesn't exist
            logger.warn(`Delete Remote Failed: ${remotePath} - ${err.message}`);
        }
    }
}

module.exports = new FtpService();
