export interface ContextUsage {
  tokens: number
  contextWindow: number
  percent: number
}

/** Share of the context window used, 0–100.
 *
 *  `omp` reports `percent` already scaled to 0–100 — 14,438 tokens of a
 *  1,048,576 window comes back as `1.3769`, not `0.0138`. Both the status bar
 *  and the context panel multiplied it by 100 again, so a nearly-empty session
 *  read as "138%" behind a full red bar.
 *
 *  Deriving the figure from the token counts is immune to which convention the
 *  agent uses and stays consistent with the "14.4K / 1M" text printed beside it;
 *  the reported percentage is only a fallback for when the window size is
 *  missing. */
export function contextPercent(usage: ContextUsage): number {
  const raw = usage.contextWindow > 0 ? (usage.tokens / usage.contextWindow) * 100 : usage.percent
  if (!Number.isFinite(raw)) return 0
  return Math.min(100, Math.max(0, raw))
}
