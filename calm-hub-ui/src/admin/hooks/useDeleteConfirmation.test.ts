import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDeleteConfirmation } from './useDeleteConfirmation.js';

describe('useDeleteConfirmation', () => {
    it('starts with nothing pending', () => {
        const { result } = renderHook(() => useDeleteConfirmation(vi.fn(), vi.fn()));
        expect(result.current.pending).toBeNull();
        expect(result.current.deleting).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('sets pending when requestDelete is called', () => {
        const { result } = renderHook(() => useDeleteConfirmation(vi.fn(), vi.fn()));
        act(() => result.current.requestDelete('finos'));
        expect(result.current.pending).toBe('finos');
    });

    it('clears pending on cancelDelete without calling deleteFn', () => {
        const deleteFn = vi.fn();
        const { result } = renderHook(() => useDeleteConfirmation(deleteFn, vi.fn()));
        act(() => result.current.requestDelete('finos'));
        act(() => result.current.cancelDelete());
        expect(result.current.pending).toBeNull();
        expect(deleteFn).not.toHaveBeenCalled();
    });

    it('calls deleteFn with the pending name and onDeleted on confirmDelete success', async () => {
        const deleteFn = vi.fn().mockResolvedValue(undefined);
        const onDeleted = vi.fn();
        const { result } = renderHook(() => useDeleteConfirmation(deleteFn, onDeleted));

        act(() => result.current.requestDelete('finos'));
        await act(async () => result.current.confirmDelete());

        expect(deleteFn).toHaveBeenCalledWith('finos');
        expect(onDeleted).toHaveBeenCalled();
        expect(result.current.pending).toBeNull();
        expect(result.current.deleting).toBe(false);
    });

    it('awaits onDeleted, surfacing its rejection as the error rather than firing it and forgetting', async () => {
        const deleteFn = vi.fn().mockResolvedValue(undefined);
        const onDeleted = vi.fn().mockRejectedValue(new Error('refresh failed'));
        const { result } = renderHook(() => useDeleteConfirmation(deleteFn, onDeleted));

        act(() => result.current.requestDelete('finos'));
        await act(async () => result.current.confirmDelete());

        expect(onDeleted).toHaveBeenCalled();
        expect(result.current.error).toBe('refresh failed');
    });

    it('sets error and keeps pending when deleteFn rejects with an Error', async () => {
        const deleteFn = vi.fn().mockRejectedValue(new Error('cannot delete: not empty'));
        const { result } = renderHook(() => useDeleteConfirmation(deleteFn, vi.fn()));

        act(() => result.current.requestDelete('finos'));
        await act(async () => result.current.confirmDelete());

        expect(result.current.pending).toBe('finos');
        expect(result.current.error).toBe('cannot delete: not empty');
        expect(result.current.deleting).toBe(false);
    });

    it('falls back to the default error message when the rejection is not an Error', async () => {
        const deleteFn = vi.fn().mockRejectedValue('nope');
        const { result } = renderHook(() =>
            useDeleteConfirmation(deleteFn, vi.fn(), 'Failed to delete namespace.')
        );

        act(() => result.current.requestDelete('finos'));
        await act(async () => result.current.confirmDelete());

        expect(result.current.error).toBe('Failed to delete namespace.');
    });

    it('is a no-op when confirmDelete is called with nothing pending', async () => {
        const deleteFn = vi.fn();
        const { result } = renderHook(() => useDeleteConfirmation(deleteFn, vi.fn()));
        await act(async () => result.current.confirmDelete());
        expect(deleteFn).not.toHaveBeenCalled();
    });

    it('clears a previous error when a new delete is requested', async () => {
        const deleteFn = vi.fn().mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useDeleteConfirmation(deleteFn, vi.fn()));

        act(() => result.current.requestDelete('finos'));
        await act(async () => result.current.confirmDelete());
        await waitFor(() => expect(result.current.error).toBe('boom'));

        act(() => result.current.requestDelete('finos'));
        expect(result.current.error).toBeNull();
    });
});
