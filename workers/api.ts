interface RunSelectionPayload {
  simulationId: string;
  parameters: Record<string, number>;
  manifestSource: string;
  matchedRunId?: string;
}

const VALID_SIMULATION_IDS = new Set(['planetary', 'galaxy', 'cosmos']);
const VALID_MANIFEST_SOURCES = new Set(['local', 'online']);
const MAX_PARAMETER_COUNT = 16;

function isValidPayload(body: unknown): body is RunSelectionPayload {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const p = body as Record<string, unknown>;

  if (typeof p.simulationId !== 'string' || !VALID_SIMULATION_IDS.has(p.simulationId)) {
    return false;
  }

  if (
    typeof p.parameters !== 'object' ||
    p.parameters === null ||
    Object.keys(p.parameters as Record<string, unknown>).length > MAX_PARAMETER_COUNT
  ) {
    return false;
  }

  for (const value of Object.values(p.parameters as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return false;
    }
  }

  if (typeof p.manifestSource !== 'string' || !VALID_MANIFEST_SOURCES.has(p.manifestSource)) {
    return false;
  }

  if (p.matchedRunId !== undefined && typeof p.matchedRunId !== 'string') {
    return false;
  }

  return true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/api/track-run') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST' },
      });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (!isValidPayload(body)) {
      return new Response('Invalid payload', { status: 400 });
    }

    const { simulationId, parameters, manifestSource, matchedRunId } = body;

    try {
      await env.DB.prepare(
        'INSERT INTO run_selections (created_at, simulation_id, parameters_json, manifest_source, matched_run_id) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(
          new Date().toISOString(),
          simulationId,
          JSON.stringify(parameters),
          manifestSource,
          matchedRunId ?? null,
        )
        .run();
    } catch (error) {
      console.error('Failed to insert run selection', error);

      return new Response('Internal server error', { status: 500 });
    }

    return new Response(null, { status: 204 });
  },
};

interface Env {
  DB: D1Database;
}
