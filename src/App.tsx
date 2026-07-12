import { BrowserRouter as Router, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import ConnectionManager from './pages/ConnectionManager';
import TerminalView from './components/terminal/TerminalView';
import OverviewDashboard from './pages/OverviewDashboard';
import SettingsPage from './pages/SettingsPage';
import { Terminal, Server, LayoutDashboard, Lock, Unlock, Eye, EyeOff, ShieldAlert, Key, Check, Loader2, LogOut, Settings } from 'lucide-react';
import packageJson from '../package.json';
import { useAuthStore } from './stores/authStore';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isOverview = location.pathname === '/' || location.pathname === '/overview';
  const isConnections = location.pathname === '/connections';
  const isTerminal = location.pathname === '/terminal';
  const isSettings = location.pathname === '/settings';

  const navClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-1.5 my-2 mx-1 text-xs font-semibold tracking-wide rounded-lg transition-all duration-200 cursor-pointer ${
      active
        ? 'text-white bg-orange-600 shadow-md shadow-orange-600/10'
        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
    }`;

  return (
    <div className="min-h-screen bg-[#0d0e12] text-neutral-200 selection:bg-orange-500 selection:text-black">
      {/* HUD Topbar with navigation */}
      <header className="bg-[#0d0e12]/80 backdrop-blur-md border-b border-neutral-800/40 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-0 flex justify-between items-center max-w-full">
          {/* Left: Logo + Nav */}
          <div className="flex items-center">
            {/* Logo */}
            <div className="flex items-center space-x-2.5 pr-6 py-3.5 border-r border-neutral-800/40">
              <Terminal size={18} className="text-orange-500 animate-signal" />
              <div className="flex items-baseline space-x-1.5">
                <span className="text-sm font-extrabold tracking-wider font-display bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                  OmniSync
                </span>
                <span className="text-[10px] font-mono text-neutral-500">v{packageJson.version}</span>
              </div>
            </div>

            {/* Navigation tabs */}
            <nav className="flex items-center ml-2">
              <button onClick={() => navigate('/')} className={navClass(isOverview)}>
                <LayoutDashboard size={13} />
                Overview
              </button>
              <button onClick={() => navigate('/connections')} className={navClass(isConnections)}>
                <Server size={13} />
                Connections
              </button>
              <button onClick={() => navigate('/terminal')} className={navClass(isTerminal)}>
                <Terminal size={13} />
                Terminal
              </button>
              <button onClick={() => navigate('/settings')} className={navClass(isSettings)}>
                <Settings size={13} />
                Settings
              </button>
            </nav>
          </div>

          {/* Right: Status */}
          <div className="flex items-center space-x-4 text-xs py-3.5">
            <div className="flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-full border border-emerald-500/20 text-[10px] font-medium tracking-wide">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>STATUS: ACTIVE</span>
            </div>
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-neutral-400 hover:text-red-400 bg-neutral-800/40 hover:bg-red-500/10 border border-neutral-700/30 hover:border-red-500/20 rounded-lg transition-all duration-200 cursor-pointer text-[10px] font-semibold tracking-wide"
            >
              <LogOut size={11} />
              LOCK VAULT
            </button>
          </div>
        </div>
      </header>

      {/* 
        All pages always mounted. CSS hides the inactive ones.
        This prevents TerminalView from unmounting and losing SSH connections 
        when switching tabs.
      */}
      <main>
        <div style={{ display: isOverview ? 'block' : 'none' }}>
          <OverviewDashboard isActive={isOverview} />
        </div>
        <div style={{ display: isConnections ? 'block' : 'none' }}>
          <ConnectionManager />
        </div>
        <div style={{ display: isTerminal ? 'block' : 'none' }}>
          <TerminalView />
        </div>
        <div style={{ display: isSettings ? 'block' : 'none' }}>
          <SettingsPage />
        </div>
      </main>
    </div>
  );
}

function App() {
  const {
    isAuthenticated,
    isOnboarded,
    checkingAuth,
    lockoutSec,
    error,
    loading,
    checkAuth,
    register,
    login,
    setLockoutSec,
    setError
  } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Lockout timer countdown
  useEffect(() => {
    if (lockoutSec > 0) {
      const timer = setTimeout(() => setLockoutSec(lockoutSec - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [lockoutSec, setLockoutSec]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    await register(password);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Password is required');
      return;
    }
    const success = await login(password);
    if (success) {
      setPassword('');
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#07080a] flex flex-col justify-center items-center font-mono">
        <Terminal className="text-orange-500 animate-pulse mb-4" size={40} />
        <span className="text-xs text-neutral-500 uppercase tracking-widest animate-pulse">Initializing Secure Vault...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#07080a] text-neutral-200 flex flex-col justify-center items-center p-4 selection:bg-orange-500 selection:text-black">
        <div className="max-w-md w-full bg-[#0d0e12]/60 backdrop-blur-xl border border-neutral-800/60 p-8 rounded-2xl shadow-2xl shadow-orange-500/5 transition-all duration-300">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-orange-600/10 border border-orange-500/20 rounded-xl flex items-center justify-center mb-3">
              <Lock className="text-orange-500 animate-signal" size={22} />
            </div>
            <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent uppercase font-mono">
              OmniSync Vault
            </h1>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono mt-1">v{packageJson.version}</p>
          </div>

          {!isOnboarded ? (
            // Onboarding Wizard
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-sm font-semibold text-neutral-300">Master Password Setup</h2>
                <p className="text-[11px] text-neutral-500 mt-1">Create a master password to secure all remote connections, terminal history, and logs on this computer.</p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg flex items-start gap-2.5 text-xs">
                  <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-1.5 font-mono">Vault Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      disabled={loading}
                      className="w-full bg-neutral-900/60 border border-neutral-800 focus:border-orange-500/50 p-2.5 pl-3 pr-10 rounded-lg text-xs outline-none transition-all placeholder-neutral-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-1.5 font-mono">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retype password"
                      disabled={loading}
                      className="w-full bg-neutral-900/60 border border-neutral-800 focus:border-orange-500/50 p-2.5 pl-3 pr-10 rounded-lg text-xs outline-none transition-all placeholder-neutral-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-neutral-500 space-y-1 bg-neutral-950/40 p-3 rounded-lg border border-neutral-900">
                <div className="flex items-center gap-1.5">
                  <Check size={11} className={password.length >= 8 ? "text-orange-500" : "text-neutral-750"} />
                  <span>Must be at least 8 characters</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check size={11} className={(password && password === confirmPassword) ? "text-orange-500" : "text-neutral-750"} />
                  <span>Passwords must match</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || password.length < 8 || password !== confirmPassword}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-600/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="animate-spin" size={14} /> : <Key size={14} />}
                INITIALIZE SECURE VAULT
              </button>
            </form>
          ) : (
            // Login Screen
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xs uppercase font-bold text-neutral-400 tracking-wider font-mono">Unlock Vault</h2>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg flex items-start gap-2.5 text-xs">
                  <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-1.5 font-mono">Master Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter vault password"
                    disabled={loading || lockoutSec > 0}
                    className="w-full bg-neutral-900/60 border border-neutral-800 focus:border-orange-500/50 p-2.5 pl-3 pr-10 rounded-lg text-xs outline-none transition-all placeholder-neutral-750 text-center font-mono tracking-widest focus:tracking-normal"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !password || lockoutSec > 0}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-600/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : lockoutSec > 0 ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Unlock size={14} />
                )}
                {lockoutSec > 0 ? `LOCKED (${lockoutSec}s)` : 'UNLOCK DASHBOARD'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
