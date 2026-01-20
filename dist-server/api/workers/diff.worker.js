import { parentPort } from 'worker_threads';
import path from 'path';
import fs from 'fs-extra';
import { TransferClientFactory } from '../services/transfer/TransferClientFactory.js';
import { decrypt } from '../utils/encryption.js';
// Log helper to send logs back to parent
const log = (type, message) => {
    if (parentPort)
        parentPort.postMessage({ type: 'LOG', data: { type, message } });
};
async function runHelper() {
    if (!parentPort)
        return;
    parentPort.on('message', async (message) => {
        if (message.type === 'START_DIFF') {
            const data = message.data;
            try {
                const result = await performDiff(data);
                parentPort?.postMessage({ type: 'DIFF_RESULT', data: result });
            }
            catch (err) {
                parentPort?.postMessage({ type: 'ERROR', error: err.message });
            }
        }
    });
}
// Helper: Recursive Remote Scan
// Simple ignored folders - these are always skipped during diff
const IGNORED_FOLDERS = new Set([
    '.git',
    'node_modules',
    'vendor',
    '.idea',
    '.vscode',
    'storage',
    'bootstrap/cache',
    'dist',
    'build',
    'coverage'
]);
const MAX_DEPTH = 8; // Prevent infinite recursion
async function scanRemote(client, dir, base, recursive, ignoredFolders, depth = 0) {
    if (depth > MAX_DEPTH)
        return [];
    try {
        const files = await client.list(dir);
        let results = [];
        // Process current level
        const currentLevel = files.map(f => ({
            name: f.name,
            size: f.size,
            modifiedAt: f.modifiedAt,
            isDirectory: f.isDirectory,
            type: f.type,
            relPath: path.posix.join(path.posix.relative(base, dir).split(path.sep).join('/'), f.name),
            fullPath: path.posix.join(dir, f.name),
            isDirectChild: dir === base
        }));
        results = results.concat(currentLevel);
        if (recursive) {
            for (const f of files) {
                if (f.isDirectory && f.name !== '.' && f.name !== '..') {
                    if (ignoredFolders.has(f.name))
                        continue;
                    const subDir = path.posix.join(dir, f.name);
                    const subFiles = await scanRemote(client, subDir, base, true, ignoredFolders, depth + 1);
                    results = results.concat(subFiles);
                }
            }
        }
        return results;
    }
    catch (e) {
        log('error', `Remote scan failed for ${dir}: ${e.message}`);
        return [];
    }
}
// Helper: Recursive Local Scan
async function scanLocal(dir, base, recursive, ignoredFolders, depth = 0) {
    if (depth > MAX_DEPTH)
        return [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let results = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (recursive && entry.isDirectory() && ignoredFolders.has(entry.name))
                continue;
            let stats;
            try {
                stats = await fs.stat(fullPath);
            }
            catch {
                continue;
            }
            const relPathFromBase = path.relative(base, fullPath).replace(/\\/g, '/');
            results.push({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: stats.size,
                modifiedAt: stats.mtime,
                relPath: relPathFromBase,
                isDirectChild: dir === base
            });
            if (recursive && entry.isDirectory()) {
                const subFiles = await scanLocal(fullPath, base, true, ignoredFolders, depth + 1);
                results = results.concat(subFiles);
            }
        }
        return results;
    }
    catch (e) {
        log('error', `Local scan failed for ${dir}: ${e.message}`);
        return [];
    }
}
async function performDiff(data) {
    const { config, targetDir, localRoot, recursive } = data;
    let client = null;
    try {
        // 1. Connect
        const protocol = config.protocol || 'ftp';
        client = TransferClientFactory.createClient(protocol, 60000);
        const password = decrypt(config.password_hash);
        await client.connect({
            host: config.server,
            username: config.username,
            password: password,
            port: config.port || (config.protocol === 'sftp' ? 22 : 21),
            secure: config.secure ? true : false,
            secureOptions: config.secure ? { rejectUnauthorized: false } : undefined,
            privateKey: config.private_key
        });
        // 2. Calculate local directory based on targetDir
        // If targetDir is a subdirectory (e.g., "database/migrations"), we need to scan the corresponding local folder
        const remoteRoot = config.target_directory || '/';
        let relativePath = '';
        // Normalize paths for comparison
        const normRemote = targetDir.replace(/\\/g, '/');
        const normRoot = remoteRoot.replace(/\\/g, '/');
        if (normRoot === '/' || normRoot === '') {
            relativePath = normRemote.startsWith('/') ? normRemote.substring(1) : normRemote;
        }
        else if (normRemote.startsWith(normRoot)) {
            relativePath = normRemote.substring(normRoot.length);
            if (relativePath.startsWith('/'))
                relativePath = relativePath.substring(1);
        }
        else {
            // targetDir doesn't start with remoteRoot, use targetDir as-is
            relativePath = normRemote.startsWith('/') ? normRemote.substring(1) : normRemote;
        }
        const localDir = relativePath ? path.join(localRoot, relativePath.split('/').join(path.sep)) : localRoot;
        log('info', `Scanning Remote: ${targetDir}, Local: ${localDir}, Recursive: ${recursive}`);
        // 3. Scan with simple ignored folders
        const [remoteFiles, localFiles] = await Promise.all([
            scanRemote(client, targetDir, targetDir, recursive, IGNORED_FOLDERS),
            scanLocal(localDir, localDir, recursive, IGNORED_FOLDERS)
        ]);
        // 3. Compare (In-Memory)
        const diffMap = new Map();
        const getKey = (p) => p.toLowerCase();
        // Process Remote
        remoteFiles.forEach(r => {
            const key = getKey(r.relPath);
            diffMap.set(key, {
                ...r,
                localName: null,
                status: 'missing_local',
                remote: { size: r.size, modifiedAt: r.modifiedAt },
                local: null
            });
        });
        // Process Local
        localFiles.forEach(l => {
            const key = getKey(l.relPath);
            if (diffMap.has(key)) {
                const item = diffMap.get(key);
                item.local = { size: l.size, modifiedAt: l.modifiedAt };
                item.localName = l.name;
                if (item.isDirectory) {
                    item.status = 'synchronized';
                }
                else {
                    const TIME_TOLERANCE = 2000;
                    const rTime = item.remote.modifiedAt instanceof Date ? item.remote.modifiedAt.getTime() : new Date(item.remote.modifiedAt).getTime();
                    const lTime = new Date(l.modifiedAt).getTime();
                    if (l.size !== item.size)
                        item.status = 'different_size';
                    else if (lTime > rTime + TIME_TOLERANCE)
                        item.status = 'newer_local';
                    else if (rTime > lTime + TIME_TOLERANCE)
                        item.status = 'newer_remote';
                    else
                        item.status = 'synchronized';
                }
            }
            else {
                diffMap.set(key, {
                    name: l.name,
                    localName: l.name,
                    isDirectory: l.isDirectory,
                    size: l.size,
                    modifiedAt: l.modifiedAt,
                    local: { size: l.size, modifiedAt: l.modifiedAt },
                    remote: null,
                    status: 'missing_remote',
                    relPath: l.relPath,
                    isDirectChild: l.isDirectChild
                });
            }
        });
        // Aggregate Changes
        if (recursive) {
            diffMap.forEach((item, key) => {
                if (item.status !== 'synchronized') {
                    const parts = item.relPath.split('/');
                    if (parts.length > 1) {
                        const topLevelName = parts[0];
                        const topLevelKey = getKey(topLevelName);
                        const parent = diffMap.get(topLevelKey);
                        if (parent && parent.isDirectory) {
                            parent.containsChanges = true;
                        }
                    }
                }
            });
        }
        // Filter results (Return Direct Children Only for UI, but calculations included children)
        const diffs = Array.from(diffMap.values())
            .filter(item => item.isDirectChild)
            .sort((a, b) => {
            if (a.isDirectory === b.isDirectory)
                return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
        return { diffs, currentPath: targetDir };
    }
    finally {
        if (client) {
            try {
                client.close();
            }
            catch { } // Ignore close errors
        }
    }
}
runHelper();
