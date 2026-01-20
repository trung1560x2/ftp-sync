import { TransferClient } from './transfer/TransferClient.js';
import { TransferClientFactory } from './transfer/TransferClientFactory.js';
import { getDb } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import path from 'path';
import fs from 'fs-extra';

interface DeploymentStatus {
    id: string; // connectionId
    status: 'idle' | 'deploying' | 'rolling_back';
    step: string;
    progress: number;
    error?: string;
}

class DeploymentService {
    private static instance: DeploymentService;
    private statuses: Map<number, DeploymentStatus> = new Map();

    private constructor() { }

    public static getInstance(): DeploymentService {
        if (!DeploymentService.instance) {
            DeploymentService.instance = new DeploymentService();
        }
        return DeploymentService.instance;
    }

    public getStatus(connectionId: number): DeploymentStatus | null {
        return this.statuses.get(connectionId) || null;
    }

    private updateStatus(connectionId: number, update: Partial<DeploymentStatus>) {
        const current = this.statuses.get(connectionId) || {
            id: connectionId.toString(),
            status: 'idle',
            step: '',
            progress: 0
        };
        this.statuses.set(connectionId, { ...current, ...update });
    }

    private async getConnection(connectionId: number) {
        const db = await getDb();
        const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
        if (!config) throw new Error('Connection not found');

        const password = decrypt(config.password_hash);
        const client = TransferClientFactory.createClient(config.protocol || 'ftp');

        await client.connect({
            host: config.server,
            port: config.port,
            username: config.username,
            password: password,
            secure: config.secure === 1,
            privateKey: config.private_key
        });

        return { client, config };
    }

    // LIST BACKUPS
    public async getBackups(connectionId: number) {
        let client;
        try {
            const conn = await this.getConnection(connectionId);
            client = conn.client;
            const config = conn.config;

            const targetDir = config.target_directory || '/';
            const parentDir = path.posix.dirname(targetDir);
            const dirName = path.posix.basename(targetDir);

            // List parent directory to find backups
            const files = await client.list(parentDir);

            // Filter folders that match pattern: dirName_backup_TIMESTAMP
            const backupRegex = new RegExp(`^${dirName}_backup_(\\d+)$`);

            const backups = files
                .filter(f => f.isDirectory && backupRegex.test(f.name))
                .map(f => {
                    const match = f.name.match(backupRegex);
                    return {
                        name: f.name,
                        timestamp: match ? parseInt(match[1]) : 0,
                        path: f.path
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp); // Newest first

            return backups;

        } finally {
            if (client) client.close();
        }
    }

    // ATOMIC DEPLOY
    public async deploy(connectionId: number) {
        if (this.statuses.get(connectionId)?.status === 'deploying') {
            throw new Error('Deployment already in progress');
        }

        this.updateStatus(connectionId, { status: 'deploying', progress: 0, step: 'Initializing', error: undefined });

        let client: TransferClient | null = null;

        try {
            const { client: c, config } = await this.getConnection(connectionId);
            client = c;

            const localRoot = config.local_path || path.resolve(process.cwd(), 'sync_data', connectionId.toString());
            const targetDir = config.target_directory; // e.g., /var/www/html
            const parentDir = path.posix.dirname(targetDir); // e.g., /var/www
            const dirName = path.posix.basename(targetDir); // e.g., html

            const timestamp = Date.now();
            const releaseName = `${dirName}_release_${timestamp}`;
            const releasePath = path.posix.join(parentDir, releaseName);

            // 1. Upload to Release Folder
            this.updateStatus(connectionId, { step: `Uploading to ${releaseName}...`, progress: 10 });
            await client.ensureDir(releasePath);

            // Recursive upload function
            const uploadDir = async (local: string, remote: string) => {
                const items = await fs.readdir(local);
                let count = 0;
                for (const item of items) {
                    const localItem = path.join(local, item);
                    const remoteItem = path.posix.join(remote, item);
                    const stats = await fs.stat(localItem);

                    if (stats.isDirectory()) {
                        await client!.ensureDir(remoteItem);
                        await uploadDir(localItem, remoteItem);
                    } else {
                        await client!.uploadFrom(localItem, remoteItem);
                    }
                    count++;
                    // Basic progress estimation (improving this would require counting all files first)
                    // For now, just keep status alive
                }
            };

            await uploadDir(localRoot, releasePath);
            this.updateStatus(connectionId, { step: 'Upload complete. Swapping...', progress: 80 });

            // 2. Atomic Swap
            // Check if targetDir exists
            const targetStats = await client.stat(targetDir);

            if (targetStats) {
                // Rename Live -> Backup
                const backupName = `${dirName}_backup_${timestamp}`;
                const backupPath = path.posix.join(parentDir, backupName);
                await client.rename(targetDir, backupPath);
            }

            // Rename Release -> Live
            await client.rename(releasePath, targetDir);

            this.updateStatus(connectionId, { step: 'Deployment Successful!', progress: 100, status: 'idle' });

        } catch (err: any) {
            console.error('Deployment failed', err);
            this.updateStatus(connectionId, { status: 'idle', error: err.message });
            throw err;
        } finally {
            if (client) client.close();
        }
    }

    // ROLLBACK
    public async rollback(connectionId: number, backupName: string) {
        if (this.statuses.get(connectionId)?.status === 'rolling_back') {
            throw new Error('Rollback already in progress');
        }

        this.updateStatus(connectionId, { status: 'rolling_back', progress: 0, step: 'Initializing rollback...', error: undefined });

        let client: TransferClient | null = null;

        try {
            const { client: c, config } = await this.getConnection(connectionId);
            client = c;

            const targetDir = config.target_directory;
            const parentDir = path.posix.dirname(targetDir);
            const dirName = path.posix.basename(targetDir);
            const backupPath = path.posix.join(parentDir, backupName);

            // Validate backup exists
            const backupStats = await client.stat(backupPath);
            if (!backupStats) throw new Error('Backup folder not found');

            this.updateStatus(connectionId, { step: 'Backing up current state...', progress: 20 });

            // Rename Current -> Rollback_Failstate (store just in case)
            const currentTimestamp = Date.now();
            const failStateName = `${dirName}_rollback_${currentTimestamp}`;
            const failStatePath = path.posix.join(parentDir, failStateName);

            const targetStats = await client.stat(targetDir);
            if (targetStats) {
                await client.rename(targetDir, failStatePath);
            }

            this.updateStatus(connectionId, { step: 'Restoring backup...', progress: 50 });

            // Rename Backup -> Live
            await client.rename(backupPath, targetDir);

            this.updateStatus(connectionId, { step: 'Rollback Successful!', progress: 100, status: 'idle' });

        } catch (err: any) {
            console.error('Rollback failed', err);
            this.updateStatus(connectionId, { status: 'idle', error: err.message });
            throw err;
        } finally {
            if (client) client.close();
        }
    }
}

export default DeploymentService.getInstance();
