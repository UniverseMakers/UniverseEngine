const STORAGE_KEY_PREFIX = 'universe-engine-gallery-progress:';

interface GalleryProgressRecord {
  completedRunIds: string[];
}

export function getCompletedGalleryRunIds(simulationId: string): string[] {
  return loadRecord(simulationId).completedRunIds;
}

export function markGalleryRunCompleted(simulationId: string, runId: string): string[] {
  const completed = new Set(loadRecord(simulationId).completedRunIds);

  completed.add(runId);
  const completedRunIds = [...completed].sort();

  try {
    localStorage.setItem(
      getStorageKey(simulationId),
      JSON.stringify({ completedRunIds } satisfies GalleryProgressRecord),
    );
  } catch {
    // Storage blocked or full (private window, kiosk lockdown): progress just isn't saved.
  }

  return completedRunIds;
}

function loadRecord(simulationId: string): GalleryProgressRecord {
  try {
    const raw = localStorage.getItem(getStorageKey(simulationId));
    const parsed = raw ? (JSON.parse(raw) as Partial<GalleryProgressRecord>) : {};

    return {
      completedRunIds: Array.isArray(parsed.completedRunIds)
        ? parsed.completedRunIds.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : [],
    };
  } catch {
    return { completedRunIds: [] };
  }
}

function getStorageKey(simulationId: string): string {
  return `${STORAGE_KEY_PREFIX}${simulationId}`;
}
