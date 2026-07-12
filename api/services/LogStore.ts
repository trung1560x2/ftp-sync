import { getDb } from '../db.js';
import fs from 'fs-extra';
import path from 'path';

export interface LogEntry {
    id: number;
    connection_id: number;
    type: 'info' | 'error' | 'success';
    message: string;
    created_at: string;
}

export interface TransferStat {
    id: number;
    connection_id: number;
    bytes: number;
    direction: 'upload' | 'download';
    created_at: string;
}

export interface SyncSessionFile {
    name: string;
    path: string;
    size: number;
    direction: 'upload' | 'download' | 'delete';
    status: 'success' | 'failed' | 'skipped';
    message?: string;
}

export interface SyncSessionEntry {
    id: string;
    connection_id: number;
    timestamp: string;
    status: 'success' | 'failed';
    duration: number;
    files: SyncSessionFile[];
}

class LogStore {
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    private getBasePath(): string {
        const baseDir = process.env.DB_PATH
            ? path.dirname(process.env.DB_PATH)
            : process.cwd();
        return baseDir;
    }

    private getLogsPath(): string {
        return path.join(this.getBasePath(), 'sync_logs.json');
    }

    private getStatsPath(): string {
        return path.join(this.getBasePath(), 'transfer_stats.json');
    }

    public getSessionsPath(): string {
        return path.join(this.getBasePath(), 'sync_sessions.json');
    }

    public async ensureInitialized() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = (async () => {
            await this.migrateJsonToSqlite();
            this.initialized = true;
            this.initPromise = null;
        })();
        
        return this.initPromise;
    }

    private async migrateJsonToSqlite() {
        const logsPath = this.getLogsPath();
        const statsPath = this.getStatsPath();
        const sessionsPath = this.getSessionsPath();

        const db = await getDb();

        // 1. Migrate Logs
        if (fs.existsSync(logsPath)) {
            try {
                console.log('Migrating logs from JSON to SQLite...');
                const data = fs.readJsonSync(logsPath);
                const logs: any[] = data.logs || [];
                
                await db.exec('BEGIN TRANSACTION;');
                for (const log of logs) {
                    await db.run(
                        'INSERT INTO sync_logs (connection_id, type, message, created_at) VALUES (?, ?, ?, ?)',
                        log.connection_id,
                        log.type,
                        log.message,
                        log.created_at
                    );
                }
                await db.exec('COMMIT;');
                
                console.log(`Successfully migrated ${logs.length} logs to SQLite.`);
                fs.removeSync(logsPath);
            } catch (e) {
                await db.exec('ROLLBACK;');
                console.error('Failed to migrate logs from JSON:', e);
            }
        }

        // 2. Migrate Stats
        if (fs.existsSync(statsPath)) {
            try {
                console.log('Migrating transfer stats from JSON to SQLite...');
                const data = fs.readJsonSync(statsPath);
                const stats: any[] = data.stats || [];
                
                await db.exec('BEGIN TRANSACTION;');
                for (const stat of stats) {
                    await db.run(
                        'INSERT INTO transfer_stats (connection_id, bytes, direction, created_at) VALUES (?, ?, ?, ?)',
                        stat.connection_id,
                        stat.bytes,
                        stat.direction,
                        stat.created_at
                    );
                }
                await db.exec('COMMIT;');
                
                console.log(`Successfully migrated ${stats.length} stats to SQLite.`);
                fs.removeSync(statsPath);
            } catch (e) {
                await db.exec('ROLLBACK;');
                console.error('Failed to migrate stats from JSON:', e);
            }
        }

        // 3. Migrate Sessions
        if (fs.existsSync(sessionsPath)) {
            try {
                console.log('Migrating sync sessions from JSON to SQLite...');
                const data = fs.readJsonSync(sessionsPath);
                const sessions: any[] = data.sessions || [];
                
                await db.exec('BEGIN TRANSACTION;');
                for (const session of sessions) {
                    await db.run(
                        'INSERT INTO sync_sessions (id, connection_id, timestamp, status, duration, files) VALUES (?, ?, ?, ?, ?, ?)',
                        session.id,
                        session.connection_id,
                        session.timestamp,
                        session.status,
                        session.duration,
                        JSON.stringify(session.files)
                    );
                }
                await db.exec('COMMIT;');
                
                console.log(`Successfully migrated ${sessions.length} sessions to SQLite.`);
                fs.removeSync(sessionsPath);
            } catch (e) {
                await db.exec('ROLLBACK;');
                console.error('Failed to migrate sessions from JSON:', e);
            }
        }
    }

    public flushSync() {
        // No-op: we write to SQLite instantly now, so no emergency backup flush is needed!
    }

    async addLog(connectionId: number, type: 'info' | 'error' | 'success', message: string): Promise<LogEntry> {
        await this.ensureInitialized();
        const db = await getDb();
        const createdAt = new Date().toISOString();

        const result = await db.run(
          'INSERT INTO sync_logs (connection_id, type, message, created_at) VALUES (?, ?, ?, ?)',
          connectionId,
          type,
          message,
          createdAt
        );

        const entry: LogEntry = {
          id: result.lastID!,
          connection_id: connectionId,
          type,
          message,
          created_at: createdAt
        };

        // Keep only last 1000 logs per connection
        await db.run(`
          DELETE FROM sync_logs 
          WHERE connection_id = ? 
            AND id NOT IN (
              SELECT id FROM sync_logs 
              WHERE connection_id = ? 
              ORDER BY id DESC 
              LIMIT 1000
            );
        `, connectionId, connectionId);

        return entry;
    }

    async addTransferStat(connectionId: number, bytes: number, direction: 'upload' | 'download'): Promise<TransferStat> {
        await this.ensureInitialized();
        const db = await getDb();
        const createdAt = new Date().toISOString();

        const result = await db.run(
          'INSERT INTO transfer_stats (connection_id, bytes, direction, created_at) VALUES (?, ?, ?, ?)',
          connectionId,
          bytes,
          direction,
          createdAt
        );

        const entry: TransferStat = {
          id: result.lastID!,
          connection_id: connectionId,
          bytes,
          direction,
          created_at: createdAt
        };

        // Keep only last 365 days of stats
        await db.run(`
          DELETE FROM transfer_stats 
          WHERE created_at < datetime('now', '-365 days');
        `);

        return entry;
    }

    async getLogs(connectionId: number, limit: number = 200): Promise<LogEntry[]> {
        await this.ensureInitialized();
        const db = await getDb();
        return await db.all<LogEntry[]>(
          'SELECT id, connection_id, type, message, created_at FROM sync_logs WHERE connection_id = ? ORDER BY id DESC LIMIT ?',
          connectionId,
          limit
        );
    }

    async getAllLogs(limit: number = 200): Promise<LogEntry[]> {
        await this.ensureInitialized();
        const db = await getDb();
        return await db.all<LogEntry[]>(
          'SELECT id, connection_id, type, message, created_at FROM sync_logs ORDER BY id DESC LIMIT ?',
          limit
        );
    }

    async clearLogs(connectionId: number): Promise<void> {
        await this.ensureInitialized();
        const db = await getDb();
        await db.run('DELETE FROM sync_logs WHERE connection_id = ?', connectionId);
    }

    async getStats(connectionId: number) {
        await this.ensureInitialized();
        const db = await getDb();
        const connStats = await db.all<{ bytes: number; direction: string; created_at: string }[]>(
          'SELECT bytes, direction, created_at FROM transfer_stats WHERE connection_id = ?',
          connectionId
        );

        // Daily stats for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyStats: { date: string; direction: string; total_bytes: number }[] = [];
        const dailyMap: Record<string, Record<string, number>> = {};

        connStats
            .filter(s => new Date(s.created_at) > sevenDaysAgo)
            .forEach(s => {
                const date = s.created_at.split('T')[0];
                if (!dailyMap[date]) dailyMap[date] = { upload: 0, download: 0 };
                dailyMap[date][s.direction] += s.bytes;
            });

        Object.entries(dailyMap).forEach(([date, dirs]) => {
            dailyStats.push({ date, direction: 'upload', total_bytes: dirs.upload });
            dailyStats.push({ date, direction: 'download', total_bytes: dirs.download });
        });
        dailyStats.sort((a, b) => a.date.localeCompare(b.date));

        // Total stats
        let total_uploaded = 0;
        let total_downloaded = 0;
        connStats.forEach(s => {
            if (s.direction === 'upload') total_uploaded += s.bytes;
            else total_downloaded += s.bytes;
        });

        return {
            dailyStats,
            totalStats: { total_uploaded, total_downloaded }
        };
    }

    async getAllStats() {
        await this.ensureInitialized();
        const db = await getDb();
        const stats = await db.all<{ bytes: number; direction: string; created_at: string }[]>(
          'SELECT bytes, direction, created_at FROM transfer_stats'
        );

        // Daily stats for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyStats: { date: string; direction: string; total_bytes: number }[] = [];
        const dailyMap: Record<string, Record<string, number>> = {};

        stats
            .filter(s => new Date(s.created_at) > sevenDaysAgo)
            .forEach(s => {
                const date = s.created_at.split('T')[0];
                if (!dailyMap[date]) dailyMap[date] = { upload: 0, download: 0 };
                dailyMap[date][s.direction] += s.bytes;
            });

        Object.entries(dailyMap).forEach(([date, dirs]) => {
            dailyStats.push({ date, direction: 'upload', total_bytes: dirs.upload });
            dailyStats.push({ date, direction: 'download', total_bytes: dirs.download });
        });
        dailyStats.sort((a, b) => a.date.localeCompare(b.date));

        // Total stats
        let total_uploaded = 0;
        let total_downloaded = 0;
        stats.forEach(s => {
            if (s.direction === 'upload') total_uploaded += s.bytes;
            else total_downloaded += s.bytes;
        });

        return {
            dailyStats,
            totalStats: { total_uploaded, total_downloaded }
        };
    }

    public getBackupFilePath(connectionId: number, sessionId: string, relPath: string, customBackupPath?: string): string {
        const baseBackupPath = customBackupPath && customBackupPath.trim() !== ''
            ? customBackupPath
            : path.join(this.getBasePath(), 'sync_data', 'history');
        
        return path.join(baseBackupPath, `connection_${connectionId}`, sessionId, relPath);
    }

    public async addSyncSession(session: SyncSessionEntry, customBackupPath?: string): Promise<void> {
        await this.ensureInitialized();
        const db = await getDb();

        await db.run(
          'INSERT INTO sync_sessions (id, connection_id, timestamp, status, duration, files) VALUES (?, ?, ?, ?, ?, ?)',
          session.id,
          session.connection_id,
          session.timestamp,
          session.status,
          session.duration,
          JSON.stringify(session.files)
        );

        // Keep only last 50 sessions per connection
        const sessionsToRemove = await db.all<{ id: string }[]>(
          'SELECT id FROM sync_sessions WHERE connection_id = ? ORDER BY timestamp DESC LIMIT -1 OFFSET 50',
          session.connection_id
        );

        if (sessionsToRemove.length > 0) {
            const idsToRemove = sessionsToRemove.map(s => s.id);
            
            // Delete from database
            await db.run(
              `DELETE FROM sync_sessions WHERE connection_id = ? AND id IN (${idsToRemove.map(() => '?').join(',')})`,
              session.connection_id,
              ...idsToRemove
            );

            // Delete historical files for removed sessions
            const baseBackupPath = customBackupPath && customBackupPath.trim() !== ''
                ? customBackupPath
                : path.join(this.getBasePath(), 'sync_data', 'history');

            for (const s of sessionsToRemove) {
                try {
                    const sessionBackupDir = path.join(baseBackupPath, `connection_${session.connection_id}`, s.id);
                    if (fs.existsSync(sessionBackupDir)) {
                        fs.removeSync(sessionBackupDir);
                        console.log('Cleaned up old session backup dir:', sessionBackupDir);
                    }
                } catch (err) {
                    console.error('Failed to clean up old session backup dir:', err);
                }
            }
        }
    }

    public async getSyncSessions(connectionId: number, limit: number = 50): Promise<SyncSessionEntry[]> {
        await this.ensureInitialized();
        const db = await getDb();
        const rows = await db.all<{ id: string; connection_id: number; timestamp: string; status: 'success' | 'failed'; duration: number; files: string }[]>(
          'SELECT id, connection_id, timestamp, status, duration, files FROM sync_sessions WHERE connection_id = ? ORDER BY timestamp DESC LIMIT ?',
          connectionId,
          limit
        );

        return rows.map(r => ({
          id: r.id,
          connection_id: r.connection_id,
          timestamp: r.timestamp,
          status: r.status,
          duration: r.duration,
          files: JSON.parse(r.files)
        }));
    }

    public async getAllSyncSessions(limit: number = 50): Promise<SyncSessionEntry[]> {
        await this.ensureInitialized();
        const db = await getDb();
        const rows = await db.all<{ id: string; connection_id: number; timestamp: string; status: 'success' | 'failed'; duration: number; files: string }[]>(
          'SELECT id, connection_id, timestamp, status, duration, files FROM sync_sessions ORDER BY timestamp DESC LIMIT ?',
          limit
        );

        return rows.map(r => ({
          id: r.id,
          connection_id: r.connection_id,
          timestamp: r.timestamp,
          status: r.status,
          duration: r.duration,
          files: JSON.parse(r.files)
        }));
    }

    public async clearSyncSessions(connectionId: number, customBackupPath?: string): Promise<void> {
        await this.ensureInitialized();
        const db = await getDb();
        await db.run('DELETE FROM sync_sessions WHERE connection_id = ?', connectionId);

        // Clear historical backup files from disk
        try {
            const baseBackupPath = customBackupPath && customBackupPath.trim() !== ''
                ? customBackupPath
                : path.join(this.getBasePath(), 'sync_data', 'history');
            
            const connBackupDir = path.join(baseBackupPath, `connection_${connectionId}`);
            if (fs.existsSync(connBackupDir)) {
                fs.removeSync(connBackupDir);
                console.log('Cleared backup directory:', connBackupDir);
            }
        } catch (e) {
            console.error('Failed to clear backup directory:', e);
        }
    }

    public async getHeatmapData(connectionId: number) {
        await this.ensureInitialized();
        const db = await getDb();
        const rows = await db.all<{ timestamp: string; files: string }[]>(
          "SELECT timestamp, files FROM sync_sessions WHERE connection_id = ? AND timestamp >= datetime('now', '-365 days')",
          connectionId
        );
        
        const heatmapMap: Record<string, { date: string, count: number, bytes: number }> = {};
        
        rows.forEach(session => {
            const dateStr = session.timestamp.split('T')[0];
            const files = JSON.parse(session.files) as SyncSessionFile[];
            if (!heatmapMap[dateStr]) {
                heatmapMap[dateStr] = { date: dateStr, count: 0, bytes: 0 };
            }
            const successFiles = files.filter(f => f.status === 'success');
            heatmapMap[dateStr].count += successFiles.length;
            heatmapMap[dateStr].bytes += successFiles.reduce((acc, f) => acc + f.size, 0);
        });
        
        return Object.values(heatmapMap);
    }

    public async cleanupOldData(retentionDays: number): Promise<void> {
        await this.ensureInitialized();
        const db = await getDb();
        
        // Calculate date threshold ISO string
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - retentionDays);
        const dateLimitStr = dateLimit.toISOString();

        await db.exec('BEGIN TRANSACTION;');
        try {
            // 1. Delete old logs
            await db.run('DELETE FROM sync_logs WHERE created_at < ?', dateLimitStr);

            // 2. Delete old transfer stats
            await db.run('DELETE FROM transfer_stats WHERE created_at < ?', dateLimitStr);

            // 3. Select old sessions to clean up disk backups
            const oldSessions = await db.all<{ id: string; connection_id: number }[]>(
                'SELECT id, connection_id FROM sync_sessions WHERE timestamp < ?',
                dateLimitStr
            );

            // 4. Delete old sessions from database
            await db.run('DELETE FROM sync_sessions WHERE timestamp < ?', dateLimitStr);

            await db.exec('COMMIT;');

            // 5. Clean up historical backups on disk
            if (oldSessions.length > 0) {
                const baseBackupPath = path.join(this.getBasePath(), 'sync_data', 'history');
                for (const s of oldSessions) {
                    try {
                        const sessionBackupDir = path.join(baseBackupPath, `connection_${s.connection_id}`, s.id);
                        if (fs.existsSync(sessionBackupDir)) {
                            fs.removeSync(sessionBackupDir);
                        }
                    } catch (err) {
                        console.error('Failed to clean up old session backup dir during settings cleanup:', err);
                    }
                }
            }
            console.log(`Cleaned up SQLite logs/sessions older than ${retentionDays} days.`);
        } catch (err) {
            await db.exec('ROLLBACK;');
            console.error('Failed database cleanup transaction:', err);
            throw err;
        }
    }
}

// Singleton instance
export const logStore = new LogStore();
