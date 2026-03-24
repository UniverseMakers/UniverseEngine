/**
 * URL helpers.
 *
 * Vite deployments may run under a non-root base path (e.g. GitHub Pages
 * `/engine/`). Any URL that points at `public/` assets must be prefixed by the
 * configured base path.
 */

/**
 * Prefix a public-asset path with Vite's `BASE_URL`.
 *
 * @param path - Asset path such as `assets/foo.png` or `/assets/foo.png`.
 * @returns A URL safe to use under any Vite base path.
 */
export function withBaseUrl(path: string): string {
  if (
    /^[a-z]+:\/\//i.test(path) ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }

  const base = import.meta.env.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  return `${normalizedBase}${normalizedPath}`;
}
