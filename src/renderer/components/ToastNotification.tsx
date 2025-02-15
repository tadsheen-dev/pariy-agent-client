/* eslint-disable prettier/prettier */
import React, { useEffect, useState } from 'react';

interface Toast {
    message: string;
    type: 'success' | 'error';
}

export default function ToastNotification() {
    const [toast, setToast] = useState<Toast | null>(null);

    useEffect(() => {
        const handleAnalysisStatus = (...args: unknown[]) => {
            console.log('ToastNotification received args:', args);
            const payload = args[0] as { status: string } | undefined;
            const status = payload && payload.status ? payload.status : 'no status received';
            console.log('Determined status:', status);
            if (status === 'saved') {
                setToast({ message: 'Analysis saved successfully', type: 'success' });
            } else if (status === 'error') {
                setToast({ message: 'Analysis failed to save', type: 'error' });
            } else {
                setToast({ message: `Analysis status: ${status}`, type: 'error' });
            }
            // Auto-dismiss after 5 seconds
            setTimeout(() => {
                setToast(null);
            }, 5000);
        };

        if (window && window.electron && window.electron.ipcRenderer) {
            const unsubscribe = window.electron.ipcRenderer.on('analysis-status', handleAnalysisStatus);
            return () => {
                if (unsubscribe) unsubscribe();
            };
        }
        return undefined;
    }, []);

    if (!toast) return null;

    const bgColor = toast.type === 'success' ? 'bg-green-600' : 'bg-red-600';

    return (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-md ${bgColor} text-white`}>
            <span>{toast.message}</span>
        </div>
    );
}
