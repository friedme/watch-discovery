import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const photo = (page: Page) => page.locator('.card:not(.ghost) .photo-main')

async function start(page: Page, name: string, collection = "Men's watches") {
  await page.goto('./?demo=1#/')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByPlaceholder('Your first name (optional)').fill(name)
  await page.getByText(collection, { exact: true }).click()
  await page.getByRole('button', { name: 'Show me the first watch' }).click()
  await expect(page.getByText(/Opening round · 1 of 20/)).toBeVisible()
}

async function swipe(page: Page, dx: number) {
  const box = (await page.locator('.card:not(.ghost)').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + i)
  await page.mouse.up()
}

test('real mode without verified photos explains what is missing and shows no placeholders', async ({ page }) => {
  await page.goto('./#/')
  await expect(page.getByText('No verified watch photos yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)
  await expect(page.locator('img')).toHaveCount(0)
})

test('swipe, buttons, pass and undo on a phone', async ({ page }) => {
  await start(page, 'Sarah')
  const first = await photo(page).getAttribute('src')

  await swipe(page, 220) // swipe right = Yay
  await expect(page.getByText(/Opening round · 2 of 20/)).toBeVisible()
  expect(await photo(page).getAttribute('src')).not.toBe(first)

  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(page.getByText(/Opening round · 1 of 20/)).toBeVisible()
  expect(await photo(page).getAttribute('src')).toBe(first)

  await swipe(page, 40) // too short: nothing happens
  await expect(page.getByText(/Opening round · 1 of 20/)).toBeVisible()

  await swipe(page, -220) // swipe left = Nay
  await page.getByRole('button', { name: /^Pass/ }).click()
  await page.getByRole('button', { name: /^Yay/ }).click()
  await expect(page.getByText(/Opening round · 4 of 20/)).toBeVisible()
  await page.getByRole('button', { name: 'Results' }).click()
  await expect(page.locator('.tally')).toContainText('1 Yay · 1 Nay · 1 Pass')
})

test('opening round, adaptive round, results, and sharing to another device', async ({ page, browser }) => {
  await start(page, 'Sarah')
  // A consistent taste: likes leather straps, dislikes everything else.
  for (let i = 0; i < 20; i++) {
    const src = (await photo(page).getAttribute('src')) ?? ''
    const leather = decodeURIComponent(src).includes('#6b4630')
    await page.getByRole('button', { name: leather ? /^Yay/ : /^Nay/ }).click()
  }
  await expect(page.getByRole('heading', { name: 'Opening round done' })).toBeVisible()
  await page.getByRole('button', { name: /Keep exploring/ }).click()
  await expect(page.getByText(/Exploring · 1 of 12/)).toBeVisible()
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: i % 2 ? /^Nay/ : /^Yay/ }).click()
  await expect(page.getByRole('heading', { name: 'Another round done' })).toBeVisible()
  await page.getByRole('button', { name: 'See results' }).click()

  await expect(page.getByRole('heading', { name: "What caught Sarah's eye" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Favourites' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What stood out' })).toBeVisible()
  await expect(page.locator('.obs').first()).toContainText(/\d+ (of the )?\d* ?watches|mixed reactions/)
  await expect(page.getByRole('heading', { name: 'New designs worth exploring' })).toBeVisible()
  await expect(page.locator('.tag', { hasText: 'Wildcard' }).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('%')

  // Open a favourite: details show the traits and the reaction.
  await page.locator('.fav').first().click()
  await expect(page.getByRole('dialog')).toContainText('You said Yay')
  await page.getByRole('button', { name: 'Close' }).click()

  // Share to "another phone": a fresh browser context with empty storage.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy link for another device' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain('#import=')

  const other = await browser.newContext()
  const phone2 = await other.newPage()
  await phone2.goto(link)
  await expect(phone2.getByRole('dialog', { name: 'Add shared results' })).toContainText("Sarah's results")
  await phone2.getByRole('button', { name: 'Add' }).click()
  await expect(phone2.getByRole('heading', { name: "What caught Sarah's eye" })).toBeVisible()
  await expect(phone2.locator('.tally')).toContainText(/\d+ Yay/)
  await other.close()
})

test('two people on one phone can compare', async ({ page }) => {
  await start(page, 'Sarah')
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: i < 3 ? /^Yay/ : /^Nay/ }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByPlaceholder('Your first name (optional)').fill('Tom')
  await page.getByRole('button', { name: 'Show me the first watch' }).click()
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: i % 2 ? /^Nay/ : /^Yay/ }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Compare two people' }).click()
  await expect(page.locator('.lede')).toContainText('gave a Yay or Nay to 6 of the same watches and agreed on')
  await expect(page.getByRole('heading', { name: /Both said Yay \(2\)/ })).toBeVisible()
})

test('progress survives a reload', async ({ page }) => {
  await start(page, 'Sarah')
  await page.getByRole('button', { name: /^Yay/ }).click()
  await page.getByRole('button', { name: /^Nay/ }).click()
  await page.reload()
  await expect(page.getByText(/Opening round · 3 of 20/)).toBeVisible()
})
