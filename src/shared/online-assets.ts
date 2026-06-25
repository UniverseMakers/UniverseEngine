import type { ManifestSource } from './advanced-settings.ts';

export type AssetHostMode = 'local' | 'primary' | 'backup';

interface OnlineAssetHosts {
  primaryBase: string;
  backupBase: string | null;
}

let onlineAssetHosts: OnlineAssetHosts | null = null;
let preferredOnlineHostMode: 'primary' | 'backup' = 'primary';

export function configureOnlineAssetHosts(
  primaryBase: string,
  backupBase: string | null = null,
): void {
  onlineAssetHosts = {
    primaryBase: primaryBase.replace(/\/+$/, ''),
    backupBase: backupBase ? backupBase.replace(/\/+$/, '') : null,
  };
}

export function clearOnlineAssetHosts(): void {
  onlineAssetHosts = null;
  preferredOnlineHostMode = 'primary';
}

export function resetOnlineAssetHostPreference(): void {
  preferredOnlineHostMode = 'primary';
}

export function setPreferredOnlineAssetHostMode(
  mode: 'primary' | 'backup',
): void {
  preferredOnlineHostMode = mode;
}

export function getAssetHostInfo(
  manifestSource: ManifestSource,
): { mode: AssetHostMode; base: string | null } {
  if (manifestSource === 'local') {
    return { mode: 'local', base: null };
  }

  if (!onlineAssetHosts) {
    return { mode: 'primary', base: null };
  }

  return {
    mode: preferredOnlineHostMode,
    base: getPreferredOnlineBase(),
  };
}

export function resolveOnlineAssetUrl(pathOrUrl: string): string {
  if (!onlineAssetHosts) {
    return pathOrUrl;
  }

  const preferredBase = getPreferredOnlineBase();

  if (!preferredBase) {
    return pathOrUrl;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);

    if (!matchesConfiguredBase(url, onlineAssetHosts.primaryBase)) {
      if (!onlineAssetHosts.backupBase || !matchesConfiguredBase(url, onlineAssetHosts.backupBase)) {
        return pathOrUrl;
      }
    }

    return joinBaseAndPath(preferredBase, `${url.pathname}${url.search}${url.hash}`);
  }

  return joinBaseAndPath(preferredBase, pathOrUrl);
}

export async function fetchWithOnlineAssetFallback(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const primaryAttemptUrl = resolveOnlineAssetUrl(input);
  const canRetryWithBackup =
    Boolean(onlineAssetHosts?.backupBase) && preferredOnlineHostMode === 'primary';

  try {
    const response = await fetch(primaryAttemptUrl, init);

    if (response.ok || !canRetryWithBackup) {
      return response;
    }

    const retryResponse = await retryWithBackup(input, init);

    if (retryResponse.ok) {
      preferredOnlineHostMode = 'backup';
    }

    return retryResponse;
  } catch (error) {
    if (!canRetryWithBackup) {
      throw error;
    }

    const retryResponse = await retryWithBackup(input, init);

    if (retryResponse.ok) {
      preferredOnlineHostMode = 'backup';

      return retryResponse;
    }

    return retryResponse;
  }
}

function getPreferredOnlineBase(): string | null {
  if (!onlineAssetHosts) {
    return null;
  }

  if (preferredOnlineHostMode === 'backup' && onlineAssetHosts.backupBase) {
    return onlineAssetHosts.backupBase;
  }

  return onlineAssetHosts.primaryBase;
}

async function retryWithBackup(input: string, init?: RequestInit): Promise<Response> {
  if (!onlineAssetHosts?.backupBase) {
    throw new Error('Backup asset host is not configured.');
  }

  const previousMode = preferredOnlineHostMode;

  preferredOnlineHostMode = 'backup';

  try {
    const response = await fetch(resolveOnlineAssetUrl(input), init);

    if (!response.ok) {
      preferredOnlineHostMode = previousMode;
    }

    return response;
  } catch (error) {
    preferredOnlineHostMode = previousMode;
    throw error;
  }
}

function matchesConfiguredBase(url: URL, configuredBase: string): boolean {
  const configuredUrl = new URL(configuredBase);

  return url.origin === configuredUrl.origin;
}

function joinBaseAndPath(base: string, path: string): string {
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
