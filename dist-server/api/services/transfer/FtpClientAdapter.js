import { Client } from 'basic-ftp';
import path from 'path';
export class FtpClientAdapter {
    client;
    constructor(timeout = 30000) {
        this.client = new Client(timeout);
    }
    async connect(options) {
        await this.client.access({
            host: options.host,
            port: options.port,
            user: options.username,
            password: options.password,
            secure: options.secure,
            secureOptions: options.secureOptions
        });
    }
    close() {
        if (!this.client.closed) {
            this.client.close();
        }
    }
    async list(remotePath) {
        const list = await this.client.list(remotePath);
        return list.map((item) => ({
            name: item.name,
            size: item.size,
            modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : undefined,
            isDirectory: item.isDirectory,
            path: path.posix.join(remotePath, item.name)
        }));
    }
    async stat(remotePath) {
        try {
            const size = await this.client.size(remotePath);
            const lastMod = await this.client.lastMod(remotePath);
            return {
                name: path.basename(remotePath),
                size: size,
                modifiedAt: lastMod,
                isDirectory: false, // size() usually works on files
                path: remotePath
            };
        }
        catch (err) {
            // If file doesn't exist or is a directory (some servers), it might throw
            return null;
        }
    }
    async uploadFrom(source, remotePath) {
        await this.client.uploadFrom(source, remotePath);
    }
    async downloadTo(localPath, remotePath) {
        await this.client.downloadTo(localPath, remotePath);
    }
    async ensureDir(remotePath) {
        await this.client.ensureDir(remotePath);
    }
    async remove(remotePath) {
        await this.client.remove(remotePath);
    }
    async rename(oldPath, newPath) {
        await this.client.rename(oldPath, newPath);
    }
    trackProgress(handler) {
        if (handler) {
            this.client.trackProgress(info => {
                handler({ bytes: info.bytes, name: info.name });
            });
        }
        else {
            this.client.trackProgress();
        }
    }
    get closed() {
        return this.client.closed;
    }
}
