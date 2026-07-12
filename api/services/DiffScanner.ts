import path from 'path';
import fs from 'fs-extra';
import { execFile } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';
import { getDb } from '../db.js';
import { TransferClient } from './transfer/TransferClient.js';

const execFileAsync = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IGNORED_FOLDERS = new Set([
  '.git', 'node_modules', 'vendor', '.idea', '.vscode',
  'storage', 'bootstrap/cache', 'dist', 'build', 'coverage'
]);
const MAX_DEPTH = 8;

export interface ScanItem {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  relPath: string;
  isDirectChild: boolean;
}

export interface DiffItem {
  name: string;
  localName: string | null;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date | string;
  relPath: string;
  isDirectChild: boolean;
  status: 'synchronized' | 'newer_local' | 'newer_remote' | 'missing_local' | 'missing_remote' | 'different_size';
  local: { size: number; modifiedAt: Date | string } | null;
  remote: { size: number; modifiedAt: Date | string } | null;
  containsChanges?: boolean;
}

export const scanRemote = async (
  client: TransferClient,
  dir: string,
  base: string,
  recursive: boolean,
  depth: number = 0
): Promise<any[]> => {
  if (depth > MAX_DEPTH) return [];
  try {
    const files = await client.list(dir);
    let results: any[] = [];

    const currentLevel = files.map(f => ({
      name: f.name,
      size: f.size,
      modifiedAt: f.modifiedAt,
      isDirectory: f.isDirectory,
      type: (f as any).type,
      relPath: path.posix.join(path.posix.relative(base, dir).split(path.sep).join('/'), f.name),
      fullPath: path.posix.join(dir, f.name),
      isDirectChild: dir === base
    }));

    results = results.concat(currentLevel);

    if (recursive) {
      const subDirs = files.filter(f => f.isDirectory && f.name !== '.' && f.name !== '..');
      const validSubDirs = subDirs.filter(f => !IGNORED_FOLDERS.has(f.name));

      for (const f of validSubDirs) {
        const subDir = path.posix.join(dir, f.name);
        const subResults = await scanRemote(client, subDir, base, true, depth + 1);
        results = results.concat(subResults);
      }
    }
    return results;
  } catch (e: any) {
    console.error(`[DiffScanner] Remote scan failed for ${dir}:`, e.message);
    if (depth === 0) throw e;
    return [];
  }
};

export const scanLocalRust = async (
  dir: string,
  base: string,
  recursive: boolean
): Promise<ScanItem[]> => {
  try {
    const ignoredList = Array.from(IGNORED_FOLDERS).join(',');
    const args = ['--path', dir, '--ignored', ignoredList];
    if (recursive) {
      args.push('--recursive');
    }

    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'local_scanner.exe' : 'local_scanner';
    const resourcesPath = (process as any).resourcesPath;
    let binaryPath = '';

    // 1. Check process.resourcesPath (packaged app with asarUnpack)
    if (resourcesPath) {
      const pathsToTry = [
        path.join(resourcesPath, 'app.asar.unpacked', 'bin', binaryName),
        path.join(resourcesPath, 'bin', binaryName),
        path.join(resourcesPath, binaryName)
      ];
      for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
          binaryPath = p;
          break;
        }
      }
    }

    // 2. Check dev paths
    if (!binaryPath) {
      const devPath1 = path.resolve(__dirname, '..', '..', '..', 'bin', binaryName);
      if (fs.existsSync(devPath1)) {
        binaryPath = devPath1;
      } else {
        const devPath2 = path.resolve(__dirname, '..', '..', 'bin', binaryName);
        if (fs.existsSync(devPath2)) {
          binaryPath = devPath2;
        } else {
          // 3. Fallback to process.cwd()
          binaryPath = path.resolve(process.cwd(), 'bin', binaryName);
        }
      }
    }

    // Verify binary exists
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      throw new Error(`Rust binary not found at resolved paths (last checked: ${binaryPath})`);
    }

    // Spawn Rust CLI process
    const { stdout } = await execFileAsync(binaryPath, args, { maxBuffer: 10 * 1024 * 1024 });
    const items = JSON.parse(stdout);

    return items.map((item: any) => ({
      name: item.name,
      isDirectory: item.isDirectory,
      size: item.size,
      modifiedAt: new Date(item.modifiedAt),
      relPath: item.relPath,
      isDirectChild: !item.relPath.includes('/')
    }));
  } catch (err: any) {
    console.warn('[DiffScanner] Rust local scan failed, falling back to JS:', err.message);
    return scanLocalJS(dir, base, recursive);
  }
};

export const scanLocalJS = async (
  dir: string,
  base: string,
  recursive: boolean,
  depth: number = 0
): Promise<ScanItem[]> => {
  if (depth > MAX_DEPTH) return [];
  try {
    if (!fs.existsSync(dir)) return [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    // Map entries to parallel stats tasks
    const tasks = entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (recursive && entry.isDirectory() && IGNORED_FOLDERS.has(entry.name)) {
        return [];
      }

      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        return [];
      }

      const relPathFromBase = path.relative(base, fullPath).replace(/\\/g, '/');

      const fileItem = {
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime,
        relPath: relPathFromBase,
        isDirectChild: dir === base
      };

      let itemResults = [fileItem];

      if (recursive && entry.isDirectory()) {
        const subFiles = await scanLocalJS(fullPath, base, true, depth + 1);
        itemResults = itemResults.concat(subFiles);
      }

      return itemResults;
    });

    const resultsArray = await Promise.all(tasks);
    let results: any[] = [];
    for (const r of resultsArray) {
      results = results.concat(r);
    }
    return results;
  } catch (e: any) {
    console.error(`[DiffScanner] Local scan failed for ${dir}:`, e.message);
    return [];
  }
};

export const scanLocal = async (
  dir: string,
  base: string,
  recursive: boolean,
  depth: number = 0
): Promise<ScanItem[]> => {
  if (depth === 0) {
    return scanLocalRust(dir, base, recursive);
  }
  return scanLocalJS(dir, base, recursive, depth);
};

export const scanLocalCached = async (
  connectionId: number,
  relativePath: string,
  isRecursive: boolean
): Promise<ScanItem[]> => {
  const db = await getDb();
  
  // Normalize relativePath: should use forward slashes, and not start or end with slash
  let normRelPath = relativePath.replace(/\\/g, '/');
  if (normRelPath.startsWith('/')) normRelPath = normRelPath.substring(1);
  if (normRelPath.endsWith('/')) normRelPath = normRelPath.substring(0, normRelPath.length - 1);
  
  let rows: any[] = [];
  if (normRelPath === '') {
    if (isRecursive) {
      rows = await db.all('SELECT * FROM local_file_cache WHERE connection_id = ?', connectionId);
    } else {
      rows = await db.all(
        "SELECT * FROM local_file_cache WHERE connection_id = ? AND rel_path NOT LIKE '%/%'", 
        connectionId
      );
    }
  } else {
    const prefix = normRelPath + '/';
    const lowerBound = prefix;
    const upperBound = prefix.substring(0, prefix.length - 1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

    if (isRecursive) {
      rows = await db.all(
        'SELECT * FROM local_file_cache WHERE connection_id = ? AND rel_path >= ? AND rel_path < ?',
        connectionId,
        lowerBound,
        upperBound
      );
    } else {
      rows = await db.all(
        'SELECT * FROM local_file_cache WHERE connection_id = ? AND rel_path >= ? AND rel_path < ? AND rel_path NOT LIKE ?',
        connectionId,
        lowerBound,
        upperBound,
        prefix + '%/%'
      );
    }
  }

  return rows.map(r => {
    let relPathFromBase = r.rel_path;
    if (normRelPath !== '') {
      relPathFromBase = r.rel_path.substring(normRelPath.length + 1);
    }
    
    const isDirectChild = !relPathFromBase.includes('/');
    
    return {
      name: r.name,
      isDirectory: r.is_directory === 1,
      size: r.size,
      modifiedAt: new Date(r.modified_at),
      relPath: relPathFromBase,
      isDirectChild
    };
  });
};

export const calculateDiff = (
  remoteFiles: any[],
  localFiles: any[],
  isRecursive: boolean
): DiffItem[] => {
  const diffMap = new Map<string, DiffItem>();
  const getKey = (p: string) => p.toLowerCase();

  // Process Remote
  remoteFiles.forEach(r => {
    const key = getKey(r.relPath);
    diffMap.set(key, {
      name: r.name,
      localName: null,
      isDirectory: r.isDirectory,
      size: r.size,
      modifiedAt: r.modifiedAt,
      relPath: r.relPath,
      isDirectChild: r.isDirectChild,
      status: 'missing_local',
      remote: { size: r.size, modifiedAt: r.modifiedAt },
      local: null
    });
  });

  // Process Local
  localFiles.forEach(l => {
    const key = getKey(l.relPath);
    if (diffMap.has(key)) {
      const item = diffMap.get(key)!;
      item.local = { size: l.size, modifiedAt: l.modifiedAt };
      item.localName = l.name;

      if (item.isDirectory) {
        item.status = 'synchronized'; // Folders exist on both sides
      } else {
        const TIME_TOLERANCE = 2000;
        const rTime = item.remote!.modifiedAt instanceof Date ? item.remote!.modifiedAt.getTime() : new Date(item.remote!.modifiedAt).getTime();
        const lTime = new Date(l.modifiedAt).getTime();

        if (l.size !== item.size) item.status = 'different_size';
        else if (lTime > rTime + TIME_TOLERANCE) item.status = 'newer_local';
        else if (rTime > lTime + TIME_TOLERANCE) item.status = 'newer_remote';
        else item.status = 'synchronized';
      }
    } else {
      // New local item
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

  // Aggregate Changes (for Deep Scan)
  if (isRecursive) {
    diffMap.forEach((item) => {
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

  // Filter & Sort
  return Array.from(diffMap.values())
    .filter(item => item.isDirectChild)
    .sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
};
