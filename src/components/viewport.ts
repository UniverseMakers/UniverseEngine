/**
 * Viewport — FULL-PAGE background layer for simulation content.
 *
 * The viewport covers the entire screen. All other UI widgets
 * (sidebar, menu, timeline, theme toggle) are overlaid on top of it.
 *
 * Currently shows a static placeholder image per simulation class.
 * Will eventually host a video player for streamed simulation movies.
 */

export interface ViewportController {
  /** Change the displayed image with a fade transition */
  setImage: (src: string) => void;
  /** Get the viewport element */
  getElement: () => HTMLElement;
}

export function createViewport(
  container: HTMLElement,
  initialSrc: string,
): ViewportController {
  const viewport = document.createElement('div');
  viewport.className = 'viewport';

  const img = document.createElement('img');
  img.className = 'viewport__image';
  img.src = initialSrc;
  img.alt = 'Simulation output';

  viewport.appendChild(img);
  container.appendChild(viewport);

  function setImage(src: string) {
    img.classList.add('fade-out');
    setTimeout(() => {
      img.src = src;
      img.onload = () => {
        img.classList.remove('fade-out');
      };
    }, 300);
  }

  return {
    setImage,
    getElement: () => viewport,
  };
}
