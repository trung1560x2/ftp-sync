import { getDb } from '../db.js';
import { scanRemote } from './DiffScanner.js';
import SyncManager from './SyncService.js';
import { TransferClient } from './transfer/TransferClient.js';

export class RemoteSearchService {
  public async buildCache(connectionId: number, targetDir = '/'): Promise<number> {
    const db = await getDb();
    
    // Scan remote files using SyncManager
    const remoteFiles = await SyncManager.runWithClient(connectionId, async (client: TransferClient) => {
      return await scanRemote(client, targetDir, targetDir, true);
    }, true);

    await db.exec('BEGIN TRANSACTION;');
    try {
      // Clear old entries
      await db.run('DELETE FROM remote_file_cache WHERE connection_id = ?', connectionId);

      // Insert fresh entries
      const stmt = await db.prepare(`
        INSERT INTO remote_file_cache (connection_id, rel_path, name, is_directory, size, modified_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const file of remoteFiles) {
        if (file.name === '.' || file.name === '..') continue;
        
        await stmt.run(
          connectionId,
          file.relPath,
          file.name,
          file.isDirectory ? 1 : 0,
          file.size || 0,
          file.modifiedAt ? new Date(file.modifiedAt).toISOString() : new Date().toISOString()
        );
      }

      await stmt.finalize();
      await db.exec('COMMIT;');
      
      return remoteFiles.length;
    } catch (err) {
      await db.exec('ROLLBACK;');
      throw err;
    }
  }

  public async search(connectionId: number, query: string, searchContent = false): Promise<any[]> {
    const db = await getDb();
    
    if (!searchContent) {
      // Search by filename
      const countRow = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM remote_file_cache WHERE connection_id = ?',
        connectionId
      );
      
      if (!countRow || countRow.count === 0) {
        const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
        const targetDir = config?.target_directory || '/';
        await this.buildCache(connectionId, targetDir);
      }

      const rows = await db.all(`
        SELECT rel_path as relPath, name, is_directory as isDirectory, size, modified_at as modifiedAt
        FROM remote_file_cache
        WHERE connection_id = ? AND name LIKE ?
        LIMIT 100
      `, connectionId, `%${query}%`);
      
      return rows;
    } else {
      // Search content
      const countRow = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM remote_file_cache WHERE connection_id = ?',
        connectionId
      );
      if (!countRow || countRow.count === 0) {
        const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
        const targetDir = config?.target_directory || '/';
        await this.buildCache(connectionId, targetDir);
      }

      const files = await db.all(`
        SELECT rel_path as relPath, name
        FROM remote_file_cache
        WHERE connection_id = ? AND is_directory = 0 AND size < 51200
      `, connectionId);

      const textExtensions = ['.txt', '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md', '.py', '.php', '.sql', '.sh', '.yml', '.yaml', '.xml', '.ini', '.conf'];
      const textFiles = files.filter((f: any) => {
        const dotIdx = f.name.lastIndexOf('.');
        if (dotIdx === -1) return true; // Files without extensions (e.g. Dockerfile)
        const ext = f.name.substring(dotIdx).toLowerCase();
        return textExtensions.includes(ext);
      });

      const results: any[] = [];
      const concurrencyLimit = 5;
      
      for (let i = 0; i < textFiles.length; i += concurrencyLimit) {
        const batch = textFiles.slice(i, i + concurrencyLimit);
        await Promise.all(batch.map(async (file: any) => {
          try {
            const config = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
            const remoteRoot = config?.target_directory || '/';
            const fullRemotePath = remoteRoot.endsWith('/') ? remoteRoot + file.relPath : remoteRoot + '/' + file.relPath;
            
            const fileData = await SyncManager.getRemoteFile(connectionId, fullRemotePath);
            if (fileData.content.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                relPath: file.relPath,
                name: file.name,
                isDirectory: false,
                size: fileData.size,
                modifiedAt: fileData.modifiedAt
              });
            }
          } catch (err) {
            // Ignore single file read errors
          }
        }));
      }

      return results;
    }
  }
}

export default new RemoteSearchService();
