import { expect, test } from '@playwright/test'

test('вкладка пентатоники: пять боксов, погашенные ступени и блюзовая нота', async ({ page }) => {
  await page.goto('/?tonic=9&mode=minor&section=pentatonic')

  await expect(page.getByRole('heading', { name: 'A · Ля минорная пентатоника' })).toBeVisible()
  // Пентатоника — это гамма без двух ступеней, и это видно в самом ряду.
  await expect(page.locator('.note-strip--pentatonic .note-card')).toHaveCount(7)
  await expect(page.locator('.note-card.is-dropped strong')).toHaveText(['B', 'F'])
  await expect(page.getByText('Те же пять нот — это C · До мажор')).toBeVisible()

  // Пять боксов, по два звука на струну.
  await expect(page.locator('.pattern-chip')).toHaveCount(5)
  await expect(page.locator('.pattern-chip').first()).toContainText('Бокс 1')
  await expect(page.locator('.fretboard-scroll .fret-note')).toHaveCount(12)

  await page.locator('.pattern-chip').nth(2).click()
  await expect(page.locator('.pattern-summary__title h4')).toContainText('Бокс 3')
  await expect(page.locator('.tab-card')).toBeVisible()

  // Блюзовая нота добавляется внутрь бокса и подписывается отдельно.
  await page.getByRole('button', { name: 'Блюзовая нота' }).click()
  await expect(page.getByRole('heading', { name: 'A · Ля минорный блюз' })).toBeVisible()
  await expect(page.locator('.note-card.is-blue strong')).toHaveText('E♭')
  await expect(page.locator('.fret-note.is-accent').first()).toBeVisible()
  await expect(page.getByText('блюзовая нота · E♭')).toBeVisible()
})

test('вкладка пентатоники: мажорная сторона берёт те же ноты от относительной тоники', async ({ page }) => {
  await page.goto('/?tonic=9&mode=minor&section=pentatonic')

  const minorNotes = await page
    .locator('.note-strip--pentatonic .note-card:not(.is-dropped) strong')
    .allTextContents()

  // Мажор или минор выбирается самой тональностью на круге, а не внутри вкладки.
  await page.getByRole('button', { name: 'C мажор', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'C · До мажорная пентатоника' })).toBeVisible()
  await expect(page.locator('.note-card.is-dropped strong')).toHaveText(['F', 'B'])

  const majorNotes = await page
    .locator('.note-strip--pentatonic .note-card:not(.is-dropped) strong')
    .allTextContents()
  expect(new Set(majorNotes)).toEqual(new Set(minorNotes))
})

test('мобильная версия: четыре вкладки помещаются в одну строку', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const tabs = await page.locator('.detail-tabs button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const cell = button.getBoundingClientRect()
      const label = button.querySelector('strong')!.getBoundingClientRect()
      return {
        top: Math.round(cell.top),
        fits: label.left >= cell.left - 1 && label.right <= cell.right + 1,
      }
    }),
  )
  expect(tabs).toHaveLength(4)
  // Одна строка вкладок, и ни одна подпись не залезает на соседнюю.
  expect(new Set(tabs.map((tab) => tab.top)).size).toBe(1)
  expect(tabs.every((tab) => tab.fits)).toBe(true)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})
