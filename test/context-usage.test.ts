import { describe, expect, it } from 'vitest'
import { contextPercent } from '../src/renderer/src/lib/context-usage'

describe('contextPercent', () => {
  it('reads the real omp payload as a percentage, not a fraction', () => {
    // Captured from `omp --mode rpc` get_state on a fresh session: `percent` is
    // already scaled 0-100. Multiplying it by 100 rendered this as "138%".
    const usage = { tokens: 14438, contextWindow: 1048576, percent: 1.3769149780273438 }
    expect(contextPercent(usage)).toBeCloseTo(1.377, 2)
    expect(Math.round(contextPercent(usage))).toBe(1)
  })

  it('derives from the token counts so it matches the figures shown beside it', () => {
    expect(contextPercent({ tokens: 50_000, contextWindow: 200_000, percent: 25 })).toBe(25)
    // Even a disagreeing `percent` cannot push the bar somewhere the numbers don't support.
    expect(contextPercent({ tokens: 50_000, contextWindow: 200_000, percent: 0.25 })).toBe(25)
  })

  it('falls back to the reported percentage when the window size is missing', () => {
    expect(contextPercent({ tokens: 100, contextWindow: 0, percent: 42 })).toBe(42)
  })

  it('clamps to 0-100 and never yields NaN', () => {
    expect(contextPercent({ tokens: 300, contextWindow: 100, percent: 300 })).toBe(100)
    expect(contextPercent({ tokens: -5, contextWindow: 100, percent: -5 })).toBe(0)
    expect(contextPercent({ tokens: 0, contextWindow: 0, percent: Number.NaN })).toBe(0)
  })
})
