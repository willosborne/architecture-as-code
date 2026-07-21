import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NamespacesPanel } from './NamespacesPanel.js';
import { CalmService } from '../../service/calm-service.js';

function mockService(
    namespaces: { name: string; description: string }[],
    createResult: 'ok' | 'fail' = 'ok'
) {
    const svc = new CalmService();
    vi.spyOn(svc, 'fetchNamespaceDetails').mockResolvedValue(namespaces);
    vi.spyOn(svc, 'createNamespace').mockImplementation(() =>
        createResult === 'ok' ? Promise.resolve() : Promise.reject(new Error('Namespace already exists'))
    );
    vi.spyOn(svc, 'updateNamespace').mockResolvedValue(undefined);
    vi.spyOn(svc, 'deleteNamespace').mockResolvedValue(undefined);
    return svc;
}

function renderPanel(svc: CalmService) {
    return render(<NamespacesPanel calmService={svc} />);
}

beforeEach(() => vi.clearAllMocks());

describe('NamespacesPanel', () => {

    describe('loading', () => {
        it('shows a loading spinner while fetching', () => {
            const svc = mockService([]);
            renderPanel(svc);
            expect(screen.getByLabelText('Loading namespaces')).toBeInTheDocument();
        });

        it('hides the spinner after loading', async () => {
            const svc = mockService([{ name: 'finos', description: 'FINOS namespace' }]);
            renderPanel(svc);
            await waitFor(() =>
                expect(screen.queryByLabelText('Loading namespaces')).not.toBeInTheDocument()
            );
        });
    });

    describe('existing namespaces list', () => {
        it('renders each namespace with its name and description', async () => {
            const svc = mockService([
                { name: 'finos', description: 'FINOS namespace' },
                { name: 'finos.payments', description: 'Payments sub-namespace' },
            ]);
            renderPanel(svc);
            expect(await screen.findByText('finos')).toBeInTheDocument();
            expect(screen.getByText('FINOS namespace')).toBeInTheDocument();
            expect(screen.getByText('finos.payments')).toBeInTheDocument();
            expect(screen.getByText('Payments sub-namespace')).toBeInTheDocument();
        });

        it('shows empty state message when no namespaces exist', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            expect(await screen.findByText(/no namespaces yet/i)).toBeInTheDocument();
        });

        it('shows a load error when fetch fails', async () => {
            const svc = new CalmService();
            vi.spyOn(svc, 'fetchNamespaceDetails').mockRejectedValue(new Error('fail'));
            renderPanel(svc);
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent(/failed to load namespaces/i)
            );
        });
    });

    describe('create namespace form', () => {
        it('renders the name and description inputs, both required', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');
            expect(screen.getByLabelText('Namespace name')).toBeRequired();
            expect(screen.getByLabelText('Namespace description')).toBeRequired();
        });

        it('disables the create button when name is empty', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');
            expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
        });

        it('disables the create button when description is empty', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');
            fireEvent.change(screen.getByLabelText('Namespace name'), {
                target: { value: 'my-ns' },
            });
            expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
        });

        it('enables the create button when both fields are filled', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');
            fireEvent.change(screen.getByLabelText('Namespace name'), {
                target: { value: 'my-ns' },
            });
            fireEvent.change(screen.getByLabelText('Namespace description'), {
                target: { value: 'desc' },
            });
            expect(screen.getByRole('button', { name: /create/i })).not.toBeDisabled();
        });

        it('calls createNamespace with trimmed name and description on submit', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');

            fireEvent.change(screen.getByLabelText('Namespace name'), {
                target: { value: '  my-ns  ' },
            });
            fireEvent.change(screen.getByLabelText('Namespace description'), {
                target: { value: '  My namespace  ' },
            });
            fireEvent.click(screen.getByRole('button', { name: /create/i }));

            await waitFor(() =>
                expect(svc.createNamespace).toHaveBeenCalledWith('my-ns', 'My namespace')
            );
        });

        it('shows success message after creation', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');

            fireEvent.change(screen.getByLabelText('Namespace name'), { target: { value: 'my-ns' } });
            fireEvent.change(screen.getByLabelText('Namespace description'), { target: { value: 'desc' } });
            fireEvent.click(screen.getByRole('button', { name: /create/i }));

            await waitFor(() =>
                expect(screen.getByRole('status')).toHaveTextContent(/my-ns.*created/i)
            );
        });

        it('clears the form fields after successful creation', async () => {
            const svc = mockService([]);
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');

            fireEvent.change(screen.getByLabelText('Namespace name'), { target: { value: 'my-ns' } });
            fireEvent.change(screen.getByLabelText('Namespace description'), {
                target: { value: 'some description' },
            });
            fireEvent.click(screen.getByRole('button', { name: /create/i }));

            await waitFor(() => screen.getByRole('status'));
            expect(screen.getByLabelText('Namespace name')).toHaveValue('');
            expect(screen.getByLabelText('Namespace description')).toHaveValue('');
        });

        it('refreshes the namespace list after successful creation', async () => {
            const svc = new CalmService();
            vi.spyOn(svc, 'fetchNamespaceDetails')
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ name: 'my-ns', description: 'desc' }]);
            vi.spyOn(svc, 'createNamespace').mockResolvedValue();
            renderPanel(svc);
            await screen.findByText(/no namespaces yet/i);

            fireEvent.change(screen.getByLabelText('Namespace name'), { target: { value: 'my-ns' } });
            fireEvent.change(screen.getByLabelText('Namespace description'), { target: { value: 'desc' } });
            fireEvent.click(screen.getByRole('button', { name: /create/i }));

            expect(await screen.findByText('my-ns')).toBeInTheDocument();
        });

        it('shows the specific server error message when creation fails', async () => {
            const svc = mockService([], 'fail');
            renderPanel(svc);
            await screen.findByLabelText('Namespace name');

            fireEvent.change(screen.getByLabelText('Namespace name'), { target: { value: 'my-ns' } });
            fireEvent.change(screen.getByLabelText('Namespace description'), { target: { value: 'desc' } });
            fireEvent.click(screen.getByRole('button', { name: /create/i }));

            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent('Namespace already exists')
            );
        });
    });

    describe('editing a namespace description', () => {
        it('saves the new description and refreshes the list', async () => {
            const svc = mockService([{ name: 'finos', description: 'old desc' }]);
            renderPanel(svc);
            await screen.findByText('finos');

            fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
            fireEvent.change(screen.getByLabelText('Description for finos'), {
                target: { value: 'new desc' },
            });
            fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

            await waitFor(() =>
                expect(svc.updateNamespace).toHaveBeenCalledWith('finos', 'new desc')
            );
            expect(svc.fetchNamespaceDetails).toHaveBeenCalledTimes(2);
        });

        it('shows the freshly-saved description, never the stale pre-edit value, once saving settles', async () => {
            const svc = mockService([{ name: 'finos', description: 'old desc' }]);
            vi.spyOn(svc, 'fetchNamespaceDetails')
                .mockResolvedValueOnce([{ name: 'finos', description: 'old desc' }])
                .mockResolvedValueOnce([{ name: 'finos', description: 'new desc' }]);

            renderPanel(svc);
            await screen.findByText('finos');

            fireEvent.click(screen.getByRole('button', { name: /edit description for finos/i }));
            fireEvent.change(screen.getByLabelText('Description for finos'), {
                target: { value: 'new desc' },
            });
            fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

            // handleSaveDescription awaits the refetch before NamespaceRow exits edit mode,
            // so by the time editing mode is gone, the row must already show the fresh value.
            await waitFor(() =>
                expect(screen.queryByLabelText('Description for finos')).not.toBeInTheDocument()
            );
            expect(screen.getByText('new desc')).toBeInTheDocument();
            expect(screen.queryByText('old desc')).not.toBeInTheDocument();
        });
    });

    describe('deleting a namespace', () => {
        it('opens a confirmation dialog when Delete is clicked', async () => {
            const svc = mockService([{ name: 'finos', description: 'desc' }]);
            renderPanel(svc);
            await screen.findByText('finos');

            fireEvent.click(screen.getByRole('button', { name: /delete namespace finos/i }));

            expect(within(screen.getByRole('dialog')).getByText(/finos/)).toBeInTheDocument();
        });

        it('calls deleteNamespace and refreshes the list on confirm', async () => {
            const svc = mockService([{ name: 'finos', description: 'desc' }]);
            renderPanel(svc);
            await screen.findByText('finos');

            fireEvent.click(screen.getByRole('button', { name: /delete namespace finos/i }));
            fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }));

            await waitFor(() => expect(svc.deleteNamespace).toHaveBeenCalledWith('finos'));
        });

        it('closes the dialog on Cancel without deleting', async () => {
            const svc = mockService([{ name: 'finos', description: 'desc' }]);
            renderPanel(svc);
            await screen.findByText('finos');

            fireEvent.click(screen.getByRole('button', { name: /delete namespace finos/i }));
            fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(svc.deleteNamespace).not.toHaveBeenCalled();
        });

        it('shows a server error and keeps the dialog open when delete fails', async () => {
            const svc = mockService([{ name: 'finos', description: 'desc' }]);
            vi.spyOn(svc, 'deleteNamespace').mockRejectedValue(
                new Error('Namespace finos contains resources and cannot be deleted')
            );
            renderPanel(svc);
            await screen.findByText('finos');

            fireEvent.click(screen.getByRole('button', { name: /delete namespace finos/i }));
            fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }));

            await waitFor(() =>
                expect(within(screen.getByRole('dialog')).getByRole('alert'))
                    .toHaveTextContent('contains resources')
            );
        });
    });

    describe('headings', () => {
        it('renders the Namespaces page heading', () => {
            const svc = mockService([]);
            renderPanel(svc);
            expect(screen.getByRole('heading', { name: /namespaces/i, level: 1 })).toBeInTheDocument();
        });

        it('renders the Create Namespace section heading', () => {
            const svc = mockService([]);
            renderPanel(svc);
            expect(screen.getByRole('heading', { name: /create namespace/i })).toBeInTheDocument();
        });

        it('renders the Existing Namespaces section heading', () => {
            const svc = mockService([]);
            renderPanel(svc);
            expect(screen.getByRole('heading', { name: /existing namespaces/i })).toBeInTheDocument();
        });
    });
});
