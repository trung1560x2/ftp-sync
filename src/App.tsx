import { BrowserRouter as Router, useLocation, useNavigate } from 'react-router-dom';
import ConnectionManager from './pages/ConnectionManager';
import TerminalView from './components/terminal/TerminalView';
import OverviewDashboard from './pages/OverviewDashboard';
import { Terminal, Server, LayoutDashboard } from 'lucide-react';
import packageJson from '../package.json';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isOverview = location.pathname === '/' || location.pathname === '/overview';
  const isConnections = location.pathname === '/connections';
  const isTerminal = location.pathname === '/terminal';

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
            </nav>
          </div>

          {/* Right: Status */}
          <div className="flex items-center space-x-4 text-xs py-3.5">
            <div className="flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-full border border-emerald-500/20 text-[10px] font-medium tracking-wide">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>STATUS: ACTIVE</span>
            </div>
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
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
