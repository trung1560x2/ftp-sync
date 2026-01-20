import SftpClient from 'ssh2-sftp-client';
import path from 'path';
export class SftpClientAdapter {
    client;
    _closed = true;
    constructor() {
        this.client = new SftpClient();
    }
    async connect(options) {
        const connectConfig = {
            host: options.host,
            port: options.port,
            username: options.username,
            password: options.password,
        };
        if (options.privateKey) {
            connectConfig.privateKey = options.privateKey;
            // If using private key, passphrase might be in password field depending on UI, 
            // but usually password is for password auth. ssh2-sftp-client supports 'passphrase' if key is encrypted.
            // For now we assume password logic is distinct or handled by UI providing simple inputs.
            // If password field is actually the passphrase for the key:
            if (options.password) {
                connectConfig.passphrase = options.password;
                delete connectConfig.password; // Prioritize key auth
            }
        }
        await this.client.connect(connectConfig);
        this._closed = false;
    }
    close() {
        this.client.end().then(() => {
            this._closed = true;
        }).catch(() => {
            this._closed = true;
        });
    }
    async list(remotePath) {
        const list = await this.client.list(remotePath);
        return list.map((item) => ({
            name: item.name,
            size: item.size,
            modifiedAt: new Date(item.modifyTime),
            isDirectory: item.type === 'd',
            path: path.posix.join(remotePath, item.name)
        }));
    }
    async stat(remotePath) {
        try {
            const stats = await this.client.stat(remotePath);
            return {
                name: path.basename(remotePath),
                size: stats.size,
                modifiedAt: new Date(stats.modifyTime),
                isDirectory: stats.isDirectory,
                path: remotePath
            };
        }
        catch (err) {
            return null;
        }
    }
    async uploadFrom(source, remotePath) {
        const options = this.progressHandler ? {
            step: (total_transferred, chunk, total) => {
                this.progressHandler({ bytes: total_transferred, name: path.basename(remotePath) });
            }
        } : undefined;
        if (typeof source === 'string') {
            await this.client.put(source, remotePath, options);
        }
        else {
            await this.client.put(source, remotePath, options);
        }
    }
    async downloadTo(localPath, remotePath) {
        const options = this.progressHandler ? {
            step: (total_transferred, chunk, total) => {
                this.progressHandler({ bytes: total_transferred, name: path.basename(remotePath) });
            }
        } : undefined;
        await this.client.fastGet(remotePath, localPath, options);
    }
    async ensureDir(remotePath) {
        const exists = await this.client.exists(remotePath);
        if (!exists) {
            try {
                await this.client.mkdir(remotePath, true);
            }
            catch (err) {
                // Ignore error if it was created concurrently or exists now
                if (err.code !== 4 && !err.message.includes('Failure')) {
                    throw err;
                }
                // Double check
                if (!await this.client.exists(remotePath)) {
                    throw err;
                }
            }
        }
    }
    async remove(remotePath) {
        const type = await this.client.exists(remotePath);
        if (type === 'd') {
            await this.client.rmdir(remotePath, true);
        }
        else if (type !== false) {
            await this.client.delete(remotePath);
        }
    }
    async rename(oldPath, newPath) {
        await this.client.rename(oldPath, newPath);
    }
    trackProgress(handler) {
        this.progressHandler = handler;
    }
    progressHandler;
    get closed() {
        return this._closed;
    }
}
