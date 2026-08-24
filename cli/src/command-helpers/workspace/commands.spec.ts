import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupWorkspaceCommands } from './commands';

const mocks = vi.hoisted(() => {
    return {
        ensureWorkspaceBundle: vi.fn(async () => '/fake/bundle'),
        getActiveWorkspace: vi.fn<() => Promise<string | null>>(async () => 'default'),
        listWorkspaces: vi.fn(async () => ['default', 'other']),
        setActiveWorkspace: vi.fn(async () => { }),
        cleanWorkspaceBundle: vi.fn(async () => { }),
        cleanAllWorkspaces: vi.fn(async () => { }),
        getWorkspaceBundlePath: vi.fn((gitRoot: string, workspaceName: string) => `${gitRoot}/.calm-workspace/bundles/${workspaceName}`),
        addFileToBundle: vi.fn(async () => ({ id: 'test-doc', destPath: '/fake/bundle/files/test.json', rel: 'files/test.json' })),
        printBundleTree: vi.fn(async () => { }),
        createNewDocument: vi.fn(async () => '/fake/repo/com.example-architecture-my-arch.json'),
        getTemplatesForType: vi.fn(async () => ['empty']),
        pushWorkspaceToHub: vi.fn(async () => { }),
        detectChangedResources: vi.fn(async () => []),
        bumpWorkspace: vi.fn(async () => ({ bumped: [], refUpdates: [] })),
        runPostBumpValidation: vi.fn(async () => []),
        loadWorkspaceConfig: vi.fn(async () => ({
            push: { failIfModified: false },
            bump: { defaultIncrement: 'MINOR' },
            environments: {
                dev: { url: 'https://calm-dev.corp' },
                prod: { url: 'https://calm.corp', namespace: 'trading-prod' },
            },
        })),
        findWorkspaceManifestPath: vi.fn<() => string | null>(() => '/fake/bundle'),
        findGitRoot: vi.fn<() => string | null>(() => '/fake/repo'),
        loadBundleMetadata: vi.fn<() => Promise<{ environment?: string } | undefined>>(async () => ({ environment: 'dev' })),
        setBundleEnvironment: vi.fn(async () => { }),
        loadManifest: vi.fn(async () => ({})),
        removeDocumentFromManifest: vi.fn(async () => true),
        loadCliConfig: vi.fn(async () => ({ calmHubUrl: 'https://calmhub.example.com' })),
        loadAuthPlugin: vi.fn(async () => ({ getAuthHeaders: vi.fn(async () => ({})) })),
        CalmHubClient: vi.fn().mockImplementation(function() {
            return { isMockClient: true };
        }),
        select: vi.fn(async () => 'architecture'),
        input: vi.fn(async () => 'prompted-name'),
        readFile: vi.fn(async () => JSON.stringify({ title: 'My Architecture' })),
        writeFile: vi.fn(async () => { }),
        promptForDocumentId: vi.fn(async () => ({
            id: 'https://calmhub.example.com/calm/namespaces/ns/architectures/my-arch/versions/1.0.0',
            namespace: 'ns',
            slug: 'my-arch',
        })),
        isConformantDocumentId: vi.fn(() => true),
        namespaceFromDocumentId: vi.fn(() => 'ns'),
        resolveWorkspaceHub: vi.fn(async () => ({
            calmHubOptions: { calmHubUrl: 'https://calm-dev.corp' },
            environmentLabel: 'dev',
            environment: { url: 'https://calm-dev.corp' },
            bundleEnvironmentLabel: 'dev',
            bundleEnvironment: { url: 'https://calm-dev.corp' },
        })),
        loggerInfo: vi.fn(),
        loggerWarn: vi.fn(),
        loggerError: vi.fn(),
        loggerDebug: vi.fn(),
        checkEnvironmentConsistency: vi.fn<() => Promise<Array<{ id: string; documentId: string; reason: string }>>>(async () => []),
        describeInconsistency: vi.fn<(documentId: string, environment: unknown) => string | null>(() => null),
    };
});

vi.mock('./workspace', () => ({
    ensureWorkspaceBundle: mocks.ensureWorkspaceBundle,
    getActiveWorkspace: mocks.getActiveWorkspace,
    listWorkspaces: mocks.listWorkspaces,
    setActiveWorkspace: mocks.setActiveWorkspace,
    cleanWorkspaceBundle: mocks.cleanWorkspaceBundle,
    cleanAllWorkspaces: mocks.cleanAllWorkspaces,
    getWorkspaceBundlePath: mocks.getWorkspaceBundlePath,
}));

vi.mock('./bundle', () => ({
    addFileToBundle: mocks.addFileToBundle,
    printBundleTree: mocks.printBundleTree,
    loadManifest: mocks.loadManifest,
}));

vi.mock('./rm', () => ({
    removeDocumentFromManifest: mocks.removeDocumentFromManifest,
}));

vi.mock('./new', () => ({
    createNewDocument: mocks.createNewDocument,
    getTemplatesForType: mocks.getTemplatesForType,
}));

vi.mock('./push', () => ({
    pushWorkspaceToHub: mocks.pushWorkspaceToHub,
}));

vi.mock('./bump', () => ({
    detectChangedResources: mocks.detectChangedResources,
    bumpWorkspace: mocks.bumpWorkspace,
}));

vi.mock('./post-bump-validate', () => ({
    runPostBumpValidation: mocks.runPostBumpValidation,
}));

vi.mock('./config', () => ({
    loadWorkspaceConfig: mocks.loadWorkspaceConfig,
}));

vi.mock('./bundle-metadata', () => ({
    loadBundleMetadata: mocks.loadBundleMetadata,
    setBundleEnvironment: mocks.setBundleEnvironment,
}));

vi.mock('../../workspace-resolver', () => ({
    findWorkspaceManifestPath: mocks.findWorkspaceManifestPath,
    findGitRoot: mocks.findGitRoot,
}));

vi.mock('../../cli-config', () => ({
    loadCliConfig: mocks.loadCliConfig,
    loadAuthPlugin: mocks.loadAuthPlugin,
}));

vi.mock('@finos/calm-shared/src/hub/calm-hub-client', () => ({
    CalmHubClient: mocks.CalmHubClient,
}));

vi.mock('./document-id-prompt', () => ({
    promptForDocumentId: mocks.promptForDocumentId,
}));

vi.mock('@finos/calm-shared/src/hub/document-id-utils', () => ({
    isConformantDocumentId: mocks.isConformantDocumentId,
    namespaceFromDocumentId: mocks.namespaceFromDocumentId,
}));

vi.mock('./hub-resolution', () => ({ resolveWorkspaceHub: mocks.resolveWorkspaceHub }));

vi.mock('./environment-consistency', () => ({
    checkEnvironmentConsistency: mocks.checkEnvironmentConsistency,
    describeInconsistency: mocks.describeInconsistency,
}));

vi.mock('fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs/promises')>();
    return { ...actual, readFile: mocks.readFile, writeFile: mocks.writeFile };
});

vi.mock('@inquirer/prompts', () => ({
    select: mocks.select,
    input: mocks.input,
}));

vi.mock('@finos/calm-shared/src/logger', () => ({
    initLogger: () => ({
        info: mocks.loggerInfo,
        warn: mocks.loggerWarn,
        error: mocks.loggerError,
        debug: mocks.loggerDebug,
    }),
}));

describe('setupWorkspaceCommands', () => {
    let program: Command;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        program = new Command();
        program.exitOverride();
        setupWorkspaceCommands(program);
        vi.clearAllMocks();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    });

    afterEach(() => {
        exitSpy.mockRestore();
    });

    describe('workspace init', () => {
        it('should call ensureWorkspaceBundle with the given name', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws']);
            expect(mocks.ensureWorkspaceBundle).toHaveBeenCalledWith(
                expect.any(String),
                'my-ws'
            );
        });

        it('should call ensureWorkspaceBundle with custom dir', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws', '--dir', '/custom/dir']);
            expect(mocks.ensureWorkspaceBundle).toHaveBeenCalledWith(
                '/custom/dir',
                'my-ws'
            );
        });

        it('should exit on error', async () => {
            mocks.ensureWorkspaceBundle.mockRejectedValueOnce(new Error('init failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'init', 'ws'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace init --environment', () => {
        it('sets the bundle environment when the label is declared', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws', '--environment', 'prod']);
            expect(mocks.setBundleEnvironment).toHaveBeenCalledWith('/fake/bundle', 'prod');
        });

        it('does not touch bundle.json when no environment is given', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws']);
            expect(mocks.setBundleEnvironment).not.toHaveBeenCalled();
        });

        it('exits when the label is not declared', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws', '--environment', 'nope'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.setBundleEnvironment).not.toHaveBeenCalled();
        });
    });

    describe('workspace environment', () => {
        it('set records the environment on the active bundle', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'set', 'prod']);
            expect(mocks.setBundleEnvironment).toHaveBeenCalledWith('/fake/bundle', 'prod');
        });

        it('set exits for an undeclared label', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'environment', 'set', 'nope'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.setBundleEnvironment).not.toHaveBeenCalled();
        });

        it('set exits when no workspace bundle found', async () => {
            mocks.findWorkspaceManifestPath.mockReturnValueOnce(null);
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'environment', 'set', 'prod'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.setBundleEnvironment).not.toHaveBeenCalled();
        });

        it('unset clears the environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'unset']);
            expect(mocks.setBundleEnvironment).toHaveBeenCalledWith('/fake/bundle', undefined);
        });

        it('list reads the declared environments from config', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'list']);
            expect(mocks.loadWorkspaceConfig).toHaveBeenCalledWith('/fake/repo');
        });

        it('list exits when no git root found', async () => {
            mocks.findGitRoot.mockReturnValueOnce(null);
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'environment', 'list'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('list does not attribute a bundle with no environment to any label', async () => {
            // listWorkspaces (default mock) returns ['default', 'other']; 'default' has no
            // environment and must not show up in any environment's bundle list, while 'other'
            // (which does) must show up under the label it actually reports.
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ environment: 'dev' });
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'list']);

            const loggedLines = mocks.loggerInfo.mock.calls.map((call) => call[0] as string);
            const bundleLine = loggedLines.find((line) => line.includes('bundles:'));
            expect(bundleLine).toContain('other');
            expect(bundleLine).not.toContain('default');
            expect(loggedLines.some((line) => line.includes('default'))).toBe(false);
        });

        it('show resolves a named environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'show', 'prod']);
            expect(mocks.loadWorkspaceConfig).toHaveBeenCalledWith('/fake/repo');
        });

        it('show exits for an undeclared label', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'environment', 'show', 'nope'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('with no subcommand reports the active bundle environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment']);
            expect(mocks.loadBundleMetadata).toHaveBeenCalledWith('/fake/bundle');
        });

        it('with no subcommand does not fail when the bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'environment']);
            expect(exitSpy).not.toHaveBeenCalled();
        });
    });

    const CONFORMANT_ID = 'https://calmhub.example.com/calm/namespaces/ns/architectures/my-arch/versions/1.0.0';

    describe('workspace add', () => {
        it('builds a $id when the file has none, writes it back, and adds with the derived namespace', async () => {
            // readFile mock returns JSON with title 'My Architecture' and no $id.
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).toHaveBeenCalled();
            expect(mocks.writeFile).toHaveBeenCalled();
            expect(mocks.addFileToBundle).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.stringContaining('test.json'),
                expect.objectContaining({ id: 'My Architecture', type: 'architecture', namespace: 'ns' })
            );
        });

        it('leaves a conformant $id untouched and adds with the namespace derived from it', async () => {
            mocks.readFile.mockResolvedValueOnce(JSON.stringify({ $id: CONFORMANT_ID, title: 'My Architecture' }));
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).not.toHaveBeenCalled();
            expect(mocks.writeFile).not.toHaveBeenCalled();
            expect(mocks.addFileToBundle).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.stringContaining('test.json'),
                expect.objectContaining({ id: 'My Architecture', type: 'architecture', namespace: 'ns' })
            );
        });

        it('warns about a non-conformant $id but still adds the file to the bundle', async () => {
            mocks.readFile.mockResolvedValueOnce(JSON.stringify({ $id: 'not-conformant', title: 'My Architecture' }));
            mocks.isConformantDocumentId.mockReturnValueOnce(false);
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).not.toHaveBeenCalled();
            expect(mocks.writeFile).not.toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
            expect(mocks.addFileToBundle).toHaveBeenCalled();
        });

        it('warns when an existing $id belongs to another environment, but still adds the file', async () => {
            mocks.readFile.mockResolvedValueOnce(JSON.stringify({ $id: CONFORMANT_ID, title: 'My Architecture' }));
            mocks.describeInconsistency.mockReturnValueOnce('base URL is https://calmhub.example.com, expected https://calm-dev.corp');
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.describeInconsistency).toHaveBeenCalledWith(CONFORMANT_ID, { url: 'https://calm-dev.corp' });
            expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining(
                `Document $id '${CONFORMANT_ID}' does not belong to this environment: base URL is https://calmhub.example.com, expected https://calm-dev.corp`
            ));
            expect(exitSpy).not.toHaveBeenCalled();
            expect(mocks.addFileToBundle).toHaveBeenCalled();
        });

        it('does not warn about environment mismatch when the $id is consistent', async () => {
            mocks.readFile.mockResolvedValueOnce(JSON.stringify({ $id: CONFORMANT_ID, title: 'My Architecture' }));
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.loggerWarn).not.toHaveBeenCalledWith(expect.stringContaining('does not belong to this environment'));
        });

        it('does not check environment consistency when the bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined);
            mocks.readFile.mockResolvedValueOnce(JSON.stringify({ $id: CONFORMANT_ID, title: 'My Architecture' }));
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.describeInconsistency).not.toHaveBeenCalled();
            expect(mocks.loggerWarn).not.toHaveBeenCalledWith(expect.stringContaining('does not belong to this environment'));
        });

        it('should prompt for a manifest name when the file has no title field', async () => {
            mocks.readFile.mockResolvedValueOnce(JSON.stringify({ $id: CONFORMANT_ID }));
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.input).toHaveBeenCalled();
            expect(mocks.addFileToBundle).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.stringContaining('test.json'),
                expect.objectContaining({ id: 'prompted-name', type: 'architecture' })
            );
        });

        it('should use --id and --type when provided, skipping prompts', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json', '--id', 'custom-id', '--type', 'pattern', '--copy']);
            expect(mocks.select).not.toHaveBeenCalled();
            expect(mocks.addFileToBundle).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.stringContaining('test.json'),
                expect.objectContaining({ id: 'custom-id', copy: true, type: 'pattern' })
            );
        });

        it('should exit when no workspace bundle found', async () => {
            mocks.findWorkspaceManifestPath.mockReturnValueOnce(null);
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json', '--type', 'architecture', '--id', 'test'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit on addFileToBundle error', async () => {
            mocks.addFileToBundle.mockRejectedValueOnce(new Error('add failed'));
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json', '--type', 'architecture', '--id', 'test'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit on an invalid --type without adding to the bundle', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json', '--type', 'not-a-type', '--id', 'test'])
            ).rejects.toThrow();
            expect(mocks.addFileToBundle).not.toHaveBeenCalled();
        });
    });

    describe('workspace tree', () => {
        it('should call printBundleTree', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'tree']);
            expect(mocks.printBundleTree).toHaveBeenCalledWith('/fake/bundle');
        });

        it('should exit when no workspace bundle found', async () => {
            mocks.findWorkspaceManifestPath.mockReturnValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'tree'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit on error', async () => {
            mocks.printBundleTree.mockRejectedValueOnce(new Error('tree failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'tree'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace list', () => {
        it('should call listWorkspaces and getActiveWorkspace', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'list']);
            expect(mocks.listWorkspaces).toHaveBeenCalledWith('/fake/repo');
            expect(mocks.getActiveWorkspace).toHaveBeenCalledWith('/fake/repo');
        });

        it('should exit when no git root found', async () => {
            mocks.findGitRoot.mockReturnValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'list'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should handle empty workspace list', async () => {
            mocks.listWorkspaces.mockResolvedValueOnce([]);
            await program.parseAsync(['node', 'test', 'workspace', 'list']);
            expect(mocks.listWorkspaces).toHaveBeenCalled();
        });

        it('should exit on error', async () => {
            mocks.listWorkspaces.mockRejectedValueOnce(new Error('list failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'list'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace show', () => {
        it('should call getActiveWorkspace and load the manifest', async () => {
            mocks.loadManifest.mockResolvedValueOnce({
                'doc-a': { path: 'files/doc-a.json', type: 'architecture', namespace: 'com.example' }
            });
            await program.parseAsync(['node', 'test', 'workspace', 'show']);
            expect(mocks.getActiveWorkspace).toHaveBeenCalledWith('/fake/repo');
            expect(mocks.loadManifest).toHaveBeenCalledWith('/fake/bundle');
        });

        it('should handle no active workspace', async () => {
            mocks.getActiveWorkspace.mockResolvedValueOnce(null);
            await program.parseAsync(['node', 'test', 'workspace', 'show']);
            expect(mocks.loadManifest).not.toHaveBeenCalled();
        });

        it('should skip manifest when no bundle path is found', async () => {
            mocks.findWorkspaceManifestPath.mockReturnValueOnce(null);
            await program.parseAsync(['node', 'test', 'workspace', 'show']);
            expect(mocks.loadManifest).not.toHaveBeenCalled();
        });

        it('logs "no documents" when manifest is empty', async () => {
            mocks.loadManifest.mockResolvedValueOnce({});
            await program.parseAsync(['node', 'test', 'workspace', 'show']);
            expect(mocks.loadManifest).toHaveBeenCalled();
        });

        it('should exit when no git root found', async () => {
            mocks.findGitRoot.mockReturnValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'show'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit on error', async () => {
            mocks.getActiveWorkspace.mockRejectedValueOnce(new Error('show failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'show'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace rm', () => {
        it('removes a document by ID when provided', async () => {
            mocks.loadManifest.mockResolvedValueOnce({ 'doc-a': { path: 'files/doc-a.json', type: 'architecture' } });
            await program.parseAsync(['node', 'test', 'workspace', 'rm', 'doc-a']);
            expect(mocks.removeDocumentFromManifest).toHaveBeenCalledWith('/fake/bundle', 'doc-a');
        });

        it('prompts for ID when not provided', async () => {
            mocks.loadManifest.mockResolvedValueOnce({ 'doc-a': { path: 'files/doc-a.json', type: 'architecture' } });
            mocks.select.mockResolvedValueOnce('doc-a');
            await program.parseAsync(['node', 'test', 'workspace', 'rm']);
            expect(mocks.select).toHaveBeenCalled();
            expect(mocks.removeDocumentFromManifest).toHaveBeenCalledWith('/fake/bundle', 'doc-a');
        });

        it('does nothing when the bundle is empty', async () => {
            mocks.loadManifest.mockResolvedValueOnce({});
            await program.parseAsync(['node', 'test', 'workspace', 'rm', 'doc-a']);
            expect(mocks.removeDocumentFromManifest).not.toHaveBeenCalled();
        });

        it('exits when no workspace bundle found', async () => {
            mocks.findWorkspaceManifestPath.mockReturnValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'rm', 'doc-a'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('exits on error', async () => {
            mocks.loadManifest.mockResolvedValueOnce({ 'doc-a': { path: 'files/doc-a.json', type: 'architecture' } });
            mocks.removeDocumentFromManifest.mockRejectedValueOnce(new Error('rm failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'rm', 'doc-a'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace switch', () => {
        it('should call setActiveWorkspace', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'switch', 'other']);
            expect(mocks.setActiveWorkspace).toHaveBeenCalledWith('/fake/repo', 'other');
        });

        it('should exit when workspace not found', async () => {
            await expect(program.parseAsync(['node', 'test', 'workspace', 'switch', 'nonexistent'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit when no git root found', async () => {
            mocks.findGitRoot.mockReturnValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'switch', 'other'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit on error', async () => {
            mocks.listWorkspaces.mockRejectedValueOnce(new Error('switch failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'switch', 'other'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace clean', () => {
        it('should call cleanWorkspaceBundle for active workspace', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'clean']);
            expect(mocks.cleanWorkspaceBundle).toHaveBeenCalledWith('/fake/repo', 'default');
        });

        it('should call cleanAllWorkspaces with --all flag', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'clean', '--all']);
            expect(mocks.cleanAllWorkspaces).toHaveBeenCalledWith('/fake/repo');
        });

        it('should exit when no git root found', async () => {
            mocks.findGitRoot.mockReturnValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'clean'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit when no active workspace and no --all flag', async () => {
            mocks.getActiveWorkspace.mockResolvedValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'clean'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('should exit on error', async () => {
            mocks.cleanWorkspaceBundle.mockRejectedValueOnce(new Error('clean failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'clean'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace new', () => {
        it('builds the $id interactively and registers the document under the mapping slug', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'new', 'architecture', 'my-arch']);
            expect(mocks.promptForDocumentId).toHaveBeenCalled();
            expect(mocks.createNewDocument).toHaveBeenCalledWith(
                'https://calmhub.example.com/calm/namespaces/ns/architectures/my-arch/versions/1.0.0',
                'my-arch',
                'architecture',
                'my-arch',
                'empty'
            );
            expect(mocks.addFileToBundle).toHaveBeenCalledWith(
                '/fake/bundle',
                '/fake/repo/com.example-architecture-my-arch.json',
                { id: 'my-arch', type: 'architecture', namespace: 'ns' }
            );
        });

        it('exits when no workspace bundle is found, before prompting', async () => {
            mocks.findWorkspaceManifestPath.mockReturnValueOnce(null);
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'new', 'architecture', 'my-arch'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.promptForDocumentId).not.toHaveBeenCalled();
        });

        it('exits on createNewDocument error', async () => {
            mocks.createNewDocument.mockRejectedValueOnce(new Error('create failed'));
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'new', 'architecture', 'my-arch'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace push', () => {
        it('calls pushWorkspaceToHub with a CalmHubClient instance', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            // calmHubOptions is whatever resolveWorkspaceHub resolves (mocked); see
            // hub-resolution.spec.ts for the actual --calm-hub-url / environment precedence logic.
            expect(mocks.CalmHubClient).toHaveBeenCalledWith({
                calmHubUrl: 'https://calm-dev.corp',
            });
            expect(mocks.pushWorkspaceToHub).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                { failIfModified: false }
            );
        });

        it('passes failIfModified: true from --fail-if-modified', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'push', '--fail-if-modified']);
            expect(mocks.pushWorkspaceToHub).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                { failIfModified: true }
            );
        });

        it('passes failIfModified from the central workspace config', async () => {
            mocks.loadWorkspaceConfig.mockResolvedValueOnce({ push: { failIfModified: true }, bump: { defaultIncrement: 'MINOR' } } as never);
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.pushWorkspaceToHub).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                { failIfModified: true }
            );
        });

        it('passes failIfModified: false when no git root / config is found', async () => {
            mocks.findGitRoot.mockReturnValueOnce(null);
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.pushWorkspaceToHub).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                { failIfModified: false }
            );
        });

        it('passes --calm-hub-url through to resolveWorkspaceHub', async () => {
            // The actual --calm-hub-url-over-config precedence is resolveWorkspaceHub's job
            // (see hub-resolution.spec.ts); here we only prove push forwards the flag.
            await program.parseAsync(['node', 'test', 'workspace', 'push', '--calm-hub-url', 'https://override.example.com']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalledWith(
                expect.objectContaining({ calmHubUrl: 'https://override.example.com' })
            );
        });

        it('passes the calmHubOptions resolveWorkspaceHub resolves straight through to the CalmHubClient, auth plugin included', async () => {
            const authPlugin = { getAuthHeaders: vi.fn(async () => ({})) };
            mocks.resolveWorkspaceHub.mockResolvedValueOnce({
                calmHubOptions: { calmHubUrl: 'https://calmhub.example.com', authPlugin },
            });
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.CalmHubClient).toHaveBeenCalledWith(expect.objectContaining({
                calmHubUrl: 'https://calmhub.example.com',
                authPlugin,
            }));
        });

        it('exits when no workspace bundle is found', async () => {
            mocks.findWorkspaceManifestPath.mockReturnValueOnce(null);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'push'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('exits when hub resolution fails because no CalmHub URL is configured', async () => {
            mocks.resolveWorkspaceHub.mockRejectedValueOnce(new Error('No CalmHub URL configured'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'push'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('exits on pushWorkspaceToHub error', async () => {
            mocks.pushWorkspaceToHub.mockRejectedValueOnce(new Error('push failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'push'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('workspace check', () => {
        it('reports up to date and does not exit when nothing changed', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce([]);
            await program.parseAsync(['node', 'test', 'workspace', 'check']);
            expect(mocks.detectChangedResources).toHaveBeenCalledWith('/fake/bundle', expect.objectContaining({ isMockClient: true }));
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('passes the calmHubOptions resolveWorkspaceHub resolves straight through to the CalmHubClient, auth plugin included', async () => {
            const authPlugin = { getAuthHeaders: vi.fn(async () => ({})) };
            mocks.resolveWorkspaceHub.mockResolvedValueOnce({
                calmHubOptions: { calmHubUrl: 'https://calmhub.example.com', authPlugin },
            });
            mocks.detectChangedResources.mockResolvedValueOnce([]);
            await program.parseAsync(['node', 'test', 'workspace', 'check']);
            expect(mocks.CalmHubClient).toHaveBeenCalledWith(expect.objectContaining({
                calmHubUrl: 'https://calmhub.example.com',
                authPlugin,
            }));
        });

        it('exits 1 when changed documents need bumping', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/x', metadata: {}, currentVersion: '1.0.0', latestHubVersion: '1.0.0' },
            ] as never);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'check'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('exits on detectChangedResources error', async () => {
            mocks.detectChangedResources.mockRejectedValueOnce(new Error('boom'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'check'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('runs post-bump validation and reports all passed when workspace is up to date', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce([]);
            mocks.runPostBumpValidation.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/a.json', type: 'architecture', passed: true, errorCount: 0 },
            ] as never);
            await program.parseAsync(['node', 'test', 'workspace', 'check']);
            expect(mocks.runPostBumpValidation).toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('exits 1 when validation fails even if no documents need bumping', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce([]);
            mocks.runPostBumpValidation.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/a.json', type: 'architecture', passed: false, errorCount: 2 },
            ] as never);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'check'])).rejects.toThrow();
            expect(mocks.runPostBumpValidation).toHaveBeenCalled();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('exits 1 when both bump and validation failures are present', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/x', metadata: {}, currentVersion: '1.0.0', latestHubVersion: '1.0.0' },
            ] as never);
            mocks.runPostBumpValidation.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/a.json', type: 'architecture', passed: false, errorCount: 2 },
            ] as never);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'check'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('exits 1 and reports "(could not validate)" when errorCount is -1', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce([]);
            mocks.runPostBumpValidation.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/a.json', type: 'pattern', passed: false, errorCount: -1 },
            ] as never);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'check'])).rejects.toThrow();
            expect(mocks.runPostBumpValidation).toHaveBeenCalled();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('environment consistency', () => {
        const finding = { id: 'gateway', documentId: 'https://dev/x', reason: 'base URL is https://dev, expected https://prod' };

        it('push warns but still pushes when a document belongs elsewhere', async () => {
            mocks.checkEnvironmentConsistency.mockResolvedValueOnce([finding]);
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.pushWorkspaceToHub).toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('check fails when a document belongs elsewhere', async () => {
            mocks.checkEnvironmentConsistency.mockResolvedValueOnce([finding]);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'check'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('does not check consistency when the bundle has no environment', async () => {
            mocks.resolveWorkspaceHub.mockResolvedValueOnce({
                calmHubOptions: { calmHubUrl: 'https://from-user-config' },
                environmentLabel: undefined,
                environment: undefined,
            });
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.checkEnvironmentConsistency).not.toHaveBeenCalled();
        });
    });

    describe('workspace bump', () => {
        // Minimal ChangedResource for tests that need detectChangedResources to return something.
        const fakeChanged = [{ id: 'test-doc', currentVersion: '1.0.0', latestHubVersion: '1.0.0', filePath: '/fake/path.json', metadata: {} }];

        it('prompts for bump type per document and passes perDocIncrements to bumpWorkspace', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.bumpWorkspace).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                expect.objectContaining({ increment: 'MINOR', perDocIncrements: expect.any(Map) })
            );
        });

        it('passes the calmHubOptions resolveWorkspaceHub resolves straight through to the CalmHubClient, auth plugin included', async () => {
            const authPlugin = { getAuthHeaders: vi.fn(async () => ({})) };
            mocks.resolveWorkspaceHub.mockResolvedValueOnce({
                calmHubOptions: { calmHubUrl: 'https://calmhub.example.com', authPlugin },
            });
            mocks.detectChangedResources.mockResolvedValueOnce([]);
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.CalmHubClient).toHaveBeenCalledWith(expect.objectContaining({
                calmHubUrl: 'https://calmhub.example.com',
                authPlugin,
            }));
        });

        it('uses the config default increment as the select default', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.select).toHaveBeenCalledWith(
                expect.objectContaining({ default: 'MINOR' })
            );
        });

        it('--major skips prompts and applies MAJOR to all docs', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            await program.parseAsync(['node', 'test', 'workspace', 'bump', '--major']);
            expect(mocks.select).not.toHaveBeenCalled();
            expect(mocks.bumpWorkspace).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                expect.objectContaining({ increment: 'MAJOR' })
            );
        });

        it('defaults to MINOR when no git root / config is found', async () => {
            mocks.findGitRoot.mockReturnValueOnce(null);
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.bumpWorkspace).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                expect.objectContaining({ increment: 'MINOR' })
            );
        });

        it('logs a summary of bumped documents and reference updates', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            mocks.bumpWorkspace.mockResolvedValueOnce({
                bumped: [{ id: 'doc-a', filePath: '/x', fromVersion: '1.0.0', toVersion: '1.1.0', increment: 'MINOR' }],
                refUpdates: [{ docId: 'doc-b', filePath: '/y', changeCount: 2 }],
            } as never);
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.bumpWorkspace).toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('--patch skips prompts and applies PATCH to all docs', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            await program.parseAsync(['node', 'test', 'workspace', 'bump', '--patch']);
            expect(mocks.select).not.toHaveBeenCalled();
            expect(mocks.bumpWorkspace).toHaveBeenCalledWith(
                '/fake/bundle',
                expect.objectContaining({ isMockClient: true }),
                expect.objectContaining({ increment: 'PATCH' })
            );
        });

        it('exits when --major and --patch are combined', async () => {
            await expect(program.parseAsync(['node', 'test', 'workspace', 'bump', '--major', '--patch'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('logs "no documents" and skips prompts when nothing changed', async () => {
            // detectChangedResources returns [] by default after vi.clearAllMocks
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.select).not.toHaveBeenCalled();
            expect(mocks.bumpWorkspace).not.toHaveBeenCalled();
        });

        it('exits on bumpWorkspace error', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            mocks.bumpWorkspace.mockRejectedValueOnce(new Error('bump failed'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'bump'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('runs post-bump validation and completes without error when all documents pass', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            mocks.runPostBumpValidation.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/a.json', type: 'architecture', passed: true, errorCount: 0 },
            ] as never);
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.runPostBumpValidation).toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('runs post-bump validation and completes without error when a document fails with errors', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            mocks.runPostBumpValidation.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/a.json', type: 'architecture', passed: false, errorCount: 3 },
            ] as never);
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.runPostBumpValidation).toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('runs post-bump validation and completes without error when a document could not be validated', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            mocks.runPostBumpValidation.mockResolvedValueOnce([
                { id: 'doc-a', filePath: '/a.json', type: 'pattern', passed: false, errorCount: -1 },
            ] as never);
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.runPostBumpValidation).toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('--inherit-change-type does not pass a getCascadeIncrement callback to bumpWorkspace', async () => {
            mocks.detectChangedResources.mockResolvedValueOnce(fakeChanged as never);
            mocks.select.mockResolvedValueOnce('MINOR');
            await program.parseAsync(['node', 'test', 'workspace', 'bump', '--inherit-change-type']);
            expect(mocks.bumpWorkspace).toHaveBeenCalled();
            const callOptions = (mocks.bumpWorkspace.mock.calls[0] as unknown[])[2] as { getCascadeIncrement?: unknown };
            expect(callOptions.getCascadeIncrement).toBeUndefined();
        });
    });

    describe('environment-aware hub resolution', () => {
        it('push resolves its hub through resolveWorkspaceHub', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalledWith(
                expect.objectContaining({ bundlePath: '/fake/bundle', gitRoot: '/fake/repo' })
            );
        });

        it('push passes --expect-environment through', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'push', '--expect-environment', 'prod']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalledWith(
                expect.objectContaining({ expectEnvironment: 'prod' })
            );
        });

        it('push exits when hub resolution fails', async () => {
            mocks.resolveWorkspaceHub.mockRejectedValueOnce(new Error('conflicts with environment'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'push'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.pushWorkspaceToHub).not.toHaveBeenCalled();
        });

        it('push rejects --environment with a pointer to the right command', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'push', '--environment', 'prod'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.pushWorkspaceToHub).not.toHaveBeenCalled();
            expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining(
                '`calm workspace push` does not accept --environment: it acts on the bundle\'s own environment. ' +
                'Change it with `calm workspace environment set <label>`.'
            ));
            expect(mocks.loggerError).not.toHaveBeenCalledWith(expect.stringContaining('migrate'));
        });

        it('check passes --environment through as an override', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'check', '--environment', 'prod']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalledWith(
                expect.objectContaining({ environmentOverride: 'prod' })
            );
        });

        it('check --environment checks consistency against the bundle\'s own environment, not the override, and does not exit 1 when consistent', async () => {
            mocks.resolveWorkspaceHub.mockResolvedValueOnce({
                calmHubOptions: { calmHubUrl: 'https://calm.corp' },
                environmentLabel: 'prod',
                environment: { url: 'https://calm.corp', namespace: 'trading-prod' },
                bundleEnvironmentLabel: 'dev',
                bundleEnvironment: { url: 'https://calm-dev.corp' },
            });
            mocks.checkEnvironmentConsistency.mockResolvedValueOnce([]);
            mocks.detectChangedResources.mockResolvedValueOnce([]);
            await program.parseAsync(['node', 'test', 'workspace', 'check', '--environment', 'prod']);
            expect(mocks.checkEnvironmentConsistency).toHaveBeenCalledWith('/fake/bundle', { url: 'https://calm-dev.corp' });
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('bump resolves its hub through resolveWorkspaceHub', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalled();
        });

        it('bump rejects --environment with a pointer to the right command', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'bump', '--environment', 'prod'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining(
                '`calm workspace bump` does not accept --environment: it acts on the bundle\'s own environment. ' +
                'Change it with `calm workspace environment set <label>`.'
            ));
            expect(mocks.loggerError).not.toHaveBeenCalledWith(expect.stringContaining('migrate'));
            expect(mocks.bumpWorkspace).not.toHaveBeenCalled();
        });
    });

    describe('environment-aware $id defaults', () => {
        it('add defaults the base URL and namespace from the bundle environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce({ environment: 'prod' });
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrlDefault: 'https://calm.corp',
                    namespaceDefault: 'trading-prod',
                })
            );
        });

        it('add falls back to the CLI config base URL when the bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.objectContaining({ baseUrlDefault: 'https://calmhub.example.com' })
            );
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.not.objectContaining({ namespaceDefault: expect.anything() })
            );
        });

        it('new defaults the base URL and namespace from the bundle environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce({ environment: 'prod' });
            await program.parseAsync(['node', 'test', 'workspace', 'new', 'architecture', 'My Arch', 'empty']);
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrlDefault: 'https://calm.corp',
                    namespaceDefault: 'trading-prod',
                })
            );
        });

        it('add warns and falls back to the CLI config base URL when the bundle has an environment but no git root', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce({ environment: 'prod' });
            mocks.findGitRoot.mockReturnValueOnce(null);
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.objectContaining({ baseUrlDefault: 'https://calmhub.example.com' })
            );
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.not.objectContaining({ namespaceDefault: expect.anything() })
            );
            expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('environment \'prod\''));
        });
    });

    describe('environment annotations', () => {
        it('list reads each bundle\'s environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'list']);
            expect(mocks.loadBundleMetadata).toHaveBeenCalledTimes(2); // 'default' and 'other'
        });

        it('list still works when a bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'list']);
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('show reads the active bundle\'s environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'show']);
            expect(mocks.loadBundleMetadata).toHaveBeenCalledWith('/fake/bundle');
        });

        it('show reports no environment when the active bundle has none', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'show']);
            expect(mocks.loggerInfo).toHaveBeenCalledWith('Environment: none');
        });

        it('switch reads the target bundle\'s environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'switch', 'other']);
            expect(mocks.setActiveWorkspace).toHaveBeenCalledWith('/fake/repo', 'other');
            expect(mocks.loadBundleMetadata).toHaveBeenCalled();
        });

        it('switch announces without a suffix when the target bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'switch', 'other']);
            expect(mocks.loggerInfo).toHaveBeenCalledWith('Switched to workspace \'other\'.');
        });
    });

});
