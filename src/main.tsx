import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import App from './App'
import './index.css'

// Global fetch interceptor for auth header injection and 401 handling
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const token = localStorage.getItem('master_token');
  const modifiedInit = { ...(init || {}) };
  
  if (token) {
    const headers = new Headers(modifiedInit.headers);
    headers.set('Authorization', `Bearer ${token}`);
    modifiedInit.headers = headers;
  }
  
  const response = await originalFetch(input, modifiedInit);
  
  // Intercept 401 and broadcast 'unauthorized' event (skip auth routes to avoid loops)
  if (response.status === 401 && !String(input).includes('/api/auth/')) {
    localStorage.removeItem('master_token');
    window.dispatchEvent(new Event('unauthorized'));
  }
  
  return response;
};

// Configure Monaco to use local resources (Manual Copy)
loader.config({ paths: { vs: '/monaco-editor/min/vs' } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
