import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ConnectionManager from './pages/ConnectionManager';
import { Terminal } from 'lucide-react';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-neutral-950 text-neutral-200 selection:bg-orange-500 selection:text-black">
        {/* Sleek, asymmetric HUD Topbar */}
        <header className="bg-neutral-900/50 backdrop-blur-sm border-b border-neutral-800 sticky top-0 z-40">
          <div className="container mx-auto px-4 py-3 flex justify-between items-center max-w-5xl">
            <div className="flex items-center space-x-2.5">
              <Terminal size={18} className="text-orange-500 animate-signal" />
              <div className="flex items-baseline space-x-1.5">
                <span className="text-sm font-black tracking-wider text-neutral-100">FTP Sync Manager</span>
                <span className="text-[10px] font-mono text-neutral-500">v1.0.6</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4 text-xs font-mono">
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-none animate-signal"></span>
                <span className="text-neutral-400">Status: Active</span>
              </div>
            </div>
          </div>
        </header>
        
        <main>
          <Routes>
            <Route path="/" element={<ConnectionManager />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
