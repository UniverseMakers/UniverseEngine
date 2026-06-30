import { TRACKING_API_URL } from './constants.ts';
import { logInfo, logWarn } from './logger.ts';

interface TrackRunPayload {
  simulationId: string;
  parameters: Record<string, number>;
  manifestSource: string;
  matchedRunId?: string;
  assetHostMode: 'local' | 'primary' | 'backup';
  assetHostBase: string | null;
}

export function trackRunSelection(payload: TrackRunPayload): void {
  if (!TRACKING_API_URL) {
    return;
  }

  sendTrackingRequest(TRACKING_API_URL, payload);
}

function sendTrackingRequest(url: string, payload: TrackRunPayload): void {
  const body = JSON.stringify(payload);

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  })
    .then((response) => {
      if (response.ok) {
        logInfo('Run selection tracked', { simulationId: payload.simulationId });
      } else {
        logWarn('Run selection tracking rejected', {
          simulationId: payload.simulationId,
          status: response.status,
        });
      }
    })
    .catch((error) => {
      logWarn('Run selection tracking failed, falling back to sendBeacon', {
        simulationId: payload.simulationId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'text/plain' });
        navigator.sendBeacon(url, blob);
      }
    });
}
