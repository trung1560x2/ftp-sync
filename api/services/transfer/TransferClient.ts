
import { Readable } from 'stream';

export interface FileStats {
    name: string;
    size: number;
    modifiedAt?: Date;
    isDirectory: boolean;
    path: string;
}

export interface ConnectOptions {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string; // For SFTP
    secure?: boolean;    // For FTP (FTPS)
    secureOptions?: any;
}

export interface TransferClient {
    connect(options: ConnectOptions): Promise<void>;
    close(): void;
    list(path: string): Promise<FileStats[]>;
    stat(remotePath: string): Promise<FileStats | null>;
    uploadFrom(source: Readable | string, remotePath: string): Promise<void>;
    downloadTo(localPath: string, remotePath: string): Promise<void>;
    ensureDir(remotePath: string): Promise<void>;
    ensureDir(remotePath: string): Promise<void>;
    remove(remotePath: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    trackProgress(handler?: (info: { bytes: number; name: string }) => void): void;
    readonly closed: boolean;
}
