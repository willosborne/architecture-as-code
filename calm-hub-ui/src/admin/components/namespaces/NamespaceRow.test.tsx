import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NamespaceRow } from './NamespaceRow.js';

function renderRow(onSave = vi.fn().mockResolvedValue(undefined), onRequestDelete = vi.fn()) {
    render(
        <table>
            <tbody>
                <NamespaceRow name="finos" description="FINOS namespace" onSave={onSave} onRequestDelete={onRequestDelete} />
            </tbody>
        </table>
    );
    return { onSave, onRequestDelete };
}

describe('NamespaceRow', () => {
    it('renders the name and description', () => {
        renderRow();
        expect(screen.getByText('finos')).toBeInTheDocument();
        expect(screen.getByText('FINOS namespace')).toBeInTheDocument();
    });

    it('calls onRequestDelete with the namespace name when Delete is clicked', () => {
        const { onRequestDelete } = renderRow();
        fireEvent.click(screen.getByRole('button', { name: /delete namespace finos/i }));
        expect(onRequestDelete).toHaveBeenCalledWith('finos');
    });

    it('switches to an editable description field when Edit is clicked', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
        expect(screen.getByLabelText('Description for finos')).toHaveValue('FINOS namespace');
    });

    it('disables Save while the description is blank', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
        fireEvent.change(screen.getByLabelText('Description for finos'), { target: { value: '  ' } });
        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('calls onSave with the trimmed name and description on Save', async () => {
        const { onSave } = renderRow();
        fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
        fireEvent.change(screen.getByLabelText('Description for finos'), {
            target: { value: '  updated desc  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledWith('finos', 'updated desc'));
    });

    it('returns to display mode after a successful save', async () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
        fireEvent.change(screen.getByLabelText('Description for finos'), {
            target: { value: 'updated desc' },
        });
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        await waitFor(() =>
            expect(screen.queryByLabelText('Description for finos')).not.toBeInTheDocument()
        );
    });

    it('discards changes and returns to display mode on Cancel', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
        fireEvent.change(screen.getByLabelText('Description for finos'), {
            target: { value: 'discarded' },
        });
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

        expect(screen.queryByLabelText('Description for finos')).not.toBeInTheDocument();
        expect(screen.getByText('FINOS namespace')).toBeInTheDocument();
    });

    it('shows an inline error and stays in edit mode when save fails', async () => {
        const onSave = vi.fn().mockRejectedValue(new Error('Namespace not found'));
        renderRow(onSave);
        fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent('Namespace not found')
        );
        expect(screen.getByLabelText('Description for finos')).toBeInTheDocument();
    });
});
