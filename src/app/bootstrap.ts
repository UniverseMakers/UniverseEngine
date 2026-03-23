/**
 * Application bootstrap.
 *
 * This module is intentionally tiny: it finds the HTML mount node, validates
 * that it exists, and then hands off to the real app shell builder.
 */

import { createAppShell } from './app-shell.ts';

/**
 * Locate the root DOM node and start the application.
 *
 * @returns void
 */
export function bootstrapApp(): void {
  const mountNode = document.getElementById('app');

  if (!mountNode) {
    throw new Error('App mount element not found.');
  }

  createAppShell(mountNode);
}
