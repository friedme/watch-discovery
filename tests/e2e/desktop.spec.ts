import { expect, test } from '@playwright/test'

test('keyboard shortcuts on a computer', async ({ page }) => {
  await page.goto('./?demo=1#/')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Show me the first watch' }).click()
  const photo = page.locator('.card:not(.ghost) .photo-main')
  const first = await photo.getAttribute('src')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText(/Opening round · 2 of 20/)).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByText(/Opening round · 4 of 20/)).toBeVisible()
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(page.getByText(/Opening round · 1 of 20/)).toBeVisible()
  expect(await photo.getAttribute('src')).toBe(first)
})

test('a desktop layout: large photo on the left, question, buttons and key hints on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./?demo=1#/')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Show me the first watch' }).click()
  const card = (await page.locator('.card:not(.ghost)').boundingBox())!
  const yay = (await page.getByRole('button', { name: /^Yay/ }).boundingBox())!
  expect(card.height).toBeGreaterThan(600)
  expect(yay.x).toBeGreaterThan(card.x + card.width)
  await expect(page.locator('.key-hint').first()).toBeVisible()
})
