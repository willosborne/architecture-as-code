interface DomainRowProps {
    name: string;
    onRequestDelete: (name: string) => void;
}

export function DomainRow({ name, onRequestDelete }: DomainRowProps) {
    return (
        <tr>
            <td className="font-mono text-sm">{name}</td>
            <td className="text-right">
                <div className="flex gap-1 justify-end">
                    <button
                        className="btn btn-xs btn-error btn-outline"
                        onClick={() => onRequestDelete(name)}
                        aria-label={`Delete domain ${name}`}
                    >
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    );
}
