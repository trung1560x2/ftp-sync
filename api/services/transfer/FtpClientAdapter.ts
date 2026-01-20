
import { Client, FileInfo } from 'basic-ftp';
import { TransferClient, ConnectOptions, FileStats } from './TransferClient.js';
import { Readable } from 'stream';
import path from 'path';

export class FtpClientAdapter implements TransferClient {
    private client: Client;

    constructor(timeout = 30000) {
        this.client = new Client(timeout);
    }

    async connect(options: ConnectOptions): Promise<void> {
        await this.client.access({
            host: options.host,
            port: options.port,
            user: options.username,
            password: options.password,
            secure: options.secure,
            secureOptions: options.secureOptions
        });
    }

    close(): void {
        if (!this.client.closed) {
            this.client.close();
        }
    }

    async list(remotePath: string): Promise<FileStats[]> {
        const list = await this.client.list(remotePath);
        return list.map((item: FileInfo) => ({
            name: item.name,
            size: item.size,
            modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : undefined,
            isDirectory: item.isDirectory,
            path: path.posix.join(remotePath, item.name)
        }));
    }

    async stat(remotePath: string): Promise<FileStats | null> {
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
        } catch (err: any) {
            // If file doesn't exist or is a directory (some servers), it might throw
            return null;
        }
    }

    async uploadFrom(source: Readable | string, remotePath: string): Promise<void> {
        await this.client.uploadFrom(source, remotePath);
    }

    async downloadTo(localPath: string, remotePath: string): Promise<void> {
        await this.client.downloadTo(localPath, remotePath);
    }

    async ensureDir(remotePath: string): Promise<void> {
        await this.client.ensureDir(remotePath);
    }

    async remove(remotePath: string): Promise<void> {
        await this.client.remove(remotePath);
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        await this.client.rename(oldPath, newPath);
    }

    trackProgress(handler?: (info: { bytes: number; name: string }) => void): void {
        if (handler) {
            this.client.trackProgress(info => {
                handler({ bytes: info.bytes, name: info.name });
            });
        } else {
            this.client.trackProgress();
        }
    }

    get closed(): boolean {
        return this.client.closed;
    }
}
