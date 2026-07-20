import { ReactNode } from 'react';

interface ConfirmDeleteDialogProps {
    open: boolean;
    message: ReactNode;
    error: string | null;
    deleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDeleteDialog({ open, message, error, deleting, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
    if (!open) {
        return null;
    }

    return (
        <dialog open className="modal modal-open">
            <div className="modal-box">
                <h3 className="font-bold text-lg">Confirm delete</h3>
                <p className="py-4">{message}</p>
                {error && <p className="text-error text-sm mb-2" role="alert">{error}</p>}
                <div className="modal-action">
                    <button
                        className="btn btn-error"
                        onClick={onConfirm}
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={onCancel}
                        disabled={deleting}
                    >
                        Cancel
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button onClick={onCancel}>close</button>
            </form>
        </dialog>
    );
}
