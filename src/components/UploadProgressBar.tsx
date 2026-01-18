import React from 'react';
import { Upload, Clock, Zap } from 'lucide-react';

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
        return null;
    }

    // Calculate overall batch progress
    const batchProgress = totalFilesInBatch > 0
        ? Math.round((completedFiles / totalFilesInBatch) * 100)
        : 0;

    // Calculate average speed across all active uploads
    const avgSpeed = activeUploads.length > 0
        ? activeUploads.reduce((sum, u) => sum + u.speedMBps, 0) / activeUploads.length
        : 0;

    return (
        <div className="bg-gradient-to-r from-blue-900/90 to-indigo-900/90 rounded-lg p-3 mb-3 border border-blue-700/50 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center text-blue-100 font-medium text-sm">
                    <Upload size={14} className="mr-2 animate-pulse" />
                    <span>Uploading...</span>
                </div>
                <div className="flex items-center space-x-3 text-xs">
                    {avgSpeed > 0 && (
                        <div className="flex items-center text-green-400">
                            <Zap size={12} className="mr-1" />
                            <span>{avgSpeed.toFixed(2)} MB/s</span>
                        </div>
                    )}
                    <div className="text-blue-300">
                        {completedFiles}/{totalFilesInBatch} files
                    </div>
                </div>
            </div>

            {/* Active uploads */}
            {activeUploads.map((upload, index) => (
                <div key={index} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-300 truncate max-w-[200px]" title={upload.filename}>
                            {upload.filename}
                        </span>
                        <div className="flex items-center space-x-2 text-gray-400">
                            <span>{upload.percent}%</span>
                            <span className="text-gray-500">•</span>
                            <span>{formatBytes(upload.bytesTransferred)}/{formatBytes(upload.totalBytes)}</span>
                            {upload.etaSeconds > 0 && (
                                <>
                                    <span className="text-gray-500">•</span>
                                    <div className="flex items-center text-yellow-400">
                                        <Clock size={10} className="mr-1" />
                                        <span>{formatETA(upload.etaSeconds)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${upload.percent}%` }}
                        />
                    </div>
                </div>
            ))}

            {/* Queue indicator */}
            {queueLength > 0 && (
                <div className="mt-2 pt-2 border-t border-blue-700/50 text-xs text-gray-400">
                    <span className="text-yellow-400">{queueLength}</span> file(s) waiting in queue
                </div>
            )}

            {/* Batch progress bar (when multiple files) */}
            {totalFilesInBatch > 1 && (
                <div className="mt-2 pt-2 border-t border-blue-700/50">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>Overall Progress</span>
                        <span>{batchProgress}%</span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full transition-all duration-300"
                            style={{ width: `${batchProgress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default UploadProgressBar;
