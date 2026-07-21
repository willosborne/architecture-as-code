import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog.js';

describe('ConfirmDeleteDialog', () => {
    it('renders nothing when closed', () => {
        render(
            <ConfirmDeleteDialog
                open={false}
                message="Delete finos?"
                error={null}
                deleting={false}
                onConfirm={() => {}}
                onCancel={() => {}}
            />
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the message when open', () => {
        render(
            <ConfirmDeleteDialog
                open
                message="Delete namespace finos?"
                error={null}
                deleting={false}
                onConfirm={() => {}}
                onCancel={() => {}}
            />
        );
        expect(screen.getByText('Delete namespace finos?')).toBeInTheDocument();
    });

    it('renders the error message when present', () => {
        render(
            <ConfirmDeleteDialog
                open
                message="Delete finos?"
                error="Namespace finos contains resources and cannot be deleted"
                deleting={false}
                onConfirm={() => {}}
                onCancel={() => {}}
            />
        );
        expect(screen.getByRole('alert')).toHaveTextContent('contains resources');
    });

    it('calls onConfirm when Delete is clicked', () => {
        const onConfirm = vi.fn();
        render(
            <ConfirmDeleteDialog
                open
                message="Delete finos?"
                error={null}
                deleting={false}
                onConfirm={onConfirm}
                onCancel={() => {}}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
        expect(onConfirm).toHaveBeenCalled();
    });

    it('calls onCancel when Cancel is clicked', () => {
        const onCancel = vi.fn();
        render(
            <ConfirmDeleteDialog
                open
                message="Delete finos?"
                error={null}
                deleting={false}
                onConfirm={() => {}}
                onCancel={onCancel}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onCancel).toHaveBeenCalled();
    });

    it('disables both buttons and relabels Delete while deleting', () => {
        render(
            <ConfirmDeleteDialog
                open
                message="Delete finos?"
                error={null}
                deleting
                onConfirm={() => {}}
                onCancel={() => {}}
            />
        );
        expect(screen.getByRole('button', { name: /deleting…/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
});
