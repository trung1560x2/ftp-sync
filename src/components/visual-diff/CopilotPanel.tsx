import React from 'react';
import { Sparkles, RefreshCw, Settings, X, AlertCircle } from 'lucide-react';
import { useAiSettingsStore } from '../../stores/aiSettingsStore';

interface CopilotPanelProps {
  showCopilotSettings: boolean;
  setShowCopilotSettings: (show: boolean) => void;
  copilotLoading: boolean;
  copilotExplanation: string;
  copilotError: string;
  generateAiExplanation: () => void;
  setShowCopilot: (show: boolean) => void;
}

export const CopilotPanel: React.FC<CopilotPanelProps> = ({
  showCopilotSettings,
  setShowCopilotSettings,
  copilotLoading,
  copilotExplanation,
  copilotError,
  generateAiExplanation,
  setShowCopilot
}) => {
  const {
    enabled: copilotEnabled,
    autoAnalyze: copilotAutoAnalyze,
    apiKey: customApiKey,
    model: selectedModel,
    setEnabled: setCopilotEnabled,
    setAutoAnalyze: setCopilotAutoAnalyze,
    setApiKey: setCustomApiKey,
    setModel: setSelectedModel
  } = useAiSettingsStore();

  return (
    <div className="border-t border-neutral-800/60 bg-[#0d0e12]/85 flex flex-col h-64 select-none shrink-0 animate-in slide-in-from-bottom duration-250">
      {/* Terminal Header */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-800/60 bg-[#0d0e12]/40">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-emerald-400 animate-pulse" />
          <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest font-outfit">
            AI COPILOT // DIFF EXPLANATION
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!showCopilotSettings && copilotEnabled && (
            <button
              onClick={generateAiExplanation}
              disabled={copilotLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-neutral-400 hover:text-emerald-400 border border-neutral-800 hover:border-emerald-900/40 bg-neutral-900/60 disabled:opacity-50 transition-colors uppercase tracking-wider rounded-md cursor-pointer"
              title="Re-analyze File Diffs"
            >
              <RefreshCw size={11} className={copilotLoading ? 'animate-spin' : ''} />
              Re-Analyze
            </button>
          )}
          <button
            onClick={() => setShowCopilotSettings(!showCopilotSettings)}
            className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold border rounded-md transition-colors uppercase tracking-wider cursor-pointer ${
              showCopilotSettings 
                ? 'bg-orange-600 text-black border-orange-700 font-extrabold' 
                : 'text-neutral-400 border-neutral-800 hover:text-orange-500 hover:border-orange-900/40 bg-neutral-900/60'
            }`}
            title="Copilot Settings"
          >
            <Settings size={11} className={showCopilotSettings ? 'animate-spin' : ''} />
            Settings
          </button>
          <button
            onClick={() => setShowCopilot(false)}
            className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-250 transition-colors border border-neutral-800 rounded-md cursor-pointer"
            title="Minimize Copilot"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      
      {/* Terminal Content View */}
      <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] custom-scrollbar bg-[#0d0e12]/10 text-neutral-300">
        {showCopilotSettings ? (
          <div className="max-w-md mx-auto space-y-3.5 py-1 font-mono text-[11px] uppercase">
            <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-neutral-800/60">
              <span className="w-1.5 h-3 bg-orange-500 block"></span>
              <span className="text-[10px] font-black text-neutral-400 tracking-widest font-outfit">
                AI COPILOT CONFIGURATION
              </span>
            </div>
            
            {/* Toggle Enable */}
            <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl">
              <div className="space-y-0.5 pr-4">
                <span className="font-bold text-neutral-300 block">ENABLE AI COPILOT</span>
                <span className="text-[9px] text-neutral-505 font-normal block leading-normal">
                  Enable or disable Gemini diff explanations
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={copilotEnabled}
                  onChange={(e) => setCopilotEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-black"></div>
              </label>
            </div>

            {/* API Key Input */}
            <div className="bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl space-y-1.5">
              <div className="space-y-0.5">
                <span className="font-bold text-neutral-300 block">CUSTOM GEMINI API KEY</span>
                <span className="text-[9px] text-neutral-505 font-normal block leading-normal">
                  Stored locally in your browser. Defaults to server key if empty.
                </span>
              </div>
              <input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-[#0d0e12]/60 border border-neutral-800 text-xs px-2.5 py-1.5 text-neutral-200 outline-none focus:border-orange-500 rounded-lg transition-colors"
              />
            </div>

            {/* Model Selection */}
            <div className="bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl space-y-1.5">
              <div className="space-y-0.5">
                <span className="font-bold text-neutral-300 block">AI GEMINI MODEL</span>
                <span className="text-[9px] text-neutral-500 font-normal block leading-normal">
                  Select AI model to perform the analysis
                </span>
              </div>
              <input
                type="text"
                list="gemini-models"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                placeholder="gemini-1.5-flash"
                className="w-full bg-[#0d0e12]/60 border border-neutral-800 text-xs px-2.5 py-1.5 text-neutral-200 outline-none focus:border-orange-500 rounded-lg transition-colors"
              />
              <datalist id="gemini-models">
                <option value="gemini-2.5-flash">GEMINI 2.5 FLASH (RECOMMENDED)</option>
                <option value="gemini-2.5-pro">GEMINI 2.5 PRO</option>
                <option value="gemini-2.0-flash">GEMINI 2.0 FLASH</option>
                <option value="gemini-2.0-flash-thinking-exp">GEMINI 2.0 FLASH THINKING</option>
                <option value="gemini-1.5-flash">GEMINI 1.5 FLASH</option>
                <option value="gemini-1.5-pro">GEMINI 1.5 PRO</option>
                <option value="gemini-1.5-flash-8b">GEMINI 1.5 FLASH 8B</option>
              </datalist>
            </div>

            {/* Auto Analyze Trigger */}
            <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl">
              <div className="space-y-0.5 pr-4">
                <span className="font-bold text-neutral-300 block">AUTO RUN ON OPEN</span>
                <span className="text-[9px] text-neutral-500 font-normal block leading-normal">
                  Automatically trigger analysis when copilot is opened
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={copilotAutoAnalyze}
                  onChange={(e) => setCopilotAutoAnalyze(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-black"></div>
              </label>
            </div>

            <button
              onClick={() => setShowCopilotSettings(false)}
              className="w-full py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 hover:text-white text-neutral-400 font-bold transition-colors rounded-lg text-center cursor-pointer"
            >
              SAVE & BACK
            </button>
          </div>
        ) : !copilotEnabled ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3.5 text-center px-6">
            <AlertCircle size={20} className="text-neutral-500 animate-pulse" />
            <div className="space-y-1">
              <span className="text-neutral-400 font-bold uppercase text-[11px] block">AI COPILOT IS CURRENTLY DISABLED</span>
              <span className="text-neutral-500 text-[10px] uppercase block leading-relaxed max-w-sm mx-auto">
                Enable it below or configure custom model settings
              </span>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setCopilotEnabled(true);
                  setTimeout(() => {
                    generateAiExplanation();
                  }, 50);
                }}
                className="px-4 py-1.5 bg-emerald-950/25 text-emerald-450 border border-emerald-900/40 hover:bg-emerald-900 hover:text-black font-bold text-xs transition-colors rounded-lg uppercase tracking-wider cursor-pointer"
              >
                ENABLE COPILOT
              </button>
              <button
                onClick={() => setShowCopilotSettings(true)}
                className="px-4 py-1.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:text-white text-neutral-400 font-bold text-xs transition-colors rounded-lg uppercase tracking-wider cursor-pointer"
              >
                OPEN CONFIG
              </button>
            </div>
          </div>
        ) : copilotLoading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-2 uppercase text-neutral-500 font-bold tracking-wider">
            <div className="flex space-x-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
            <span>CONNECTING TO GEMINI API SERVICE...</span>
            <span className="text-[9px] text-neutral-500 font-normal">ANALYZING CHANGED FILES STRUCTURE</span>
          </div>
        ) : copilotError ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3.5 text-center px-6">
            <AlertCircle size={20} className="text-red-500 animate-pulse" />
            <div className="space-y-1">
              <span className="text-red-400 font-bold uppercase text-[11px] block">ANALYSIS FAILURE</span>
              <span className="text-neutral-500 text-[10px] uppercase block leading-relaxed">{copilotError}</span>
            </div>
            {copilotError.includes('GEMINI_API_KEY_MISSING') && (
              <div className="text-[9px] bg-red-950/20 text-red-400 border border-red-900/30 p-2.5 select-all max-w-md mx-auto rounded-lg">
                Configure custom API key in settings or set server env:
                <br />
                GEMINI_API_KEY=AIzaSy...
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={generateAiExplanation}
                className="px-4 py-1.5 bg-red-950/25 text-red-450 border border-red-900/40 hover:bg-red-900 hover:text-black font-bold text-xs transition-colors rounded-lg uppercase tracking-wider cursor-pointer"
              >
                RETRY ANALYSIS
              </button>
              <button
                onClick={() => setShowCopilotSettings(true)}
                className="px-4 py-1.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:text-white text-neutral-400 font-bold text-xs transition-colors rounded-lg uppercase tracking-wider cursor-pointer"
              >
                OPEN CONFIG
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 select-text select-all leading-relaxed uppercase pr-2.5">
            <div className="flex items-center gap-1.5 border-b border-neutral-800/40 pb-1.5 mb-2 font-bold text-emerald-450 text-[10px] tracking-wider">
              <span className="w-1.5 h-3 bg-emerald-500 block"></span>
              Gemini explanation response:
            </div>
            <div className="whitespace-pre-wrap font-mono leading-normal text-neutral-350">{copilotExplanation}</div>
          </div>
        )}
      </div>
    </div>
  );
};
