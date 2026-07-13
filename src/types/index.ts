export interface FTPConnection {
  id: number;
  name?: string;
  server: string;
  port: number;
  username: string;
  target_directory: string;
  local_path?: string;
  backup_path?: string;
  sync_mode?: 'bi_directional' | 'upload_only' | 'download_only';
  secure?: boolean;
  sync_deletions?: boolean;
  parallel_connections?: number;
  buffer_size?: number;
  protocol?: 'ftp' | 'ftps' | 'sftp';
  private_key?: string;
  ssh_key_id?: number;
  conflict_resolution?: 'overwrite' | 'newer' | 'different_size';
  exclude_paths?: string; // Comma or newline separated patterns to exclude from sync/diff
  last_sync_time?: number;
  last_sync_duration?: number;
  last_sync_status?: 'success' | 'failed';
  validation_status?: 'verified' | 'failed' | 'unverified';
  validation_message?: string;
  enable_checksum?: boolean;
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
  backupPath: string;
  syncMode: 'bi_directional' | 'upload_only' | 'download_only';
  secure: boolean;
  syncDeletions: boolean;
  parallelConnections: number;
  bufferSize: number;
  protocol: 'ftp' | 'ftps' | 'sftp';
  privateKey?: string;
  sshKeyId?: number | null;
  conflictResolution: 'overwrite' | 'newer' | 'different_size';
  excludePaths: string; // Comma or newline separated patterns to exclude
  enableChecksum: boolean;
}

