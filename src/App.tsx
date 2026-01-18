import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ConnectionManager from './pages/ConnectionManager';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-blue-600 flex items-center">
              FTP Sync Manager
            </h1>
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
