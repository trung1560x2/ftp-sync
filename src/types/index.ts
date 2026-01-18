export interface FTPConnection {
  id: number;
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
  created_at: string;
}

export interface FTPConnectionFormData {
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
}
