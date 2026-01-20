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
                return <CheckCircle size={48} className="text-green-500" />;
            case 'warning':
                return <AlertTriangle size={48} className="text-yellow-500" />;
            case 'error':
                return <AlertCircle size={48} className="text-red-500" />;
            case 'confirm':
                return <AlertCircle size={48} className="text-blue-500" />;
            default:
                return <Info size={48} className="text-blue-500" />;
        }
    };

    const getColors = () => {
        switch (type) {
            case 'success':
                return {
                    bg: 'bg-green-50',
                    border: 'border-green-200',
                    button: 'bg-green-600 hover:bg-green-700',
                    iconBg: 'bg-green-100'
                };
            case 'warning':
                return {
                    bg: 'bg-yellow-50',
                    border: 'border-yellow-200',
                    button: 'bg-yellow-600 hover:bg-yellow-700',
                    iconBg: 'bg-yellow-100'
                };
            case 'error':
                return {
                    bg: 'bg-red-50',
                    border: 'border-red-200',
                    button: 'bg-red-600 hover:bg-red-700',
                    iconBg: 'bg-red-100'
                };
            case 'confirm':
                return {
                    bg: 'bg-blue-50',
                    border: 'border-blue-200',
                    button: 'bg-blue-600 hover:bg-blue-700',
                    iconBg: 'bg-blue-100'
                };
            default:
                return {
                    bg: 'bg-blue-50',
                    border: 'border-blue-200',
                    button: 'bg-blue-600 hover:bg-blue-700',
                    iconBg: 'bg-blue-100'
                };
        }
    };

    const colors = getColors();

    const getDefaultTitle = () => {
        switch (type) {
            case 'success': return 'Success';
            case 'warning': return 'Warning';
            case 'error': return 'Error';
            case 'confirm': return 'Confirm Action';
            default: return 'Information';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
            <div
                className={`bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden transform transition-all duration-300 animate-scaleIn ${colors.border} border`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Icon */}
                <div className={`${colors.bg} p-6 flex flex-col items-center`}>
                    <div className={`${colors.iconBg} p-4 rounded-full mb-4 shadow-lg`}>
                        {getIcon()}
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 text-center">
                        {title || getDefaultTitle()}
                    </h3>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-gray-600 text-center text-base leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className={`px-6 pb-6 flex ${showCancel ? 'justify-between gap-3' : 'justify-center'}`}>
                    {showCancel && (
                        <button
                            onClick={onCancel}
                            className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all duration-200 shadow-sm hover:shadow"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-6 py-3 ${colors.button} text-white font-medium rounded-xl transition-all duration-200 shadow-md hover:shadow-lg`}
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
