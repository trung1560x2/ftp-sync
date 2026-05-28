
import SftpClient from 'ssh2-sftp-client';
import { TransferClient, ConnectOptions, FileStats } from './TransferClient.js';
import { Readable, Writable } from 'stream';
import path from 'path';
import fs from 'fs-extra';

export class SftpClientAdapter implements TransferClient {
    private client: SftpClient;
    private _closed: boolean = true;

    constructor() {
        this.client = new SftpClient();
    }

    async connect(options: ConnectOptions): Promise<void> {
        const connectConfig: any = {
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

    close(): void {
        this.client.end().then(() => {
            this._closed = true;
        }).catch(() => {
            this._closed = true;
        });
    }

    async list(remotePath: string): Promise<FileStats[]> {
        const list = await this.client.list(remotePath);
        return list.map((item: any) => ({
            name: item.name,
            size: item.size,
            modifiedAt: new Date(item.modifyTime),
            isDirectory: item.type === 'd',
            path: path.posix.join(remotePath, item.name)
        }));
    }

    async stat(remotePath: string): Promise<FileStats | null> {
        try {
            const stats = await this.client.stat(remotePath);
            return {
                name: path.basename(remotePath),
                size: stats.size,
                modifiedAt: new Date(stats.modifyTime),
                isDirectory: stats.isDirectory,
                path: remotePath
            };
        } catch (err: any) {
            return null;
        }
    }

    async uploadFrom(source: Readable | string, remotePath: string, options?: { localStart?: number }): Promise<void> {
        const localStart = options?.localStart || 0;
        const sftpOptions: any = this.progressHandler ? {
            step: (total_transferred: number) => {
                this.progressHandler!({ bytes: total_transferred, name: path.basename(remotePath) });
            }
        } : {};

        if (localStart > 0) {
            sftpOptions.writeStreamOptions = {
                flags: 'r+',
                start: localStart
            };
        }

        let finalSource = source;
        if (localStart > 0 && typeof source === 'string') {
            finalSource = fs.createReadStream(source, { start: localStart });
        }

        await this.client.put(finalSource, remotePath, sftpOptions);
    }

    async downloadTo(destination: string | Writable, remotePath: string, startAt?: number): Promise<void> {
        const offset = startAt || 0;
        const sftpOptions: any = this.progressHandler ? {
            step: (total_transferred: number) => {
                this.progressHandler!({ bytes: total_transferred, name: path.basename(remotePath) });
            }
        } : {};

        if (offset > 0) {
            sftpOptions.readStreamOptions = { start: offset };
            if (typeof destination === 'string') {
                const writeStream = fs.createWriteStream(destination, { flags: 'r+', start: offset });
                await this.client.get(remotePath, writeStream, sftpOptions);
            } else {
                await this.client.get(remotePath, destination, sftpOptions);
            }
        } else {
            if (typeof destination === 'string') {
                await this.client.fastGet(remotePath, destination, sftpOptions);
            } else {
                await this.client.get(remotePath, destination, sftpOptions);
            }
        }
    }

    async ensureDir(remotePath: string): Promise<void> {
        const exists = await this.client.exists(remotePath);
        if (!exists) {
            try {
                await this.client.mkdir(remotePath, true);
            } catch (err: any) {
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

    async remove(remotePath: string): Promise<void> {
        const type = await this.client.exists(remotePath);
        if (type === 'd') {
            await this.client.rmdir(remotePath, true);
        } else if (type !== false) {
            await this.client.delete(remotePath);
        }
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        await this.client.rename(oldPath, newPath);
    }

    trackProgress(handler?: (info: { bytes: number; name: string }) => void): void {
        this.progressHandler = handler;
    }

    private progressHandler?: (info: { bytes: number; name: string }) => void;

    get closed(): boolean {
        return this._closed;
    }

    async checkConnection(): Promise<boolean> {
        if (this._closed) return false;
        try {
            // Race with a 2-second timeout to prevent dead/half-open sockets from hanging the main thread
            const check = this.client.cwd();
            const timeout = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Connection check timeout')), 2000)
            );
            await Promise.race([check, timeout]);
            return true;
        } catch {
            return false;
        }
    }
}
