import type { AppSettings, ThemeMode } from '../../../shared/omp-api'

export type ResolvedTheme = 'dark' | 'light'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 'system' follows the OS; the other two are explicit. Split out from the DOM
 *  work so the resolution rule is testable without a document. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'dark' || mode === 'light') return mode
  return prefersDark ? 'dark' : 'light'
}

/** Paint the resolved theme and text scale onto the document root. The CSS keys
 *  off [data-theme]; `color-scheme` is set too so native form controls and
 *  scrollbars follow, which they do not from custom properties alone. */
export function applyTheme(settings: Pick<AppSettings, 'theme' | 'fontSize'>, root: HTMLElement, prefersDark: boolean): ResolvedTheme {
  const resolved = resolveTheme(settings.theme, prefersDark)
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  root.style.setProperty('--font-size-base', `${settings.fontSize}px`)
  return resolved
}

/** Current OS preference. Defaults to dark when matchMedia is unavailable (jsdom),
 *  matching the app's dark-first design. */
export function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY).matches : true
}

/** Wire settings to the document and keep following the OS while the mode is
 *  'system'. Returns an unsubscribe. */
export function installTheme(getSettings: () => Pick<AppSettings, 'theme' | 'fontSize'>): () => void {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
  const paint = (): void => {
    applyTheme(getSettings(), document.documentElement, media?.matches ?? true)
  }
  paint()
  // Only 'system' cares about OS changes, but re-painting unconditionally is
  // cheaper than tearing the listener down and rebuilding it on every change.
  media?.addEventListener('change', paint)
  return () => media?.removeEventListener('change', paint)
}
