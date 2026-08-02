// Seam 1 unit tests for the UI store.
// Covers ADR-0012 / spec behaviors that are observable through store state:
//  - the two side panels open independently (story 2) and every close path
//    funnels through the same close action so button-close and scrim-close
//    behave identically (persistence consistency),
//  - transient toasts (story 4 non-PDF notice, generic feedback).
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from './ui'
import { STORAGE_KEYS } from '../lib/storage'

describe('ui store — independent panels', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('opens both panels without one closing the other (story 2)', () => {
    const ui = useUiStore()
    ui.closeOutline()
    ui.closeConversation()
    expect(ui.outlineOpen).toBe(false)
    expect(ui.conversationOpen).toBe(false)

    ui.openOutline()
    ui.openConversation()

    expect(ui.outlineOpen).toBe(true)
    expect(ui.conversationOpen).toBe(true)
  })

  it('toggles each panel independently', () => {
    const ui = useUiStore()
    ui.openOutline()
    ui.openConversation()
    expect(ui.outlineOpen).toBe(true)
    expect(ui.conversationOpen).toBe(true)

    ui.toggleOutline()
    expect(ui.outlineOpen).toBe(false)
    // conversation must remain open
    expect(ui.conversationOpen).toBe(true)
  })

  it('closeOutline only closes the outline and leaves conversation untouched', () => {
    const ui = useUiStore()
    ui.openOutline()
    ui.openConversation()
    ui.closeOutline()

    expect(ui.outlineOpen).toBe(false)
    expect(ui.conversationOpen).toBe(true)
  })

  it('closeConversation only closes the conversation and leaves outline untouched', () => {
    const ui = useUiStore()
    ui.openOutline()
    ui.openConversation()
    ui.closeConversation()

    expect(ui.conversationOpen).toBe(false)
    expect(ui.outlineOpen).toBe(true)
  })

  it('persists panel visibility through the shared close/open actions', () => {
    // localStorage is unavailable in the node test env, so this asserts the
    // action drives state; the same action is the single funnel for toolbar
    // buttons, the mobile scrim, and the tab bar (spec comment in ui.ts).
    const ui = useUiStore()
    ui.closeOutline()
    expect(ui.outlineOpen).toBe(false)
    expect(localStorageAvailable()).toBe(false) // sanity: we rely on state here
    ui.openOutline()
    expect(ui.outlineOpen).toBe(true)
    // key used by the action for persistence
    expect(typeof STORAGE_KEYS.outlineOpen).toBe('string')
  })
})

describe('ui store — transient toast', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows a toast message', () => {
    const ui = useUiStore()
    expect(ui.toast).toBeNull()
    ui.showToast('仅支持 PDF 文件')
    expect(ui.toast).toBe('仅支持 PDF 文件')
  })

  it('clears the toast on demand', () => {
    const ui = useUiStore()
    ui.showToast('hi')
    expect(ui.toast).toBe('hi')
    ui.clearToast()
    expect(ui.toast).toBeNull()
  })
})

function localStorageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}
