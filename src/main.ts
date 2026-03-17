/**
 * UniverseEngine — Main entry point.
 *
 * Layout: The viewport is a full-screen background layer.
 * All UI widgets float on top with translucent backgrounds.
 *
 *  - Theme toggle (top center, floating)
 *  - Simulation class menu (top right, floating)
 *  - Parameter sidebar (left, floating, collapsible)
 *  - Viewport (full-screen background)
 *  - Timeline scrubber (bottom, floating)
 */

import './style.css';

import { SIMULATION_CLASSES, type SimulationClass } from './data/simulations.ts';
import { createThemeToggle } from './components/theme-toggle.ts';
import { createMenu } from './components/menu.ts';
import { createSidebar } from './components/sidebar.ts';
import { createViewport } from './components/viewport.ts';
import { createTimeline } from './components/timeline.ts';
import { findNearestVideo } from './utils/nearest.ts';

// ── State ──────────────────────────────────────────────────
let activeClass: SimulationClass = SIMULATION_CLASSES[0]; // Start with Planetary

// ── Mount point ────────────────────────────────────────────
const app = document.getElementById('app')!;

// ── Viewport (full-screen background — rendered FIRST) ─────
const viewport = createViewport(app, activeClass.placeholderImage);

// ── Floating UI overlays ───────────────────────────────────

// Theme toggle — top center
const topBar = document.createElement('header');
topBar.className = 'top-bar';
app.appendChild(topBar);
createThemeToggle(topBar);

// Sidebar — left edge
const sidebarContainer = document.createElement('div');
sidebarContainer.className = 'sidebar-container';
app.appendChild(sidebarContainer);
const sidebar = createSidebar(sidebarContainer, activeClass, handleRun);

// Simulation class menu — top right
const menuContainer = document.createElement('div');
menuContainer.className = 'menu-container';
app.appendChild(menuContainer);
const menu = createMenu(menuContainer, activeClass.id, handleClassChange);

// Timeline — bottom
const timelineContainer = document.createElement('div');
timelineContainer.className = 'timeline-container';
app.appendChild(timelineContainer);
const timeline = createTimeline(timelineContainer, (_position) => {
  // TODO: seek video to this position when video playback is implemented
});

// Set initial timeline labels
updateTimelineLabels();

// ── Scanline overlay (for Matrix theme) ────────────────────
const scanlines = document.createElement('div');
scanlines.className = 'scanlines';
document.body.appendChild(scanlines);

// ── Event handlers ─────────────────────────────────────────

function handleClassChange(newClass: SimulationClass) {
  if (newClass.id === activeClass.id) return;

  // Update all UI
  menu.setActive(newClass.id);
  sidebar.setSimClass(newClass);
  activeClass = newClass;
  viewport.setImage(newClass.placeholderImage);
  updateTimelineLabels();
}

function handleRun(simClass: SimulationClass, values: Record<string, number>) {
  const match = findNearestVideo(
    simClass.parameters,
    values,
    simClass.placeholderImage,
  );

  viewport.setImage(match.url);

  console.log(
    `[UniverseEngine] Run ${simClass.label}`,
    values,
    `→ matched: ${match.url} (distance: ${match.distance})`,
  );
}

function updateTimelineLabels() {
  switch (activeClass.id) {
    case 'planetary':
      timeline.setRange('t = 0 hr', 't = 48 hr');
      break;
    case 'galaxy':
      timeline.setRange('z = 10', 'z = 0');
      break;
    case 'cosmos':
      timeline.setRange('z = 50', 'z = 0');
      break;
  }
}
