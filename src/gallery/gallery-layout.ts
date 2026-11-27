import type { GalleryManifestRun } from '../selection/placeholder-assets.ts';
import type { SimParameter } from '../selection/simulation-catalog.ts';

export interface GalleryHexCoordinate {
  q: number;
  r: number;
}

export function sortGalleryRuns(
  runs: GalleryManifestRun[],
  parameters: SimParameter[],
): GalleryManifestRun[] {
  const orderedParameters = [
    ...parameters.filter((parameter) => parameter.primary !== false),
    ...parameters.filter((parameter) => parameter.primary === false),
  ];

  return [...runs].sort((left, right) => {
    for (const parameter of orderedParameters) {
      const difference =
        (left.parameters[parameter.id] ?? Number.POSITIVE_INFINITY) -
        (right.parameters[parameter.id] ?? Number.POSITIVE_INFINITY);

      if (difference !== 0) {
        return difference;
      }
    }

    return left.runId.localeCompare(right.runId);
  });
}

export function createBalancedHexCoordinates(count: number): GalleryHexCoordinate[] {
  if (count <= 0) {
    return [];
  }

  const coordinates: GalleryHexCoordinate[] = [{ q: 0, r: 0 }];

  for (let radius = 1; coordinates.length < count; radius += 1) {
    const ring = createRing(radius);
    const remaining = count - coordinates.length;

    if (remaining >= ring.length) {
      coordinates.push(...ring);
    } else {
      coordinates.push(
        ...createBalancedRingIndices(ring.length)
          .slice(0, remaining)
          .map((index) => ring[index]),
      );
    }
  }

  return coordinates;
}

function createRing(radius: number): GalleryHexCoordinate[] {
  const directions: GalleryHexCoordinate[] = [
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
  ];
  const ring: GalleryHexCoordinate[] = [];
  let coordinate = { q: 0, r: -radius };

  for (const direction of directions) {
    for (let step = 0; step < radius; step += 1) {
      ring.push(coordinate);
      coordinate = {
        q: coordinate.q + direction.q,
        r: coordinate.r + direction.r,
      };
    }
  }

  return ring;
}

function createBalancedRingIndices(size: number): number[] {
  if (size <= 0) {
    return [];
  }

  const order = [0];
  const segments = [{ start: 0, steps: size }];

  while (segments.length > 0 && order.length < size) {
    segments.sort(
      (left, right) => right.steps - left.steps || left.start - right.start,
    );
    const segment = segments.shift();

    if (!segment || segment.steps <= 1) {
      continue;
    }

    const leftSteps = Math.floor(segment.steps / 2);
    const rightSteps = segment.steps - leftSteps;
    const midpoint = (segment.start + leftSteps) % size;

    order.push(midpoint);
    if (leftSteps > 1) {
      segments.push({ start: segment.start, steps: leftSteps });
    }

    if (rightSteps > 1) {
      segments.push({ start: midpoint, steps: rightSteps });
    }
  }

  return order;
}
