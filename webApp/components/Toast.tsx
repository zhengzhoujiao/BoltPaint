import React, { useEffect } from 'react';
import { Icons } from '../constants';

interface ToastProps {
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose: () => void;
    duration?: number;
}

/**
 * 通用轻提示组件
 * 统一放置在顶部 60px 导航区域的中心
 */
const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose, duration = 2000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [onClose, duration]);

    return (
        <div className="fixed top-0 left-0 right-0 h-[50px] flex items-center justify-center z-[100] pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-sm text-white px-6 py-2 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto flex items-center gap-2">
                {type === 'success' && (
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                )}
                {type === 'error' && (
                    <Icons.X className="w-5 h-5 text-red-400" />
                )}
                {type === 'info' && (
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                )}
                <span className="text-sm font-medium">{message}</span>
            </div>
        </div>
    );
};

export default Toast;
