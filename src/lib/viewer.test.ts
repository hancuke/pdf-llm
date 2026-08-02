// Tests for the pure functions in lib/viewer that don't require a live
// PDFium engine or zoom capability.
import { describe, it, expect } from 'vitest'
import { ZOOM_MODE_LABELS, ZOOM_PRESETS } from './viewer'

describe('viewer — zoom constants', () => {
  it('labels every fit mode in Chinese', () => {
    expect(ZOOM_MODE_LABELS).toEqual({
      automatic: '自动',
      'fit-page': '适合页面',
      'fit-width': '适合宽度',
    })
  })

  it('presets include three fit modes followed by numeric percentages', () => {
    const modes = ZOOM_PRESETS.filter((p) => typeof p.level === 'string')
    const nums = ZOOM_PRESETS.filter((p) => typeof p.level === 'number')
    expect(modes).toHaveLength(3)
    expect(nums.length).toBeGreaterThan(0)
    // Every preset has a non-empty label.
    for (const p of ZOOM_PRESETS) {
      expect(p.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('preset labels match the mode label map for fit modes', () => {
    for (const p of ZOOM_PRESETS) {
      if (typeof p.level === 'string') {
        expect(p.label).toBe(ZOOM_MODE_LABELS[p.level])
      }
    }
  })
})
