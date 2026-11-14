import { useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export function AccessibleModal({ isOpen, onClose, title, children }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        // Auto-focus close button when modal opens
        closeBtnRef.current?.focus();

        // Trap focus inside modal
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstEl = focusableElements?.[0];
        const lastEl = focusableElements?.[focusableElements.length - 1];

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;
            if (!focusableElements || focusableElements.length === 0) return;

            if (e.shiftKey) {
                if (document.activeElement === firstEl) {
                    e.preventDefault();
                    lastEl?.focus();
                }
            } else {
                if (document.activeElement === lastEl) {
                    e.preventDefault();
                    firstEl?.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden'; // Prevent background scroll

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="presentation"
        >
            {/* Dark overlay */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal dialog */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white">
                    <h2 id="modal-title" className="text-xl font-bold text-gray-900">
                        {title}
                    </h2>
                    <button
                        ref={closeBtnRef}
                        onClick={onClose}
                        aria-label="Close modal"
                        className="p-2 rounded-full hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}
