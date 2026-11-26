import type { GalleryManifestRun } from '../selection/placeholder-assets.ts';
import type { SimulationClass } from '../selection/simulation-catalog.ts';
import { createBalancedHexCoordinates, sortGalleryRuns } from './gallery-layout.ts';

const HEX_WIDTH = 208;
const HEX_HEIGHT = 180;
const STAGE_MARGIN = 180;

export interface GalleryNode {
  runId: string;
  thumbnailUrl: string | null;
  thumbnailFallbackUrl: string | null;
  placeholderUrl: string;
  revealOrder: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GalleryScene {
  nodes: GalleryNode[];
  stageWidth: number;
  stageHeight: number;
}

export function buildGalleryScene(
  simClass: SimulationClass,
  runs: GalleryManifestRun[],
): GalleryScene {
  const sortedRuns = sortGalleryRuns(runs, simClass.parameters);
  const coordinates = createBalancedHexCoordinates(sortedRuns.length);

  if (sortedRuns.length === 0) {
    return {
      nodes: [],
      stageWidth: HEX_WIDTH + STAGE_MARGIN * 2,
      stageHeight: HEX_HEIGHT + STAGE_MARGIN * 2,
    };
  }

  const positions = coordinates.map(({ q, r }) => ({
    x: q * HEX_WIDTH * 0.75,
    y: (r + q * 0.5) * HEX_HEIGHT,
  }));
  const minX = Math.min(...positions.map(({ x }) => x));
  const minY = Math.min(...positions.map(({ y }) => y));
  const nodes = sortedRuns.map((run, index) => ({
    runId: run.runId,
    thumbnailUrl: run.thumbnailUrl,
    thumbnailFallbackUrl: run.thumbnailFallbackUrl,
    placeholderUrl: simClass.placeholderImage,
    revealOrder: index,
    x: positions[index].x - minX + STAGE_MARGIN,
    y: positions[index].y - minY + STAGE_MARGIN,
    width: HEX_WIDTH,
    height: HEX_HEIGHT,
  }));

  return {
    nodes,
    stageWidth: Math.max(...nodes.map((node) => node.x + node.width)) + STAGE_MARGIN,
    stageHeight: Math.max(...nodes.map((node) => node.y + node.height)) + STAGE_MARGIN,
  };
}
