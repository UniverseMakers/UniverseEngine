import type { SimulationClass } from '../selection/simulation-catalog.ts';
import type { GalleryScene } from './gallery-data.ts';

const MAX_SCALE = 2.2;
const INITIAL_SCALE = 0.88;
const VIEWPORT_PADDING = 48;
const DRAG_THRESHOLD = 8;
const NODE_REVEAL_STAGGER_MS = 16;
const COSMOS_NODE_REVEAL_STAGGER_MS = 8;
// Reveal a hex anyway if its image is this slow, so one stalled request
// can't hold up the rest of the reveal sequence.
const IMAGE_REVEAL_TIMEOUT_MS = 3000;
// On touch / small screens, start zoomed in far enough that a hex is a
// comfortable tap target (~52px wide) rather than fitting the whole grid.
const TOUCH_LAYOUT_QUERY = '(pointer: coarse), (width <= 768px), (height <= 450px)';
const MIN_TAP_HEX_WIDTH_PX = 52;

export interface GalleryOverlayController {
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
  update: (
    simClass: SimulationClass,
    scene: GalleryScene,
    completedRunIds: Set<string>,
  ) => void;
}

interface GalleryOverlayOptions {
  onClose: () => void;
  onSelectRun: (runId: string) => void;
}

export function createGalleryOverlay(
  container: HTMLElement,
  options: GalleryOverlayOptions,
): GalleryOverlayController {
  const overlay = document.createElement('section');
  const panel = document.createElement('div');
  const header = document.createElement('div');
  const title = document.createElement('h2');
  const meta = document.createElement('div');
  const progress = document.createElement('p');
  const readout = document.createElement('p');
  const playButton = document.createElement('button');
  const closeButton = document.createElement('button');
  const viewport = document.createElement('div');
  const stage = document.createElement('div');
  const empty = document.createElement('div');

  overlay.className = 'overlay overlay--gallery is-hidden';
  overlay.hidden = true;
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Simulation run gallery');
  panel.className = 'gallery-overlay';
  header.className = 'gallery-overlay__header';
  title.className = 'gallery-overlay__title';
  meta.className = 'gallery-overlay__meta';
  progress.className = 'gallery-overlay__progress';
  readout.className = 'gallery-overlay__readout';
  readout.setAttribute('aria-live', 'polite');
  playButton.className = 'gallery-overlay__play is-hidden';
  playButton.type = 'button';
  playButton.textContent = 'Play';
  closeButton.className = 'gallery-overlay__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close gallery');
  closeButton.textContent = '×';
  viewport.className = 'gallery-overlay__viewport';
  stage.className = 'gallery-overlay__stage';
  empty.className = 'gallery-overlay__empty is-hidden';
  empty.innerHTML = `
    <p class="gallery-overlay__empty-title">No runs in the gallery yet</p>
    <p class="gallery-overlay__empty-copy">Runs will appear when thumbnails are available.</p>
  `;
  meta.append(progress, readout, playButton);
  header.append(title, meta, closeButton);
  viewport.appendChild(stage);
  panel.append(header, viewport, empty);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  let currentScene: GalleryScene = { nodes: [], stageWidth: 0, stageHeight: 0 };
  let renderVersion = 0;
  let scale = INITIAL_SCALE;
  let translateX = 0;
  let translateY = 0;
  let pointerId: number | null = null;
  const activePointers = new Map<number, { x: number; y: number }>();
  let pointerStartX = 0;
  let pointerStartY = 0;
  let startTranslateX = 0;
  let startTranslateY = 0;
  let dragDistance = 0;
  let pressedRunId: string | null = null;
  let pinchStartDistance = 0;
  let pinchStartScale = INITIAL_SCALE;
  let pinchWorldX = 0;
  let pinchWorldY = 0;
  const revealedSimulationIds = new Set<string>();
  let returnFocusTo: HTMLElement | null = null;
  // Touch has no hover, so the first tap selects a hex (showing its
  // parameters and a Play button) and a second tap on it plays.
  let selectedNode: HTMLElement | null = null;

  closeButton.addEventListener('click', options.onClose);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      options.onClose();
    }
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      options.onClose();
    } else if (event.key === 'Tab') {
      trapFocus(event);
    }
  });

  // Show the hovered / focused run's parameters in the header.
  const showReadout = (event: Event) => {
    const node = (event.target as HTMLElement).closest<HTMLElement>(
      '.gallery-overlay__node',
    );

    if (node) {
      readout.textContent = node.getAttribute('aria-label') ?? '';
    }
  };
  stage.addEventListener('pointerover', showReadout);
  stage.addEventListener('focusin', showReadout);
  stage.addEventListener('pointerleave', () => {
    readout.textContent = selectedNode?.getAttribute('aria-label') ?? '';
  });
  playButton.addEventListener('click', () => {
    if (selectedNode?.dataset.runId) {
      options.onSelectRun(selectedNode.dataset.runId);
    }
  });

  viewport.addEventListener('pointerdown', (event) => {
    pressedRunId =
      (event.target as HTMLElement).closest<HTMLElement>('.gallery-overlay__node')
        ?.dataset.runId ?? null;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);

    if (activePointers.size >= 2) {
      pointerId = null;
      pressedRunId = null;
      viewport.classList.add('is-dragging');
      beginPinch();

      return;
    }

    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    startTranslateX = translateX;
    startTranslateY = translateY;
    dragDistance = 0;
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (activePointers.size >= 2) {
      updatePinch();

      return;
    }

    if (event.pointerId !== pointerId) {
      return;
    }

    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;

    dragDistance = Math.max(dragDistance, Math.hypot(deltaX, deltaY));
    translateX = startTranslateX + deltaX;
    translateY = startTranslateY + deltaY;
    clampTranslation();
    applyTransform();
  });
  viewport.addEventListener('pointerup', (event) => releasePointer(event, true));
  viewport.addEventListener('pointercancel', (event) => releasePointer(event, false));
  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pointX = event.clientX - rect.left;
      const pointY = event.clientY - rect.top;
      const worldX = (pointX - translateX) / scale;
      const worldY = (pointY - translateY) / scale;
      const factor = event.deltaY < 0 ? 1.05 : 0.96;

      scale = clamp(scale * factor, getMinimumScale(), MAX_SCALE);
      translateX = pointX - worldX * scale;
      translateY = pointY - worldY * scale;
      clampTranslation();
      applyTransform();
    },
    { passive: false },
  );

  window.addEventListener('resize', () => {
    if (!overlay.hidden) {
      resetView();
    }
  });

  return {
    show() {
      if (overlay.hidden) {
        returnFocusTo =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
      requestAnimationFrame(resetView);
      overlay.focus();
    },
    hide() {
      renderVersion += 1;
      releaseActivePointer();
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
      if (returnFocusTo?.isConnected) {
        returnFocusTo.focus();
      }
      returnFocusTo = null;
    },
    isVisible() {
      return !overlay.hidden;
    },
    update(simClass, scene, completedRunIds) {
      const shouldAnimateReveal =
        scene.nodes.length > 0 && !revealedSimulationIds.has(simClass.id);

      if (scene.nodes.length > 0) {
        revealedSimulationIds.add(simClass.id);
      }

      currentScene = scene;
      title.textContent = `${simClass.label} Gallery`;
      const explored = scene.nodes.filter((node) =>
        completedRunIds.has(node.runId),
      ).length;
      progress.textContent =
        scene.nodes.length > 0 ? `${explored} / ${scene.nodes.length} explored` : '';
      readout.textContent = '';
      selectNode(null);
      stage.style.width = `${scene.stageWidth}px`;
      stage.style.height = `${scene.stageHeight}px`;
      empty.classList.toggle('is-hidden', scene.nodes.length > 0);
      viewport.classList.toggle('is-hidden', scene.nodes.length === 0);
      renderNodes(
        scene,
        completedRunIds,
        shouldAnimateReveal,
        simClass.id === 'cosmos'
          ? COSMOS_NODE_REVEAL_STAGGER_MS
          : NODE_REVEAL_STAGGER_MS,
      );
    },
  };

  function renderNodes(
    scene: GalleryScene,
    completedRunIds: Set<string>,
    shouldAnimateReveal: boolean,
    revealStaggerMs: number,
  ): void {
    const version = ++renderVersion;
    const orderedNodes = [...scene.nodes].sort(
      (left, right) => left.revealOrder - right.revealOrder,
    );
    const buttons: HTMLButtonElement[] = [];

    stage.replaceChildren();
    const imagePromises = orderedNodes.map((node) => {
      const button = document.createElement('button');
      const media = document.createElement('span');
      const image = document.createElement('img');

      button.className = `gallery-overlay__node is-pending${shouldAnimateReveal ? '' : ' gallery-overlay__node--no-reveal-animation'}`;
      button.type = 'button';
      button.tabIndex = -1;
      button.dataset.runId = node.runId;
      button.setAttribute('aria-label', node.label);
      button.classList.toggle('is-lit', completedRunIds.has(node.runId));
      button.style.left = `${node.x}px`;
      button.style.top = `${node.y}px`;
      button.style.width = `${node.width}px`;
      button.style.height = `${node.height}px`;
      button.addEventListener('click', (event) => {
        if (event.detail === 0) {
          options.onSelectRun(node.runId);
        }
      });
      media.className = 'gallery-overlay__node-media';
      image.className = 'gallery-overlay__node-image';
      image.alt = '';
      image.decoding = 'async';
      image.draggable = false;
      media.appendChild(image);
      button.appendChild(media);
      stage.appendChild(button);
      buttons.push(button);

      return loadFirstAvailableImage(image, [
        node.thumbnailUrl,
        node.thumbnailFallbackUrl,
        node.placeholderUrl,
      ]);
    });

    if (shouldAnimateReveal) {
      void revealInOrder(version, buttons, imagePromises, revealStaggerMs);
    } else {
      imagePromises.forEach((imagePromise, index) => {
        void imagePromise.then(() => {
          if (version === renderVersion) {
            reveal(buttons[index]);
          }
        });
      });
    }
  }

  async function revealInOrder(
    version: number,
    buttons: HTMLButtonElement[],
    imagePromises: Promise<void>[],
    revealStaggerMs: number,
  ): Promise<void> {
    for (let index = 0; index < buttons.length; index += 1) {
      await Promise.race([imagePromises[index], wait(IMAGE_REVEAL_TIMEOUT_MS)]);
      if (version !== renderVersion || overlay.hidden) {
        return;
      }

      reveal(buttons[index]);
      await wait(revealStaggerMs);
    }
  }

  function reveal(button: HTMLButtonElement): void {
    button.classList.remove('is-pending');
    button.tabIndex = 0;
  }

  // aria-modal doesn't stop Tab leaving the dialog, so wrap focus by hand.
  function trapFocus(event: KeyboardEvent): void {
    const focusable = [
      closeButton,
      ...(playButton.classList.contains('is-hidden') ? [] : [playButton]),
      ...stage.querySelectorAll<HTMLElement>('.gallery-overlay__node:not(.is-pending)'),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === overlay)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function releasePointer(event: PointerEvent, allowSelection: boolean): void {
    if (!activePointers.has(event.pointerId)) {
      return;
    }

    const selectedRunId =
      allowSelection && activePointers.size === 1 && dragDistance <= DRAG_THRESHOLD
        ? pressedRunId
        : null;

    activePointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (activePointers.size === 1) {
      const [remainingId, remaining] = [...activePointers.entries()][0];

      pointerId = remainingId;
      pointerStartX = remaining.x;
      pointerStartY = remaining.y;
      startTranslateX = translateX;
      startTranslateY = translateY;
      dragDistance = 0;
    } else {
      pointerId = null;
      pressedRunId = null;
      viewport.classList.remove('is-dragging');
    }

    if (!selectedRunId) {
      return;
    }

    if (
      event.pointerType === 'mouse' ||
      selectedNode?.dataset.runId === selectedRunId
    ) {
      options.onSelectRun(selectedRunId);
    } else {
      selectNode(
        stage.querySelector<HTMLElement>(
          `.gallery-overlay__node[data-run-id="${CSS.escape(selectedRunId)}"]`,
        ),
      );
    }
  }

  function selectNode(node: HTMLElement | null): void {
    selectedNode?.classList.remove('is-selected');
    selectedNode = node;
    node?.classList.add('is-selected');
    readout.textContent = node?.getAttribute('aria-label') ?? '';
    playButton.classList.toggle('is-hidden', !node);
  }

  function releaseActivePointer(): void {
    for (const activePointerId of activePointers.keys()) {
      if (viewport.hasPointerCapture(activePointerId)) {
        viewport.releasePointerCapture(activePointerId);
      }
    }

    activePointers.clear();
    pointerId = null;
    pressedRunId = null;
    viewport.classList.remove('is-dragging');
  }

  function beginPinch(): void {
    const [first, second] = [...activePointers.values()];

    if (!first || !second) {
      return;
    }

    pinchStartDistance = Math.hypot(second.x - first.x, second.y - first.y);
    pinchStartScale = scale;
    const rect = viewport.getBoundingClientRect();
    const midpointX = (first.x + second.x) / 2 - rect.left;
    const midpointY = (first.y + second.y) / 2 - rect.top;

    pinchWorldX = (midpointX - translateX) / scale;
    pinchWorldY = (midpointY - translateY) / scale;
  }

  function updatePinch(): void {
    const [first, second] = [...activePointers.values()];

    if (!first || !second || pinchStartDistance <= 0) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const midpointX = (first.x + second.x) / 2 - rect.left;
    const midpointY = (first.y + second.y) / 2 - rect.top;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);

    scale = clamp(
      pinchStartScale * (distance / pinchStartDistance),
      getMinimumScale(),
      MAX_SCALE,
    );
    translateX = midpointX - pinchWorldX * scale;
    translateY = midpointY - pinchWorldY * scale;
    dragDistance = Math.max(dragDistance, Math.abs(distance - pinchStartDistance));
    clampTranslation();
    applyTransform();
  }

  function resetView(): void {
    if (overlay.hidden) {
      return;
    }

    scale = getMinimumScale();
    const hexWidth = currentScene.nodes[0]?.width;
    if (hexWidth && window.matchMedia(TOUCH_LAYOUT_QUERY).matches) {
      scale = Math.min(MAX_SCALE, Math.max(scale, MIN_TAP_HEX_WIDTH_PX / hexWidth));
    }
    translateX = (viewport.clientWidth - currentScene.stageWidth * scale) / 2;
    translateY = (viewport.clientHeight - currentScene.stageHeight * scale) / 2;
    applyTransform();
  }

  function getMinimumScale(): number {
    if (currentScene.stageWidth <= 0 || currentScene.stageHeight <= 0) {
      return INITIAL_SCALE;
    }

    return Math.min(
      MAX_SCALE,
      Math.max(
        0.1,
        Math.min(
          (viewport.clientWidth - VIEWPORT_PADDING * 2) / currentScene.stageWidth,
          (viewport.clientHeight - VIEWPORT_PADDING * 2) / currentScene.stageHeight,
        ),
      ),
    );
  }

  function clampTranslation(): void {
    const centeredX = (viewport.clientWidth - currentScene.stageWidth * scale) / 2;
    const centeredY = (viewport.clientHeight - currentScene.stageHeight * scale) / 2;
    const maxX = Math.max(
      120,
      (currentScene.stageWidth * scale - viewport.clientWidth) / 2 + 120,
    );
    const maxY = Math.max(
      120,
      (currentScene.stageHeight * scale - viewport.clientHeight) / 2 + 120,
    );

    translateX = clamp(translateX, centeredX - maxX, centeredX + maxX);
    translateY = clamp(translateY, centeredY - maxY, centeredY + maxY);
  }

  function applyTransform(): void {
    stage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }
}

async function loadFirstAvailableImage(
  image: HTMLImageElement,
  candidates: Array<string | null>,
): Promise<void> {
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))] as string[];

  for (const candidate of uniqueCandidates) {
    try {
      await loadImage(image, candidate);

      return;
    } catch {
      continue;
    }
  }
}

function loadImage(image: HTMLImageElement, source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      cleanup();
      void image
        .decode()
        .catch(() => undefined)
        .then(resolve);
    };
    const fail = () => {
      cleanup();
      reject(new Error(`Failed to load gallery image: ${source}`));
    };
    const cleanup = () => {
      image.removeEventListener('load', finish);
      image.removeEventListener('error', fail);
    };

    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', fail, { once: true });
    image.src = source;
    if (image.complete) {
      if (image.naturalWidth > 0) {
        finish();
      } else {
        fail();
      }
    }
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
