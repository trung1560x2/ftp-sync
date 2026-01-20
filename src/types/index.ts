export interface FTPConnection {
  id: number;
  name?: string;
  server: string;
  port: number;
  username: string;
  target_directory: string;
  local_path?: string;
  sync_mode?: 'bi_directional' | 'upload_only' | 'download_only';
  secure?: boolean;
  sync_deletions?: boolean;
  parallel_connections?: number;
  buffer_size?: number;
  protocol?: 'ftp' | 'ftps' | 'sftp';
  private_key?: string;
  conflict_resolution?: 'overwrite' | 'newer' | 'different_size';
  exclude_paths?: string; // Comma or newline separated patterns to exclude from sync/diff
  created_at: string;
}

export interface FTPConnectionFormData {
  name?: string;
  server: string;
  port: number;
  username: string;
  password?: string;
  targetDirectory: string;
  localPath: string;
  syncMode: 'bi_directional' | 'upload_only' | 'download_only';
  secure: boolean;
  syncDeletions: boolean;
  parallelConnections: number;
  bufferSize: number;
  protocol: 'ftp' | 'ftps' | 'sftp';
  privateKey?: string;
  conflictResolution: 'overwrite' | 'newer' | 'different_size';
  excludePaths: string; // Comma or newline separated patterns to exclude
}

