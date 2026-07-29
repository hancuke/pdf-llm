import { test, expect } from '@playwright/test'

const FIXTURE = 'e2e/fixtures/sample.pdf'

test('opens a PDF and renders a selectable text layer', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)

  // A page wrapper and the extractable text from the fixture both appear.
  await expect(page.locator('.pdf-page').first()).toBeVisible()
  await expect(page.locator('.pdf-text-layer').first()).toBeVisible()
  await expect(page.getByText('Hello PDF-LLM')).toBeVisible()
})

test('selecting text opens the action sheet and starts a conversation', async ({
  page,
}) => {
  // Pre-configure a (deliberately unreachable) endpoint so the action is not
  // blocked, yet the conversation still opens and surfaces the call error.
  await page.addInitScript(() => {
    localStorage.setItem('pdfllm.endpoint', 'http://127.0.0.1:9/v1')
    localStorage.setItem('pdfllm.apiKey', 'sk-e2e')
    localStorage.setItem('pdfllm.model', 'e2e-model')
  })

  await page.goto('/')
  await page.setInputFiles('input[type="file"]', FIXTURE)
  await expect(page.locator('.pdf-text-layer').first()).toBeVisible()

  // Double-click a word in the text layer to create a selection.
  const word = page.locator('.pdf-text-layer').first().getByText('selection')
  await word.dblclick()

  // The iOS-style action sheet appears with the preset Quick Actions.
  const sheet = page.locator('.action-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('解释选中内容')).toBeVisible()
  await expect(sheet.getByText('翻译选中内容')).toBeVisible()

  // Picking an action starts the conversation (composer becomes available).
  await sheet.getByText('解释选中内容').click()
  await expect(page.locator('textarea.conv-input')).toBeVisible()

  // With an unreachable endpoint the failure is surfaced inside the panel.
  await expect(page.locator('.conv-error')).toBeVisible()
})
