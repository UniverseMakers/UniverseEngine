export type ManifestSource = 'local' | 'online';

export interface AdvancedSettings {
  lockedScaleId: string | null;
  manifestSource: ManifestSource;
  verboseLogging: boolean;
  hiddenScaleIds: string[];
}

const STORAGE_KEY = 'universe-engine-advanced-settings';

export const ADVANCED_SETTINGS_PASSWORD = 'RSSSE26UM_Engine';

export function getDefaultAdvancedSettings(): AdvancedSettings {
  return {
    lockedScaleId: null,
    manifestSource: 'online',
    verboseLogging: false,
    hiddenScaleIds: [],
  };
}

export function loadAdvancedSettings(scaleIds: string[]): AdvancedSettings {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return getDefaultAdvancedSettings();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AdvancedSettings>;

    return normalizeAdvancedSettings(parsed, scaleIds);
  } catch {
    return getDefaultAdvancedSettings();
  }
}

export function saveAdvancedSettings(
  settings: Partial<AdvancedSettings>,
  scaleIds: string[],
): AdvancedSettings {
  const normalized = normalizeAdvancedSettings(settings, scaleIds);

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      lockedScaleId: normalized.lockedScaleId,
      manifestSource: normalized.manifestSource,
      verboseLogging: normalized.verboseLogging,
      hiddenScaleIds: normalized.hiddenScaleIds,
    }),
  );

  return normalized;
}

export function normalizeAdvancedSettings(
  settings: Partial<AdvancedSettings>,
  scaleIds: string[],
): AdvancedSettings {
  const defaults = getDefaultAdvancedSettings();
  const validScaleIds = new Set(scaleIds);
  const manifestSource =
    settings.manifestSource === 'online' || settings.manifestSource === 'local'
      ? settings.manifestSource
      : defaults.manifestSource;
  const lockedScaleId =
    typeof settings.lockedScaleId === 'string' && validScaleIds.has(settings.lockedScaleId)
      ? settings.lockedScaleId
      : null;
  const hiddenScaleIds = Array.isArray(settings.hiddenScaleIds)
    ? settings.hiddenScaleIds.filter(
        (scaleId, index, list): scaleId is string =>
          typeof scaleId === 'string' &&
          validScaleIds.has(scaleId) &&
          list.indexOf(scaleId) === index &&
          scaleId !== lockedScaleId,
      )
    : defaults.hiddenScaleIds;

  if (!lockedScaleId && hiddenScaleIds.length >= scaleIds.length && scaleIds.length > 0) {
    hiddenScaleIds.pop();
  }

  return {
    lockedScaleId,
    manifestSource,
    verboseLogging: Boolean(settings.verboseLogging),
    hiddenScaleIds,
  };
}

export function getVisibleScaleIds(
  settings: AdvancedSettings,
  scaleIds: string[],
): string[] {
  if (settings.lockedScaleId) {
    return [settings.lockedScaleId];
  }

  const hidden = new Set(settings.hiddenScaleIds);
  const visible = scaleIds.filter((scaleId) => !hidden.has(scaleId));

  return visible.length > 0 ? visible : scaleIds.slice(0, 1);
}
