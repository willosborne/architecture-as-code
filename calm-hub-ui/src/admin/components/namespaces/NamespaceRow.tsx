import { useState } from 'react';

interface NamespaceRowProps {
    name: string;
    description: string;
    onSave: (name: string, description: string) => Promise<void>;
    onRequestDelete: (name: string) => void;
}

export function NamespaceRow({ name, description, onSave, onRequestDelete }: NamespaceRowProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(description);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function startEditing() {
        setDraft(description);
        setError(null);
        setEditing(true);
    }

    function cancelEditing() {
        setEditing(false);
        setError(null);
    }

    async function handleSave() {
        const trimmed = draft.trim();
        if (!trimmed) return;

        setSubmitting(true);
        setError(null);
        try {
            await onSave(name, trimmed);
            setEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update namespace.');
        } finally {
            setSubmitting(false);
        }
    }

    if (editing) {
        return (
            <tr>
                <td className="font-mono text-sm">{name}</td>
                <td>
                    <input
                        className="input input-sm input-bordered w-full"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={submitting}
                        aria-label={`Description for ${name}`}
                    />
                    {error && <p className="text-error text-xs mt-1" role="alert">{error}</p>}
                </td>
                <td className="text-right">
                    <div className="flex gap-1 justify-end">
                        <button
                            className="btn btn-xs btn-primary"
                            onClick={handleSave}
                            disabled={submitting || !draft.trim()}
                        >
                            {submitting ? 'Saving…' : 'Save'}
                        </button>
                        <button
                            className="btn btn-xs btn-ghost"
                            onClick={cancelEditing}
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr>
            <td className="font-mono text-sm">{name}</td>
            <td className="text-base-content/70">{description}</td>
            <td className="text-right">
                <div className="flex gap-1 justify-end">
                    <button
                        className="btn btn-xs btn-outline"
                        onClick={startEditing}
                        aria-label={`Edit description for ${name}`}
                    >
                        Edit
                    </button>
                    <button
                        className="btn btn-xs btn-error btn-outline"
                        onClick={() => onRequestDelete(name)}
                        aria-label={`Delete namespace ${name}`}
                    >
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    );
}
