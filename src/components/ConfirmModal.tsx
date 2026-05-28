import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ConfirmType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

interface ConfirmModalProps {
    isOpen: boolean;
    type?: ConfirmType;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    showCancel?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    type = 'info',
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    onConfirm,
    onCancel,
    showCancel = true
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle size={32} className="text-emerald-500" />;
            case 'warning':
                return <AlertTriangle size={32} className="text-orange-500" />;
            case 'error':
                return <AlertCircle size={32} className="text-red-500" />;
            case 'confirm':
                return <AlertCircle size={32} className="text-orange-500" />;
            default:
                return <Info size={32} className="text-neutral-450" />;
        }
    };

    const getColors = () => {
        switch (type) {
            case 'success':
                return {
                    bg: 'bg-neutral-950/50',
                    border: 'border-emerald-800/40',
                    button: 'bg-neutral-950 border border-emerald-900/50 text-emerald-500 hover:bg-neutral-900 hover:text-emerald-400',
                    iconBg: 'bg-neutral-950 border border-neutral-850'
                };
            case 'warning':
                return {
                    bg: 'bg-neutral-950/50',
                    border: 'border-orange-900/40',
                    button: 'bg-orange-600 hover:bg-orange-500 text-black border border-orange-700',
                    iconBg: 'bg-neutral-950 border border-neutral-850'
                };
            case 'error':
                return {
                    bg: 'bg-neutral-950/50',
                    border: 'border-red-900/40',
                    button: 'bg-neutral-950 border border-red-900/50 text-red-500 hover:bg-neutral-900 hover:text-red-400',
                    iconBg: 'bg-neutral-950 border border-neutral-850'
                };
            case 'confirm':
                return {
                    bg: 'bg-neutral-950/50',
                    border: 'border-orange-900/40',
                    button: 'bg-orange-600 hover:bg-orange-500 text-black border border-orange-700',
                    iconBg: 'bg-neutral-950 border border-neutral-850'
                };
            default:
                return {
                    bg: 'bg-neutral-950/50',
                    border: 'border-neutral-850',
                    button: 'bg-neutral-950 border border-neutral-800 text-neutral-300 hover:bg-neutral-900',
                    iconBg: 'bg-neutral-950 border border-neutral-850'
                };
        }
    };

    const colors = getColors();

    const getDefaultTitle = () => {
        switch (type) {
            case 'success': return 'SUCCESS';
            case 'warning': return 'WARNING';
            case 'error': return 'ERROR';
            case 'confirm': return 'CONFIRM_ACTION';
            default: return 'INFO';
        }
    };

    return (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
            <div
                className={`bg-neutral-900 shadow-2xl w-full max-w-md mx-4 overflow-hidden transform transition-all duration-300 animate-scaleIn border rounded-none ${colors.border} font-mono text-neutral-200`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Icon */}
                <div className={`${colors.bg} p-6 flex flex-col items-center border-b border-neutral-850`}>
                    <div className={`${colors.iconBg} p-3 mb-3 shadow-lg rounded-none`}>
                        {getIcon()}
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-100 text-center mt-2">
                        {title || getDefaultTitle()}
                    </h3>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-neutral-400 text-center text-xs leading-relaxed uppercase tracking-wider">
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className={`px-6 pb-6 flex ${showCancel ? 'justify-between gap-3' : 'justify-center'}`}>
                    {showCancel && (
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-2 bg-neutral-950 border border-neutral-800 hover:bg-neutral-900 text-neutral-400 font-bold rounded-none text-xs transition-all duration-200 uppercase tracking-wider"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2 ${colors.button} font-bold rounded-none text-xs transition-all duration-200 uppercase tracking-wider`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { 
                        opacity: 0;
                        transform: scale(0.9) translateY(-20px);
                    }
                    to { 
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.2s ease-out;
                }
                .animate-scaleIn {
                    animation: scaleIn 0.3s ease-out;
                }
            `}</style>
        </div>
    );
};

// Hook for easier usage
export const useConfirmModal = () => {
    const [modalState, setModalState] = React.useState<{
        isOpen: boolean;
        type: ConfirmType;
        title?: string;
        message: string;
        onConfirm?: () => void;
        onCancel?: () => void;
        showCancel: boolean;
        confirmText?: string;
        cancelText?: string;
    }>({
        isOpen: false,
        type: 'info',
        message: '',
        showCancel: true
    });

    const showConfirm = (options: {
        type?: ConfirmType;
        title?: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
    }): Promise<boolean> => {
        return new Promise((resolve) => {
            setModalState({
                isOpen: true,
                type: options.type || 'confirm',
                title: options.title,
                message: options.message,
                confirmText: options.confirmText,
                cancelText: options.cancelText,
                showCancel: true,
                onConfirm: () => {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
                onCancel: () => {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                    resolve(false);
                }
            });
        });
    };

    const showAlert = (options: {
        type?: ConfirmType;
        title?: string;
        message: string;
        confirmText?: string;
    }): Promise<void> => {
        return new Promise((resolve) => {
            setModalState({
                isOpen: true,
                type: options.type || 'info',
                title: options.title,
                message: options.message,
                confirmText: options.confirmText,
                showCancel: false,
                onConfirm: () => {
                    setModalState(prev => ({ ...prev, isOpen: false }));
                    resolve();
                }
            });
        });
    };

    const ConfirmModalComponent = () => (
        <ConfirmModal
            isOpen={modalState.isOpen}
            type={modalState.type}
            title={modalState.title}
            message={modalState.message}
            confirmText={modalState.confirmText}
            cancelText={modalState.cancelText}
            onConfirm={modalState.onConfirm}
            onCancel={modalState.onCancel}
            showCancel={modalState.showCancel}
        />
    );

    return {
        showConfirm,
        showAlert,
        ConfirmModalComponent
    };
};

export default ConfirmModal;
