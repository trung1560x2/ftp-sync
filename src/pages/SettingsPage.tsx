import React, { useState } from 'react';
import { 
  Save, Key, RefreshCw, Sparkles, Trash2, 
  Settings, ShieldAlert, Loader2, Eye, EyeOff, Moon, Languages, Shield
} from 'lucide-react';
import { useAiSettingsStore } from '../stores/aiSettingsStore';
import { useThemeStore } from '../stores/themeStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';

export default function SettingsPage() {
  // Store States
  const aiSettings = useAiSettingsStore();
  const themeSettings = useThemeStore();
  const generalSettings = useSettingsStore();
  const { logout } = useAuthStore();

  // Local States for change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Local States for actions
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Handle password change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu mới phải từ 8 ký tự trở lên.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu xác nhận không khớp.' });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        setPasswordMessage({ type: 'success', text: 'Đổi mật khẩu Vault thành công!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMessage({ type: 'error', text: data.error || 'Đổi mật khẩu thất bại.' });
      }
    } catch (err: unknown) {
      const error = err as Error;
      setPasswordMessage({ type: 'error', text: error.message || 'Lỗi kết nối máy chủ.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle DB logs cleanup
  const handleRunCleanup = async () => {
    setCleanupLoading(true);
    setCleanupMessage(null);
    try {
      const res = await fetch('/api/settings/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays: generalSettings.logRetentionDays })
      });
      const data = await res.json();
      if (data.success) {
        setCleanupMessage('Dọn dẹp nhật ký thành công!');
        setTimeout(() => setCleanupMessage(null), 3000);
      } else {
        setCleanupMessage('Dọn dẹp thất bại: ' + (data.error || ''));
      }
    } catch (err: unknown) {
      const error = err as Error;
      setCleanupMessage('Lỗi kết nối: ' + error.message);
    } finally {
      setCleanupLoading(false);
    }
  };

  // Handle clearing index cache
  const handleClearCache = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ bộ nhớ đệm chỉ mục file? Hành động này sẽ yêu cầu quét lại ở lần so sánh tiếp theo.')) {
      return;
    }
    setCacheLoading(true);
    setCacheMessage(null);
    try {
      const res = await fetch('/api/settings/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setCacheMessage('Đã xóa bộ nhớ đệm chỉ mục!');
        setTimeout(() => setCacheMessage(null), 3000);
      } else {
        setCacheMessage('Xóa thất bại: ' + (data.error || ''));
      }
    } catch (err: unknown) {
      const error = err as Error;
      setCacheMessage('Lỗi kết nối: ' + error.message);
    } finally {
      setCacheLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl font-sans animate-in fade-in duration-300">
      {/* Title */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-extrabold tracking-wide font-display bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent flex items-center gap-2 uppercase">
            <Settings size={20} className="text-orange-500" />
            Cấu hình & Thiết lập / Settings
          </h1>
          <p className="text-[10px] text-neutral-500 font-mono mt-0.5 uppercase">
            [OMNISYNC SYSTEM-WIDE PREFERENCES & VAULT MANAGEMENT]
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left Side: General and AI Settings */}
        <div className="space-y-6">
          
          {/* Section 1: System Preferences */}
          <div className="bg-[#161922]/60 backdrop-blur-md border border-neutral-800/60 p-5 rounded-2xl">
            <h2 className="text-xs font-black uppercase text-neutral-200 tracking-wider mb-4 pb-2 border-b border-neutral-800/40 flex items-center gap-2">
              <Moon size={13} className="text-orange-500" />
              Thiết lập hệ thống / System
            </h2>
            
            <div className="space-y-4">
              {/* Theme selection */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                  Giao diện / Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => themeSettings.setTheme('dark')}
                    className={`py-2 px-3 border text-xs font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      themeSettings.theme === 'dark'
                        ? 'bg-orange-600/10 border-orange-500/40 text-orange-400 shadow-md shadow-orange-500/5'
                        : 'bg-neutral-900 border-neutral-800/80 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Moon size={12} />
                    Dark Theme
                  </button>
                  <button
                    onClick={() => themeSettings.setTheme('light')}
                    className={`py-2 px-3 border text-xs font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      themeSettings.theme === 'light'
                        ? 'bg-orange-600/10 border-orange-500/40 text-orange-400 shadow-md shadow-orange-500/5'
                        : 'bg-neutral-900 border-neutral-800/80 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Save size={12} />
                    Light Theme
                  </button>
                </div>
              </div>

              {/* Language Selector */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                  Ngôn ngữ / Language
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => generalSettings.setLanguage('en')}
                    className={`py-2 px-3 border text-xs font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      generalSettings.language === 'en'
                        ? 'bg-orange-600/10 border-orange-500/40 text-orange-400 shadow-md shadow-orange-500/5'
                        : 'bg-neutral-900 border-neutral-800/80 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Languages size={12} />
                    English
                  </button>
                  <button
                    onClick={() => generalSettings.setLanguage('vi')}
                    className={`py-2 px-3 border text-xs font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      generalSettings.language === 'vi'
                        ? 'bg-orange-600/10 border-orange-500/40 text-orange-400 shadow-md shadow-orange-500/5'
                        : 'bg-neutral-900 border-neutral-800/80 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Languages size={12} />
                    Tiếng Việt
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Sync Defaults */}
          <div className="bg-[#161922]/60 backdrop-blur-md border border-neutral-800/60 p-5 rounded-2xl">
            <h2 className="text-xs font-black uppercase text-neutral-200 tracking-wider mb-4 pb-2 border-b border-neutral-800/40 flex items-center gap-2">
              <RefreshCw size={13} className="text-orange-500" />
              Thông số đồng bộ / Sync Defaults
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Max Parallel Connections */}
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Số luồng song song / Parallel Limits
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={generalSettings.defaultMaxConnections}
                    onChange={(e) => generalSettings.setDefaultMaxConnections(parseInt(e.target.value, 10) || 3)}
                    className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  <p className="text-[9px] text-neutral-500 mt-1 uppercase font-mono">Default connections pool size.</p>
                </div>

                {/* Buffer Size KB */}
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Kích thước bộ đệm / Buffer Size (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="128"
                    value={generalSettings.defaultBufferSizeKB}
                    onChange={(e) => generalSettings.setDefaultBufferSizeKB(parseInt(e.target.value, 10) || 16)}
                    className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  <p className="text-[9px] text-neutral-500 mt-1 uppercase font-mono">Default stream highWaterMark.</p>
                </div>
              </div>

              {/* Log Retention Policy */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Thời hạn lưu nhật ký / Log Retention
                </label>
                <select
                  value={generalSettings.logRetentionDays}
                  onChange={(e) => generalSettings.setLogRetentionDays(parseInt(e.target.value, 10))}
                  className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors cursor-pointer"
                >
                  <option value="7">7 ngày / 7 Days</option>
                  <option value="30">30 ngày / 30 Days</option>
                  <option value="90">90 ngày / 90 Days</option>
                  <option value="365">365 ngày / 365 Days</option>
                </select>
                <p className="text-[9px] text-neutral-500 mt-1 uppercase font-mono">SQLite stats & transfer history persistence.</p>
              </div>

              {/* Advanced Actions */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleRunCleanup}
                  disabled={cleanupLoading}
                  className="w-full py-2 bg-neutral-900 hover:bg-[#1f2330] border border-neutral-800 text-neutral-300 hover:text-orange-400 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {cleanupLoading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Dọn dẹp SQLite ngay / Run Database Cleanup
                </button>
                {cleanupMessage && (
                  <p className="text-center text-[10px] font-mono text-emerald-400 uppercase tracking-wider">{cleanupMessage}</p>
                )}

                <button
                  onClick={handleClearCache}
                  disabled={cacheLoading}
                  className="w-full py-2 bg-neutral-900 hover:bg-[#1f2330] border border-neutral-800 text-neutral-300 hover:text-red-400 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {cacheLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Xóa bộ nhớ đệm chỉ mục / Invalidate Local Index Cache
                </button>
                {cacheMessage && (
                  <p className="text-center text-[10px] font-mono text-emerald-400 uppercase tracking-wider">{cacheMessage}</p>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: AI Settings and Vault Security */}
        <div className="space-y-6">
          
          {/* Section 3: Gemini AI Copilot Settings */}
          <div className="bg-[#161922]/60 backdrop-blur-md border border-neutral-800/60 p-5 rounded-2xl">
            <h2 className="text-xs font-black uppercase text-neutral-200 tracking-wider mb-4 pb-2 border-b border-neutral-800/40 flex items-center gap-2">
              <Sparkles size={13} className="text-orange-500" />
              Gemini AI Copilot
            </h2>
            
            <div className="space-y-4">
              {/* Enabled Toggles */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-300 uppercase tracking-wider">
                    Kích hoạt Copilot / Enable AI Assistant
                  </label>
                  <p className="text-[9px] text-neutral-500 uppercase font-mono mt-0.5">Use Gemini to explain diffs.</p>
                </div>
                <input
                  type="checkbox"
                  checked={aiSettings.enabled}
                  onChange={(e) => aiSettings.setEnabled(e.target.checked)}
                  className="w-4 h-4 border-neutral-800 bg-neutral-900 text-orange-500 focus:ring-0 cursor-pointer accent-orange-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-300 uppercase tracking-wider">
                    Tự động phân tích / Auto-Analyze
                  </label>
                  <p className="text-[9px] text-neutral-500 uppercase font-mono mt-0.5">Run analysis automatically on diff.</p>
                </div>
                <input
                  type="checkbox"
                  checked={aiSettings.autoAnalyze}
                  onChange={(e) => aiSettings.setAutoAnalyze(e.target.checked)}
                  className="w-4 h-4 border-neutral-800 bg-neutral-900 text-orange-500 focus:ring-0 cursor-pointer accent-orange-500"
                />
              </div>

              {/* Gemini Model Selection */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Mẫu trí tuệ nhân tạo / AI Model
                </label>
                <select
                  value={aiSettings.model}
                  onChange={(e) => aiSettings.setModel(e.target.value)}
                  className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors cursor-pointer"
                >
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Nhanh & Tối ưu)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Thông minh & Chi tiết)</option>
                  <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental</option>
                </select>
              </div>

              {/* Custom API Key */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                  Khóa API Gemini / Gemini API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={aiSettings.apiKey}
                    onChange={(e) => aiSettings.setApiKey(e.target.value)}
                    placeholder="Dán khóa API của bạn vào đây..."
                    className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                  >
                    {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <p className="text-[9px] text-neutral-500 mt-1 uppercase font-mono">
                  If blank, OmniSync will fall back to server env configurations.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Vault Password & Security */}
          <div className="bg-[#161922]/60 backdrop-blur-md border border-neutral-800/60 p-5 rounded-2xl">
            <h2 className="text-xs font-black uppercase text-neutral-200 tracking-wider mb-4 pb-2 border-b border-neutral-800/40 flex items-center gap-2">
              <Shield size={13} className="text-orange-500" />
              Mật khẩu Vault & Bảo mật / Security
            </h2>
            
            <form onSubmit={handleChangePassword} className="space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Mật khẩu hiện tại / Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                  >
                    {showCurrentPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Mật khẩu mới / New Password (min 8 chars)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                  >
                    {showNewPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Xác nhận mật khẩu mới / Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full bg-neutral-900/60 border border-neutral-800/80 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                  >
                    {showConfirmPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Message */}
              {passwordMessage && (
                <div className={`p-2.5 rounded-lg border text-xs font-bold flex items-center gap-2 ${
                  passwordMessage.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/25 text-red-400'
                }`}>
                  <ShieldAlert size={14} className={passwordMessage.type === 'error' ? 'animate-pulse' : ''} />
                  <span>{passwordMessage.text}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-neutral-950 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {passwordLoading ? <Loader2 size={12} className="animate-spin" /> : <Key size={12} />}
                Cập nhật mật khẩu / Update Master Password
              </button>
            </form>

            {/* Quick Lock Vault */}
            <div className="mt-4 pt-4 border-t border-neutral-800/40 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-neutral-300 uppercase tracking-wider">Khóa Vault ngay lập tức / Lock Vault</p>
                <p className="text-[8px] text-neutral-500 uppercase font-mono mt-0.5">Revoke current token session.</p>
              </div>
              <button
                onClick={() => logout()}
                className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 hover:text-red-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                LOCK VAULT NOW
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
