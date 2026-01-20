import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import App from './App'
import './index.css'

// Configure Monaco to use local resources (Manual Copy)
loader.config({ paths: { vs: '/monaco-editor/min/vs' } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
