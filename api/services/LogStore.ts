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
    private logs: LogEntry[] = [];
    private stats: TransferStat[] = [];
    private syncSessions: SyncSessionEntry[] = [];
    private logIdCounter = 0;
    private statIdCounter = 0;
    private saveDebounceTimer: NodeJS.Timeout | null = null;
    private initialized = false;
    private isSaving = false;
    private savePending = false;

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

    private ensureInitialized() {
        if (this.initialized) return;
        this.initialized = true;

        console.log('LogStore initializing with base path:', this.getBasePath());
        this.loadFromDisk();
    }

    private loadFromDisk() {
        const logsPath = this.getLogsPath();
        const statsPath = this.getStatsPath();
        const sessionsPath = this.getSessionsPath();

        console.log('Loading logs from:', logsPath);
        console.log('Loading stats from:', statsPath);
        console.log('Loading sessions from:', sessionsPath);

        try {
            if (fs.existsSync(logsPath)) {
                const data = fs.readJsonSync(logsPath);
                this.logs = data.logs || [];
                this.logIdCounter = data.lastId || 0;
                console.log('Loaded', this.logs.length, 'logs');
            }
        } catch (e) {
            console.error('Failed to load logs from disk:', e);
            this.logs = [];
        }

        try {
            if (fs.existsSync(statsPath)) {
                const data = fs.readJsonSync(statsPath);
                this.stats = data.stats || [];
                this.statIdCounter = data.lastId || 0;
                console.log('Loaded', this.stats.length, 'stats');
            }
        } catch (e) {
            console.error('Failed to load stats from disk:', e);
            this.stats = [];
        }

        try {
            if (fs.existsSync(sessionsPath)) {
                const data = fs.readJsonSync(sessionsPath);
                this.syncSessions = data.sessions || [];
                console.log('Loaded', this.syncSessions.length, 'sync sessions');
            }
        } catch (e) {
            console.error('Failed to load sync sessions from disk:', e);
            this.syncSessions = [];
        }
    }

    private saveToDiskDebounced() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        this.saveDebounceTimer = setTimeout(() => {
            this.triggerSave();
        }, 1000);
    }

    private async triggerSave() {
        if (this.isSaving) {
            this.savePending = true;
            return;
        }
        this.isSaving = true;
        this.savePending = false;
        await this.saveToDisk();
        this.isSaving = false;
        if (this.savePending) {
            this.saveToDiskDebounced();
        }
    }

    private async saveToDisk() {
        const logsPath = this.getLogsPath();
        const statsPath = this.getStatsPath();
        const sessionsPath = this.getSessionsPath();

        try {
            await fs.ensureDir(path.dirname(logsPath));
            await fs.writeJson(logsPath, { logs: this.logs, lastId: this.logIdCounter });
            console.log('Saved logs to:', logsPath);
        } catch (e) {
            console.error('Failed to save logs to disk:', e);
        }

        try {
            await fs.ensureDir(path.dirname(statsPath));
            await fs.writeJson(statsPath, { stats: this.stats, lastId: this.statIdCounter });
        } catch (e) {
            console.error('Failed to save stats to disk:', e);
        }

        try {
            await fs.ensureDir(path.dirname(sessionsPath));
            await fs.writeJson(sessionsPath, { sessions: this.syncSessions });
            console.log('Saved sessions to:', sessionsPath);
        } catch (e) {
            console.error('Failed to save sessions to disk:', e);
        }
    }

    public flushSync() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
        }
        const logsPath = this.getLogsPath();
        const statsPath = this.getStatsPath();
        const sessionsPath = this.getSessionsPath();
        try {
            fs.ensureDirSync(path.dirname(logsPath));
            fs.writeJsonSync(logsPath, { logs: this.logs, lastId: this.logIdCounter });
            console.log('Emergency sync flush saved logs to:', logsPath);
        } catch (e) {
            console.error('LogStore: Emergency sync flush failed:', e);
        }
        try {
            fs.ensureDirSync(path.dirname(statsPath));
            fs.writeJsonSync(statsPath, { stats: this.stats, lastId: this.statIdCounter });
        } catch (e) {
            console.error('LogStore: Emergency stats flush failed:', e);
        }
        try {
            fs.ensureDirSync(path.dirname(sessionsPath));
            fs.writeJsonSync(sessionsPath, { sessions: this.syncSessions });
        } catch (e) {
            console.error('LogStore: Emergency sessions flush failed:', e);
        }
    }

    addLog(connectionId: number, type: 'info' | 'error' | 'success', message: string): LogEntry {
        this.ensureInitialized();

        this.logIdCounter++;
        const entry: LogEntry = {
            id: this.logIdCounter,
            connection_id: connectionId,
            type,
            message,
            created_at: new Date().toISOString()
        };
        this.logs.unshift(entry);

        // Keep only last 1000 logs per connection
        const connLogs = this.logs.filter(l => l.connection_id === connectionId);
        if (connLogs.length > 1000) {
            const idsToRemove = connLogs.slice(1000).map(l => l.id);
            this.logs = this.logs.filter(l => !idsToRemove.includes(l.id));
        }

        this.saveToDiskDebounced();
        return entry;
    }

    addTransferStat(connectionId: number, bytes: number, direction: 'upload' | 'download'): TransferStat {
        this.ensureInitialized();

        this.statIdCounter++;
        const entry: TransferStat = {
            id: this.statIdCounter,
            connection_id: connectionId,
            bytes,
            direction,
            created_at: new Date().toISOString()
        };
        this.stats.push(entry);

        // Keep only last 365 days of stats
        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);
        this.stats = this.stats.filter(s => new Date(s.created_at) > oneYearAgo);

        this.saveToDiskDebounced();
        return entry;
    }

    getLogs(connectionId: number, limit: number = 200): LogEntry[] {
        this.ensureInitialized();

        return this.logs
            .filter(l => l.connection_id === connectionId)
            .slice(0, limit);
    }

    getAllLogs(limit: number = 200): LogEntry[] {
        this.ensureInitialized();
        return this.logs.slice(0, limit);
    }

    clearLogs(connectionId: number): void {
        this.ensureInitialized();
        this.logs = this.logs.filter(l => l.connection_id !== connectionId);
        this.saveToDiskDebounced();
    }

    getStats(connectionId: number) {
        this.ensureInitialized();

        const connStats = this.stats.filter(s => s.connection_id === connectionId);

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

    getAllStats() {
        this.ensureInitialized();

        // Daily stats for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyStats: { date: string; direction: string; total_bytes: number }[] = [];
        const dailyMap: Record<string, Record<string, number>> = {};

        this.stats
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
        this.stats.forEach(s => {
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

    public addSyncSession(session: SyncSessionEntry, customBackupPath?: string): void {
        this.ensureInitialized();
        this.syncSessions.unshift(session);

        // Keep only last 50 sessions per connection
        const connSessions = this.syncSessions.filter(s => s.connection_id === session.connection_id);
        if (connSessions.length > 50) {
            const sessionsToRemove = connSessions.slice(50);
            const idsToRemove = sessionsToRemove.map(s => s.id);
            this.syncSessions = this.syncSessions.filter(s => !idsToRemove.includes(s.id));

            // Delete historical files for removed sessions
            const baseBackupPath = customBackupPath && customBackupPath.trim() !== ''
                ? customBackupPath
                : path.join(this.getBasePath(), 'sync_data', 'history');

            sessionsToRemove.forEach(s => {
                try {
                    const sessionBackupDir = path.join(baseBackupPath, `connection_${session.connection_id}`, s.id);
                    if (fs.existsSync(sessionBackupDir)) {
                        fs.removeSync(sessionBackupDir);
                        console.log('Cleaned up old session backup dir:', sessionBackupDir);
                    }
                } catch (err) {
                    console.error('Failed to clean up old session backup dir:', err);
                }
            });
        }

        this.saveToDiskDebounced();
    }

    public getSyncSessions(connectionId: number, limit: number = 50): SyncSessionEntry[] {
        this.ensureInitialized();
        return this.syncSessions
            .filter(s => s.connection_id === connectionId)
            .slice(0, limit);
    }

    public getAllSyncSessions(limit: number = 50): SyncSessionEntry[] {
        this.ensureInitialized();
        return this.syncSessions.slice(0, limit);
    }

    public clearSyncSessions(connectionId: number, customBackupPath?: string): void {
        this.ensureInitialized();
        this.syncSessions = this.syncSessions.filter(s => s.connection_id !== connectionId);
        this.saveToDiskDebounced();

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

    public getHeatmapData(connectionId: number) {
        this.ensureInitialized();
        const connSessions = this.syncSessions.filter(s => s.connection_id === connectionId);
        
        const heatmapMap: Record<string, { date: string, count: number, bytes: number }> = {};
        
        // Look back 365 days
        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);
        
        connSessions.forEach(session => {
            const dateStr = session.timestamp.split('T')[0];
            const sessionDate = new Date(session.timestamp);
            if (sessionDate >= oneYearAgo) {
                if (!heatmapMap[dateStr]) {
                    heatmapMap[dateStr] = { date: dateStr, count: 0, bytes: 0 };
                }
                const successFiles = session.files.filter(f => f.status === 'success');
                heatmapMap[dateStr].count += successFiles.length;
                heatmapMap[dateStr].bytes += successFiles.reduce((acc, f) => acc + f.size, 0);
            }
        });
        
        return Object.values(heatmapMap);
    }
}

// Singleton instance
export const logStore = new LogStore();
