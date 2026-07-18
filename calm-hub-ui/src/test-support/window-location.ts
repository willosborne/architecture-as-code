/**
 * Test helper for overriding window.location.hostname (used by
 * resolveDetailedArchitecture's same-hostname matching). jsdom's location is
 * read-only, so the whole object is replaced with a spread copy.
 *
 * Framework-free and test-runner-agnostic. Always pair setHostname with
 * restoreLocation in afterEach (it is a no-op when nothing was overridden), so
 * a failing assertion cannot leak the override into the tests that follow.
 */

let originalLocation: Location | undefined;

export function setHostname(hostname: string): void {
    // Capture the real location once, so repeated overrides in one test still
    // restore to the genuine original.
    originalLocation ??= window.location;
    Object.defineProperty(window, 'location', {
        value: { ...originalLocation, hostname },
        writable: true,
    });
}

export function restoreLocation(): void {
    if (!originalLocation) return;
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    originalLocation = undefined;
}
