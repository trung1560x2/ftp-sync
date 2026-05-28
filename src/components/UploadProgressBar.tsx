import React from 'react';
import { Upload, Clock, Zap, Loader } from 'lucide-react';

interface UploadProgress {
    filename: string;
    totalBytes: number;
    bytesTransferred: number;
    percent: number;
    speedMBps: number;
    etaSeconds: number;
}

interface OverallProgress {
    activeUploads: UploadProgress[];
    queueLength: number;
    totalFilesInBatch: number;
    completedFiles: number;
    filesUploaded?: number;
    filesSkipped?: number;
    filesDeleted?: number;
    filesFailed?: number;
    uploadSpeedMBps?: number;
    downloadSpeedMBps?: number;
}

interface Props {
    progress: OverallProgress;
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatETA = (seconds: number): string => {
    if (seconds <= 0) return '--';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
};

const UploadProgressBar: React.FC<Props> = ({ progress }) => {
    const { activeUploads, queueLength, totalFilesInBatch, completedFiles } = progress;

    // No uploads in progress
    if (activeUploads.length === 0 && queueLength === 0) {
        if (totalFilesInBatch === 0) {
            return (
                <div className="bg-neutral-950 p-3 mb-3 border border-neutral-800 rounded-none font-mono text-xs animate-pulse">
                    <div className="flex items-center justify-between text-neutral-500 uppercase tracking-wide">
                        <div className="flex items-center text-orange-500 font-bold">
                            <Loader size={13} className="mr-1.5 animate-spin text-orange-500" />
                            <span>Sync_Active</span>
                        </div>
                        <span>Scanning directories...</span>
                    </div>
                </div>
            );
        }
        return null;
    }

    // Calculate overall batch progress
    const batchProgress = totalFilesInBatch > 0
        ? Math.round((completedFiles / totalFilesInBatch) * 100)
        : 0;

    // Calculate display speed (use session-level rolling bandwidth if available)
    const displaySpeed = progress.uploadSpeedMBps !== undefined
        ? progress.uploadSpeedMBps
        : (activeUploads.length > 0
            ? activeUploads.reduce((sum, u) => sum + u.speedMBps, 0) / activeUploads.length
            : 0);

    return (
        <div className="bg-neutral-950 p-3 mb-3 border border-neutral-800 rounded-none font-mono text-xs">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 border-b border-neutral-850 pb-2">
                <div className="flex items-center text-orange-500 font-bold text-xs uppercase tracking-wider">
                    <Upload size={13} className="mr-1.5 animate-pulse" />
                    <span>Upload_Active</span>
                </div>
                <div className="flex items-center space-x-3 text-[10px]">
                    {displaySpeed > 0 && (
                        <div className="flex items-center text-emerald-400 font-bold">
                            <Zap size={11} className="mr-1" />
                            <span>{displaySpeed.toFixed(2)} MB/S</span>
                        </div>
                    )}
                    <div className="text-neutral-500">
                        {completedFiles}/{totalFilesInBatch} FILES
                    </div>
                </div>
            </div>

            {/* Active uploads */}
            <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-3 mb-2.5 pr-1">
                {activeUploads.map((upload, index) => (
                    <div key={index}>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-neutral-300 truncate max-w-[200px] uppercase font-bold" title={upload.filename}>
                                {upload.filename}
                            </span>
                            <div className="flex items-center space-x-2 text-neutral-500 font-mono">
                                <span className="text-neutral-300 font-bold">{upload.percent}%</span>
                                <span>/</span>
                                <span>{formatBytes(upload.bytesTransferred)} OF {formatBytes(upload.totalBytes)}</span>
                                {upload.etaSeconds > 0 && (
                                    <>
                                        <span>/</span>
                                        <div className="flex items-center text-amber-500">
                                            <Clock size={10} className="mr-1" />
                                            <span>ETA: {formatETA(upload.etaSeconds)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1.5 bg-neutral-900 border border-neutral-850 rounded-none overflow-hidden">
                            <div
                                className="h-full bg-orange-600 rounded-none transition-all duration-350 ease-out"
                                style={{ width: `${upload.percent}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Queue indicator */}
            {queueLength > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-neutral-850 text-[10px] text-neutral-500 uppercase tracking-wide">
                    <span className="text-orange-500 font-bold">{queueLength}</span> file(s) waiting in upload queue
                </div>
            )}

            {/* Batch progress bar (when multiple files) */}
            {totalFilesInBatch > 1 && (
                <div className="mt-2.5 pt-2.5 border-t border-neutral-850">
                    <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1 uppercase font-bold tracking-wide">
                        <span>Overall Batch Progress</span>
                        <span className="text-emerald-400">{batchProgress}%</span>
                    </div>
                    <div className="h-1 bg-neutral-900 border border-neutral-850 rounded-none overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 rounded-none transition-all duration-350"
                            style={{ width: `${batchProgress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Sync statistics counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5 pt-2.5 border-t border-neutral-850 text-[10px] text-neutral-500 uppercase tracking-wide">
                <div className="flex items-center">
                    <span className="text-neutral-600 mr-1.5">UPLOADED:</span>
                    <span className="text-emerald-400 font-bold font-mono">{progress.filesUploaded || 0}</span>
                </div>
                <div className="flex items-center">
                    <span className="text-neutral-600 mr-1.5">SKIPPED:</span>
                    <span className="text-neutral-350 font-bold font-mono">{progress.filesSkipped || 0}</span>
                </div>
                <div className="flex items-center">
                    <span className="text-neutral-600 mr-1.5">DELETED:</span>
                    <span className="text-red-400 font-bold font-mono">{progress.filesDeleted || 0}</span>
                </div>
                <div className="flex items-center">
                    <span className="text-neutral-600 mr-1.5">FAILED:</span>
                    <span className={`font-bold font-mono ${(progress.filesFailed || 0) > 0 ? 'text-red-500 animate-pulse' : 'text-neutral-300'}`}>
                        {progress.filesFailed || 0}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default UploadProgressBar;
