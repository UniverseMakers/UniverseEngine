import { loadAdvancedSettings } from './advanced-settings.ts';

const LOG_PREFIX = '[UniverseEngine]';
const DEFAULT_SCALE_IDS = ['planetary', 'galaxy', 'cosmos'];

export function isVerboseLoggingEnabled(): boolean {
  return loadAdvancedSettings(DEFAULT_SCALE_IDS).verboseLogging;
}

export function logInfo(message: string, payload?: unknown): void {
  if (!isVerboseLoggingEnabled()) {
    return;
  }

  console.info(LOG_PREFIX, message, payload ?? '');
}

export function logWarn(message: string, payload?: unknown): void {
  if (!isVerboseLoggingEnabled()) {
    return;
  }

  console.warn(LOG_PREFIX, message, payload ?? '');
}

export function logError(message: string, payload?: unknown): void {
  console.error(LOG_PREFIX, message, payload ?? '');
}
