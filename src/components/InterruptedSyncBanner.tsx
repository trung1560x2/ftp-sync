import React, { useEffect, useState } from 'react';
import { AlertTriangle, Play, Trash2, Pause, RefreshCw } from 'lucide-react';

interface InterruptedSession {
  connection_id: number;
  connection_name: string;
  server: string;
  file_count: number;
  total_size: number;
  bytes_transferred: number;
}

interface InterruptedSyncBannerProps {
  onStateChange?: () => void;
}

export default function InterruptedSyncBanner({ onStateChange }: InterruptedSyncBannerProps) {
  const [activeSession, setActiveSession] = useState<InterruptedSession | null>(null);
  const [countdown, setCountdown] = useState<number>(5);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchInterrupted = React.useCallback(async () => {
    try {
      const res = await fetch('/api/sync/interrupted');
      const data = await res.json();
      if (data.success && data.sessions && data.sessions.length > 0) {
        setActiveSession(data.sessions[0]);
        setCountdown(5);
        setIsPaused(false);
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error('Failed to fetch interrupted sessions', err);
    }
  }, []);

  const handleResume = React.useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      const res = await fetch('/api/sync/resume-interrupted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeSession.connection_id })
      });
      const data = await res.json();
      if (data.success) {
        if (onStateChange) onStateChange();
        fetchInterrupted();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeSession, onStateChange, fetchInterrupted]);

  useEffect(() => {
    fetchInterrupted();
  }, [fetchInterrupted]);

  useEffect(() => {
    if (!activeSession || isPaused || countdown <= 0) {
      if (countdown === 0 && activeSession) {
        handleResume();
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, isPaused, activeSession, handleResume]);

  const handleDiscard = async () => {
    if (!activeSession) return;
    if (!confirm('Bạn có chắc chắn muốn bỏ qua phiên đồng bộ bị lỗi? Tất cả file sẽ được đồng bộ lại từ đầu trong lần sync tới.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/sync/discard-interrupted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeSession.connection_id })
      });
      const data = await res.json();
      if (data.success) {
        if (onStateChange) onStateChange();
        fetchInterrupted();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!activeSession) return null;

  const totalSizeMB = (activeSession.total_size / (1024 * 1024)).toFixed(2);
  const transferredMB = (activeSession.bytes_transferred / (1024 * 1024)).toFixed(2);
  const percentDone = activeSession.total_size > 0 
    ? Math.round((activeSession.bytes_transferred / activeSession.total_size) * 100)
    : 0;

  return (
    <div className="bg-neutral-900 border-b border-orange-500/20 text-neutral-200 py-3.5 px-4 animate-pulse-slow">
      <div className="container mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left Side Info */}
        <div className="flex items-center space-x-3.5 w-full md:w-auto">
          <div className="bg-orange-500/10 p-2 border border-orange-500/30">
            <AlertTriangle className="text-orange-500 animate-pulse" size={20} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-neutral-100 uppercase tracking-wider">Lượt sync bị gián đoạn</span>
              <span className="bg-orange-500/20 text-orange-400 text-[10px] px-1.5 py-0.5 font-mono">
                {activeSession.connection_name}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Phát hiện {activeSession.file_count} file ({transferredMB}/{totalSizeMB} MB - {percentDone}%) chưa hoàn thành do ứng dụng bị tắt đột ngột.
            </p>
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Countdown & Pause Button */}
          {!isPaused && countdown > 0 ? (
            <div className="flex items-center space-x-2 text-xs font-mono text-neutral-400 bg-neutral-950 px-2.5 py-1.5 border border-neutral-800">
              <span>Tự động resume sau {countdown}s</span>
              <button 
                onClick={() => setIsPaused(true)}
                className="text-orange-400 hover:text-orange-300 transition-colors p-0.5"
                title="Tạm dừng tự động khôi phục"
              >
                <Pause size={13} />
              </button>
            </div>
          ) : (
            isPaused && (
              <span className="text-xs font-mono text-amber-500/80 bg-neutral-950 px-2.5 py-1.5 border border-neutral-800">
                Đã dừng tự động khôi phục
              </span>
            )
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResume}
              disabled={loading}
              className="flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-black px-3.5 py-1.5 font-mono text-xs font-bold transition-all"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Play size={14} fill="black" />
              )}
              <span>RESUME</span>
            </button>

            <button
              onClick={handleDiscard}
              disabled={loading}
              className="flex items-center space-x-1.5 bg-neutral-800 hover:bg-red-950/40 hover:text-red-400 text-neutral-400 px-3.5 py-1.5 border border-neutral-700 font-mono text-xs transition-all"
            >
              <Trash2 size={14} />
              <span>DISCARD</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
