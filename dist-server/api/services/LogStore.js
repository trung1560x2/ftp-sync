import fs from 'fs-extra';
import path from 'path';
class LogStore {
    logs = [];
    stats = [];
    logIdCounter = 0;
    statIdCounter = 0;
    saveDebounceTimer = null;
    initialized = false;
    getBasePath() {
        // Always get fresh path to ensure DB_PATH is set
        const baseDir = process.env.DB_PATH
            ? path.dirname(process.env.DB_PATH)
            : process.cwd();
        return baseDir;
    }
    getLogsPath() {
        return path.join(this.getBasePath(), 'sync_logs.json');
    }
    getStatsPath() {
        return path.join(this.getBasePath(), 'transfer_stats.json');
    }
    ensureInitialized() {
        if (this.initialized)
            return;
        this.initialized = true;
        console.log('LogStore initializing with base path:', this.getBasePath());
        this.loadFromDisk();
    }
    loadFromDisk() {
        const logsPath = this.getLogsPath();
        const statsPath = this.getStatsPath();
        console.log('Loading logs from:', logsPath);
        console.log('Loading stats from:', statsPath);
        try {
            if (fs.existsSync(logsPath)) {
                const data = fs.readJsonSync(logsPath);
                this.logs = data.logs || [];
                this.logIdCounter = data.lastId || 0;
                console.log('Loaded', this.logs.length, 'logs');
            }
        }
        catch (e) {
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
        }
        catch (e) {
            console.error('Failed to load stats from disk:', e);
            this.stats = [];
        }
    }
    saveToDiskDebounced() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        this.saveDebounceTimer = setTimeout(() => {
            this.saveToDisk();
        }, 1000);
    }
    saveToDisk() {
        const logsPath = this.getLogsPath();
        const statsPath = this.getStatsPath();
        try {
            fs.ensureDirSync(path.dirname(logsPath));
            fs.writeJsonSync(logsPath, { logs: this.logs, lastId: this.logIdCounter });
            console.log('Saved logs to:', logsPath);
        }
        catch (e) {
            console.error('Failed to save logs to disk:', e);
        }
        try {
            fs.ensureDirSync(path.dirname(statsPath));
            fs.writeJsonSync(statsPath, { stats: this.stats, lastId: this.statIdCounter });
        }
        catch (e) {
            console.error('Failed to save stats to disk:', e);
        }
    }
    addLog(connectionId, type, message) {
        this.ensureInitialized();
        this.logIdCounter++;
        const entry = {
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
    addTransferStat(connectionId, bytes, direction) {
        this.ensureInitialized();
        this.statIdCounter++;
        const entry = {
            id: this.statIdCounter,
            connection_id: connectionId,
            bytes,
            direction,
            created_at: new Date().toISOString()
        };
        this.stats.push(entry);
        // Keep only last 30 days of stats
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        this.stats = this.stats.filter(s => new Date(s.created_at) > thirtyDaysAgo);
        this.saveToDiskDebounced();
        return entry;
    }
    getLogs(connectionId, limit = 200) {
        this.ensureInitialized();
        return this.logs
            .filter(l => l.connection_id === connectionId)
            .slice(0, limit);
    }
    getStats(connectionId) {
        this.ensureInitialized();
        const connStats = this.stats.filter(s => s.connection_id === connectionId);
        // Daily stats for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dailyStats = [];
        const dailyMap = {};
        connStats
            .filter(s => new Date(s.created_at) > sevenDaysAgo)
            .forEach(s => {
            const date = s.created_at.split('T')[0];
            if (!dailyMap[date])
                dailyMap[date] = { upload: 0, download: 0 };
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
            if (s.direction === 'upload')
                total_uploaded += s.bytes;
            else
                total_downloaded += s.bytes;
        });
        return {
            dailyStats,
            totalStats: { total_uploaded, total_downloaded }
        };
    }
}
// Singleton instance
export const logStore = new LogStore();
