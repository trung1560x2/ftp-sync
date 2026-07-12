export interface UploadProgress {
  type: 'upload' | 'download';
  filename: string;
  totalBytes: number;
  bytesTransferred: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
  startTime: number;
}

export interface OverallProgress {
  activeUploads: UploadProgress[];
  queueLength: number;
  totalFilesInBatch: number;
  completedFiles: number;
  filesUploaded: number;
  filesSkipped: number;
  filesDeleted: number;
  filesFailed: number;
  uploadSpeedMBps: number;
  downloadSpeedMBps: number;
}

export class ProgressTracker {
  private uploadProgress: Map<string, UploadProgress> = new Map();
  private uploadWindow: { time: number; bytes: number }[] = [];
  private downloadWindow: { time: number; bytes: number }[] = [];

  public filesUploaded = 0;
  public filesSkipped = 0;
  public filesDeleted = 0;
  public filesFailed = 0;

  public totalFilesInBatch = 0;
  public completedFilesInBatch = 0;
  public batchStartTime = 0;

  public getUploadProgress() {
    return this.uploadProgress;
  }

  public recordWindowBytes(bytes: number, type: 'upload' | 'download') {
    const now = Date.now();
    if (type === 'upload') {
      this.uploadWindow.push({ time: now, bytes });
    } else {
      this.downloadWindow.push({ time: now, bytes });
    }
    this.cleanWindows(now);
  }

  private cleanWindows(now: number) {
    const threshold = now - 2000; // 2 seconds window
    this.uploadWindow = this.uploadWindow.filter(p => p.time > threshold);
    this.downloadWindow = this.downloadWindow.filter(p => p.time > threshold);
  }

  public getWindowSpeed(type: 'upload' | 'download'): number {
    const now = Date.now();
    this.cleanWindows(now);
    const window = type === 'upload' ? this.uploadWindow : this.downloadWindow;
    if (window.length === 0) return 0;
    
    const totalBytes = window.reduce((sum, p) => sum + p.bytes, 0);
    const speedMBps = (totalBytes / (1024 * 1024)) / 2.0; // average over 2 seconds
    return Math.round(speedMBps * 100) / 100;
  }

  public getProgress(syncQueueSize: number, syncQueuePending: number): OverallProgress {
    return {
      activeUploads: Array.from(this.uploadProgress.values()),
      queueLength: syncQueueSize + syncQueuePending,
      totalFilesInBatch: this.totalFilesInBatch,
      completedFiles: this.completedFilesInBatch,
      filesUploaded: this.filesUploaded,
      filesSkipped: this.filesSkipped,
      filesDeleted: this.filesDeleted,
      filesFailed: this.filesFailed,
      uploadSpeedMBps: this.getWindowSpeed('upload'),
      downloadSpeedMBps: this.getWindowSpeed('download')
    };
  }

  public resetCounters() {
    this.filesUploaded = 0;
    this.filesSkipped = 0;
    this.filesDeleted = 0;
    this.filesFailed = 0;
    this.totalFilesInBatch = 0;
    this.completedFilesInBatch = 0;
    this.batchStartTime = 0;
    this.uploadProgress.clear();
    this.uploadWindow = [];
    this.downloadWindow = [];
  }

  public startBatch() {
    this.batchStartTime = Date.now();
  }
}
