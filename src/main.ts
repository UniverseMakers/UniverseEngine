/**
 * Main browser entrypoint.
 *
 * This file should stay intentionally tiny. It loads global styling and starts
 * the real application bootstrap sequence.
 */

import './style.css';

import { bootstrapApp } from './app/bootstrap.ts';

// Hand off to the bootstrap module immediately.
bootstrapApp();
