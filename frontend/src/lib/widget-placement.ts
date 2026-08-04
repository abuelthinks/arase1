export type WidgetPlacement = 'top-right' | 'bottom-right';

export const WIDGET_PLACEMENT_KEY = 'arase:accessibility:placement';

/**
 * Parents get the bottom-right corner by default. Their pages lead with the
 * child's name and status in the top band, and the floating tools crowd it —
 * staff pages have no such header, so they keep the top-right corner.
 */
export function defaultWidgetPlacement(role?: string): WidgetPlacement {
  return role === 'PARENT' ? 'bottom-right' : 'top-right';
}

/** Saved preference wins over the role default; anything else falls back. */
export function resolveWidgetPlacement(role?: string): WidgetPlacement {
  if (typeof window === 'undefined') return defaultWidgetPlacement(role);
  const saved = window.localStorage.getItem(WIDGET_PLACEMENT_KEY);
  return saved === 'top-right' || saved === 'bottom-right' ? saved : defaultWidgetPlacement(role);
}
