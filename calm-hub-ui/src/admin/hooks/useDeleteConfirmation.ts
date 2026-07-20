import { useState } from 'react';

/**
 * Drives a request-confirm-delete flow for a single named item: tracks which item is
 * pending confirmation, the in-flight/error state of the delete call, and exposes the
 * three handlers a confirm dialog needs. Shared by NamespacesPanel and DomainsPanel
 * (and mirrors the equivalent revoke-confirmation state in NamespaceAccessPanel).
 */
export function useDeleteConfirmation(
    deleteFn: (name: string) => Promise<void>,
    onDeleted: () => void | Promise<void>,
    fallbackErrorMessage = 'Failed to delete.'
) {
    const [pending, setPending] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function requestDelete(name: string) {
        setError(null);
        setPending(name);
    }

    function cancelDelete() {
        setPending(null);
        setError(null);
    }

    async function confirmDelete() {
        if (!pending) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteFn(pending);
            setPending(null);
            await onDeleted();
        } catch (err) {
            setError(err instanceof Error ? err.message : fallbackErrorMessage);
        } finally {
            setDeleting(false);
        }
    }

    return { pending, deleting, error, requestDelete, cancelDelete, confirmDelete };
}
