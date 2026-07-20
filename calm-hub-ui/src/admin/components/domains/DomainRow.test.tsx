import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DomainRow } from './DomainRow.js';

function renderRow(onRequestDelete = vi.fn()) {
    render(
        <table>
            <tbody>
                <DomainRow name="retail" onRequestDelete={onRequestDelete} />
            </tbody>
        </table>
    );
    return { onRequestDelete };
}

describe('DomainRow', () => {
    it('renders the name', () => {
        renderRow();
        expect(screen.getByText('retail')).toBeInTheDocument();
    });

    it('calls onRequestDelete with the domain name when Delete is clicked', () => {
        const { onRequestDelete } = renderRow();
        fireEvent.click(screen.getByRole('button', { name: /delete domain retail/i }));
        expect(onRequestDelete).toHaveBeenCalledWith('retail');
    });
});
