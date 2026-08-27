import { expect, test } from '@playwright/test'

test('выбор тональности обновляет ноты и минорные варианты', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /C · До мажор/ })).toBeVisible()
  await expect(page.locator('.note-card')).toHaveCount(7)

  await page.getByRole('button', { name: 'Am минор' }).click()
  await expect(page.getByRole('heading', { name: /A · Ля минор/ })).toBeVisible()
  await expect(page).toHaveURL(/tonic=9.*mode=minor/)
  await page.getByRole('button', { name: 'Гармонический', exact: true }).click()
  await expect(page.getByRole('button', { name: /7 ступень, Соль диез/ })).toBeVisible()
})

test('переключает семейства, маршруты и анимирует выбранную аппликатуру', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Гамма и TAB/ }).click()
  await expect(page.getByRole('heading', { name: 'Библиотека аппликатур' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Лучшие/ })).toHaveAttribute('aria-selected', 'true')
  const equivalentBestShapes = page.locator('.pattern-chip')
    .filter({ hasText: /Форма E|Позиционная 4/ })
  await expect(equivalentBestShapes).toHaveCount(1)
  await equivalentBestShapes.click()
  await expect(page.getByText(/Совпадает на грифе с:/)).toBeVisible()

  await page.getByRole('tab', { name: /CAGED/ }).click()
  await expect(page.locator('.pattern-chip')).toHaveCount(5)
  await page.locator('.pattern-chip').filter({ hasText: 'Форма C' }).click()
  await expect(page.getByRole('heading', { name: 'Форма C' })).toBeVisible()
  await expect(page.locator('.pattern-chip').filter({ hasText: 'Форма C' })).toContainText('0–3 лады')
  await page.getByRole('radio', { name: '1 октава' }).click()
  await expect(page.getByText(/Маршрут: C → C/)).toBeVisible()
  await expect(page.locator('[data-tab-step]')).toHaveCount(8)
  await expect(page.locator('.fret-note[data-finger]').first()).toBeVisible()

  await page.getByRole('tab', { name: /2 октавы/ }).click()
  await expect(page.locator('.pattern-chip')).toHaveCount(3)
  const flexibleTwoOctave = page.locator('.pattern-chip').filter({ hasText: '2–3–3–3–4' })
  await expect(flexibleTwoOctave).toHaveCount(2)
  await expect(flexibleTwoOctave.first()).toContainText('лучший старт')
  await flexibleTwoOctave.first().click()
  await expect(page.getByRole('heading', { name: '2–3–3–3–4 · 5-я стр.' })).toBeVisible()
  await expect(page.getByText('2 + 3 + 3 + 3 + 4 по струнам', { exact: true })).toBeVisible()
  await expect(page.getByText(/Маршрут: C → C → C/)).toBeVisible()
  await expect(page.locator('[data-tab-step]')).toHaveCount(15)

  await page.locator('.pattern-chip').filter({ hasText: '1–3–3–3–3–2' }).click()
  await expect(page.getByText('1 + 3 + 3 + 3 + 3 + 2 по струнам', { exact: true })).toBeVisible()
  await expect(page.getByText(/Маршрут: C → C → C/)).toBeVisible()
  await expect(page.locator('[data-tab-step]')).toHaveCount(15)

  await page.getByRole('tab', { name: /3NPS/ }).click()
  await expect(page.getByRole('heading', { name: '3NPS 1 · C' })).toBeVisible()
  await page.getByRole('radio', { name: '2 октавы' }).click()
  await expect(page.getByText(/Маршрут: C → C → C/)).toBeVisible()
  await expect(page.locator('[data-tab-step]')).toHaveCount(15)
  await page.getByRole('button', { name: 'Сыграть маршрут вверх' }).click()
  await expect(page.locator('.fret-note[data-playing="true"] .fret-note__marker')).toBeVisible()
  await expect(page.locator('.tab-grid__cell[data-playing="true"]')).toBeVisible()

  await page.getByRole('tab', { name: /Расширенные/ }).click()
  const threeOctavePattern = page.locator('.pattern-chip').filter({ hasText: '3 октавы' })
  await expect(threeOctavePattern).toBeVisible()
  await threeOctavePattern.click()
  await page.getByRole('radio', { name: '3 октавы' }).click()
  await expect(page.getByText(/Маршрут: C → C → C → C/)).toBeVisible()
  await expect(page.locator('[data-tab-step]')).toHaveCount(22)
})

test('сохраняет профиль и оставляет CAGED на верхних шести струнах восьмиструнной гитары', async ({ page }) => {
  await page.goto('/?section=scales')
  await page.getByRole('button', { name: 'Параметры инструмента' }).click()
  await page.getByRole('button', { name: '8', exact: true }).click()
  await page.getByRole('button', { name: 'Продвинутый' }).click()
  await page.getByRole('button', { name: 'Большой' }).click()
  await page.getByRole('button', { name: 'Растяжка' }).click()
  await page.getByRole('button', { name: 'Закрыть настройки' }).click()
  await expect(page.getByText('8 струн', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /CAGED/ }).click()
  await expect(page.locator('.pattern-chip')).toHaveCount(5)
  await expect(page.locator('.fret-note[data-string-index="0"]')).toHaveCount(0)
  await expect(page.locator('.fret-note[data-string-index="1"]')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('8 струн', { exact: true })).toBeVisible()
  await expect(page.getByText('Профиль · Растяжка')).toBeVisible()
  await page.getByRole('button', { name: 'Параметры инструмента' }).click()
  await expect(page.getByRole('button', { name: 'Продвинутый' })).toHaveClass(/is-active/)
  await expect(page.getByRole('button', { name: 'Большой' })).toHaveClass(/is-active/)
  await expect(page.getByRole('button', { name: 'Растяжка' })).toHaveClass(/is-active/)
})

test('генерирует и фильтрует аккордовые аппликатуры', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Аккорды/ }).click()
  await expect(page.getByRole('heading', { name: 'Диатонические аккорды' })).toBeVisible()
  await expect(page.getByText(/Найдено:/)).toBeVisible()
  await expect(page.locator('.voicing-card').first()).toBeVisible()
  await page.getByText('Фильтры аппликатур', { exact: true }).click()
  await expect(page.getByLabel('Открытые струны')).toBeChecked()
})

test('направление проигрывания не залипает между тональностями', async ({ page }) => {
  // Раньше «Вниз» мелодического минора превращало кнопку проигрыша в «Сыграть
  // вниз» во всём приложении, включая мажор, где переключателя направления нет.
  await page.goto('/?tonic=9&mode=minor&minorVariant=melodic-classical&section=notes')
  await expect(page.locator('.note-strip .note-card strong')).toHaveText([
    'A', 'B', 'C', 'D', 'E', 'F♯', 'G♯',
  ])

  await page.getByRole('button', { name: '↓ Вниз' }).click()
  // Направление по-прежнему решает, какие ноты у тональности…
  await expect(page.locator('.note-strip .note-card strong')).toHaveText([
    'A', 'B', 'C', 'D', 'E', 'F', 'G',
  ])
  // …но кнопки проигрыша всегда обе.
  await expect(page.locator('.play-pair button')).toHaveText([
    '▶Сыграть вверх', '▶Сыграть вниз',
  ])

  await page.getByRole('button', { name: 'C мажор', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'C · До мажор' })).toBeVisible()
  await expect(page.locator('.play-pair button')).toHaveText([
    '▶Сыграть вверх', '▶Сыграть вниз',
  ])
})

test('пояснение к виду минора меняется вместе с выбором', async ({ page }) => {
  await page.goto('/?tonic=9&mode=minor&section=notes')
  await expect(page.locator('.variant-hint')).toContainText('относительного мажора')

  await page.getByRole('button', { name: 'Гармонический' }).click()
  await expect(page.locator('.variant-hint')).toContainText('VII ступень поднята')

  await page.getByRole('button', { name: 'Джазовый' }).click()
  await expect(page.locator('.variant-hint')).toContainText('в обе стороны')

  // В мажоре пояснения нет — не из чего выбирать.
  await page.getByRole('button', { name: 'C мажор', exact: true }).click()
  await expect(page.locator('.variant-hint')).toHaveCount(0)
})

test('мобильная версия не создаёт горизонтальную прокрутку страницы', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: 'Am минор' })).toBeVisible()
})

test('на HD-десктопе круг и состав тональности помещаются в первый экран', async ({ page }) => {
  // Стопка «круг сверху, панель снизу» съедала весь экран 1366×768: панель
  // начиналась ниже 1000px и до неё нужно было скроллить.
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/')

  const box = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) }
    })

  // Две колонки: панель стоит рядом с кругом, а не под ним.
  expect((await box('.details-panel')).top).toBeLessThan(300)
  // Круг помещается по высоте целиком.
  expect((await box('.fifths-circle')).bottom).toBeLessThanOrEqual(768)
  await expect(page.locator('.note-strip')).toBeInViewport()
})

test('на 4K-мониторе интерфейс масштабируется, а не занимает половину экрана', async ({ page }) => {
  // Раскладка упирается в 1760px, поэтому на 4K она занимала 46% ширины
  // подписями по 14px: в CSS-пикселях верно, а глазами — мелко.
  await page.setViewportSize({ width: 3840, height: 2160 })
  await page.goto('/')

  const metrics = await page.evaluate(() => ({
    zoom: getComputedStyle(document.querySelector('.app-shell') as Element).zoom,
    mainWidth: Math.round(document.querySelector('main')!.getBoundingClientRect().width),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))

  expect(Number(metrics.zoom)).toBeGreaterThan(1.5)
  // Больше двух третей ширины экрана вместо 1760px.
  expect(metrics.mainWidth).toBeGreaterThan(2560)
  expect(metrics.overflowX).toBeLessThanOrEqual(1)
  await expect(page.locator('.note-strip')).toBeInViewport()
})

test('мобильная версия: гриф гаммы прокручивается вбок, а таб следует за воспроизведением', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?section=scales')
  await expect(page.getByRole('heading', { name: 'Библиотека аппликатур' })).toBeVisible()

  await page.getByRole('tab', { name: /3NPS/ }).click()
  await page.getByRole('radio', { name: '2 октавы' }).click()
  await expect(page.getByText(/Маршрут: C → C → C/)).toBeVisible()

  // Гриф в фокус-режиме должен прокручиваться по горизонтали, а не сжиматься.
  const board = page.locator('.fretboard-scroll--focused')
  await expect(board).toBeVisible()
  const boardScrollable = await board.evaluate((el) => el.scrollWidth - el.clientWidth > 8)
  expect(boardScrollable).toBe(true)

  // Табулатура шире экрана и должна доскроллиться до играющей ноты.
  const tab = page.locator('.tab-scroll')
  const tabOverflows = await tab.evaluate((el) => el.scrollWidth - el.clientWidth > 8)
  expect(tabOverflows).toBe(true)
  const beforeScroll = await tab.evaluate((el) => el.scrollLeft)

  await page.getByRole('button', { name: 'Сыграть маршрут вверх' }).click()
  await expect
    .poll(async () => tab.evaluate((el) => el.scrollLeft), { timeout: 12000 })
    .toBeGreaterThan(beforeScroll + 8)
})
