import { expect, test, type Page } from '@playwright/test'
import {
  BASS_TUNING,
  cardOnScreen,
  pluck,
  plugInVirtualGuitar,
  refuseMicrophone,
} from './helpers/virtualGuitar'

const feedback = (page: Page) => page.locator('.neck-feedback')
const tally = (page: Page) => page.locator('.practice-tally dd')
const marks = (page: Page, tone?: 'hint' | 'correct' | 'wrong') =>
  page.locator(`.neck-board .fret-note${tone ? `.is-${tone}` : ''}`)
const stringChip = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cardHeading = (page: Page, n: number) =>
  page.getByRole('heading', { name: `Карточка ${n} из 10` })

/** Opens the microphone and passes the sound check on the lowest open string. */
async function startSession(page: Page, openString = 40) {
  await page.getByRole('button', { name: 'Начать' }).click()
  await expect(page.getByRole('heading', { name: 'Саундчек' })).toBeVisible()
  // The first 0.7 s of the stream only measures the room; a note played into
  // that stretch would be taken for part of it.
  await page.waitForTimeout(1000)
  await pluck(page, openString)
}

test('гриф без рук: саундчек, верная нота, ошибка с исправлением, подсказка, пропуск и итог', async ({ page }) => {
  await plugInVirtualGuitar(page)
  await page.goto('/?practice=neck&seed=7')

  // Дисциплина про инструмент, а не про тональность: круга и вкладок нет.
  await expect(page.locator('.circle-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toHaveCount(0)
  await expect(page).toHaveTitle(/Гриф · Тренировка/)
  await expect(page.getByRole('heading', { name: 'Ноты на грифе' })).toBeVisible()
  // До начала гриф — карта зоны: натуральные ноты на двенадцати ладах шести струн.
  await expect(marks(page)).toHaveCount(48)

  await startSession(page)
  await expect(feedback(page)).toHaveText('Слышу E2 — поехали')

  // Подписи с грифа ушли: теперь это вопрос.
  await expect(cardHeading(page, 1)).toBeVisible()
  await expect(marks(page)).toHaveCount(0)
  await expect(feedback(page)).toHaveText('Сыграйте эту ноту')

  // Карточка 1 — с первого раза; следующая выходит сама.
  const first = await cardOnScreen(page)
  await pluck(page, first.midi)
  await expect(tally(page).first()).toHaveText('1')
  await expect(cardHeading(page, 2)).toBeVisible()

  // Карточка 2 — на лад выше нужного: подсказка направления и точка на грифе.
  const second = await cardOnScreen(page)
  await pluck(page, second.midi + 1, 0.3)
  await expect(feedback(page)).toContainText('нужно на 1 лад ниже')
  await expect(marks(page, 'wrong')).toHaveCount(1)
  await expect(cardHeading(page, 2)).toBeVisible()
  // Одна нота за раз: неверная должна отзвучать.
  await page.waitForTimeout(500)
  await pluck(page, second.midi)
  await expect(tally(page).nth(1)).toHaveText('1')

  // Карточка 3 — подсказка по пробелу: гриф показывает клетку и ждёт её.
  await expect(cardHeading(page, 3)).toBeVisible()
  const third = await cardOnScreen(page)
  // Фокус на чипе струны: пробел всё равно даёт подсказку, а не выключает струну.
  await stringChip(page, '6-я струна, E').focus()
  await page.keyboard.press('Space')
  await expect(feedback(page)).toContainText('— сыграйте')
  await expect(marks(page, 'hint')).not.toHaveCount(0)
  await expect(stringChip(page, '6-я струна, E')).toHaveAttribute('aria-pressed', 'true')
  await expect(cardHeading(page, 3)).toBeVisible()
  await pluck(page, third.midi)
  await expect(tally(page).nth(2)).toHaveText('1')

  // Остальные пропускаем стрелкой — так же работает педаль.
  for (let card = 4; card <= 10; card += 1) {
    await expect(cardHeading(page, card)).toBeVisible()
    await page.keyboard.press('ArrowRight')
  }
  await expect(page.getByRole('heading', { name: 'Серия окончена' })).toBeVisible()
  await expect(page.locator('.neck-prompt')).toHaveText('1/ 10')
  await expect(tally(page).nth(2)).toHaveText('8')
  // На грифе остаётся то, что не вышло с первого раза.
  await expect(marks(page, 'wrong')).not.toHaveCount(0)

  // Любая нота запускает следующую серию; счёт сессии не обнуляется.
  await pluck(page, 45)
  await expect(cardHeading(page, 1)).toBeVisible()
  await expect(tally(page).first()).toHaveText('1')

  await page.getByRole('button', { name: 'Остановить' }).click()
  await expect(page.getByRole('heading', { name: 'Ноты на грифе' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible()
})

test('зона: струны на сегодня сохраняются и меняются посреди серии', async ({ page }) => {
  await plugInVirtualGuitar(page)
  await page.goto('/?practice=neck&seed=11')

  // «Сегодня — пятая и шестая».
  for (const name of ['4-я струна, D', '3-я струна, G', '2-я струна, B', '1-я струна, E']) {
    await stringChip(page, name).click()
    await expect(stringChip(page, name)).toHaveAttribute('aria-pressed', 'false')
  }
  await expect(marks(page)).toHaveCount(16)
  await expect(page.locator('.neck-board .is-muted')).toHaveCount(4)
  await page.getByRole('group', { name: 'Подсказка через' }).getByRole('button', { name: '5 с' }).click()

  // Выбор переживает перезагрузку.
  await page.reload()
  await expect(stringChip(page, '6-я струна, E')).toHaveAttribute('aria-pressed', 'true')
  await expect(stringChip(page, '4-я струна, D')).toHaveAttribute('aria-pressed', 'false')
  await expect(marks(page)).toHaveCount(16)

  // Последнюю струну выключить нельзя.
  await stringChip(page, '6-я струна, E').click()
  await stringChip(page, '5-я струна, A').click()
  await expect(stringChip(page, '5-я струна, A')).toHaveAttribute('aria-pressed', 'true')
  await stringChip(page, '6-я струна, E').click()

  await startSession(page)
  for (let card = 1; card <= 3; card += 1) {
    await expect(cardHeading(page, card)).toBeVisible()
    const asked = await cardOnScreen(page)
    expect([5, 6]).toContain(asked.stringNumber)
    await pluck(page, asked.midi)
    await expect(tally(page).first()).toHaveText(String(card))
  }

  // Нет ответа — через пять секунд гриф сам показывает клетку.
  await expect(cardHeading(page, 4)).toBeVisible()
  await expect(marks(page, 'hint')).toHaveCount(0)
  await expect(marks(page, 'hint')).not.toHaveCount(0, { timeout: 8000 })
  await expect(feedback(page)).toContainText('— сыграйте')

  // «Завтра — только четвёртая»: карточка на экране пересдаётся, серия не сдвигается.
  await stringChip(page, '4-я струна, D').click()
  await stringChip(page, '6-я струна, E').click()
  await stringChip(page, '5-я струна, A').click()
  await expect(page.locator('.neck-sub')).toHaveText('4-я струна')
  await expect(cardHeading(page, 4)).toBeVisible()
  await expect(marks(page, 'hint')).toHaveCount(0)
  await expect(page.locator('.neck-board .is-muted')).toHaveCount(5)
})

test('на басу четыре струны, и саундчек ждёт его нижнюю E', async ({ page }) => {
  await plugInVirtualGuitar(page)
  await page.goto('/?practice=neck&instrument=bass-guitar&seed=3')

  await expect(page.locator('.neck-zone .practice-chip')).toHaveCount(4)
  await expect(stringChip(page, '4-я струна, E')).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Начать' }).click()
  await expect(page.locator('.neck-sub')).toHaveText('открытая 4-я струна')
  await expect(page.locator('.neck-board .fretboard__string')).toHaveCount(4)
  await page.waitForTimeout(1000)
  await pluck(page, 28)
  await expect(cardHeading(page, 1)).toBeVisible()

  const asked = await cardOnScreen(page, BASS_TUNING)
  await pluck(page, asked.midi)
  await expect(tally(page).first()).toHaveText('1')
})

test('вход можно выбрать, и выбор запоминается', async ({ page }) => {
  await plugInVirtualGuitar(page, ['Встроенный микрофон', 'Аудиоинтерфейс'])
  await page.goto('/?practice=neck&seed=5')
  await startSession(page)
  await expect(cardHeading(page, 1)).toBeVisible()

  // Первый раз — вход по умолчанию.
  expect(await page.evaluate(() => window.__requestedInputs)).toEqual([null])
  const input = page.getByRole('combobox', { name: 'Вход' })
  await expect(input.locator('option')).toHaveText(['Встроенный микрофон', 'Аудиоинтерфейс'])

  await input.selectOption({ label: 'Аудиоинтерфейс' })
  await expect(input).toHaveValue('input-1')
  expect(await page.evaluate(() => window.__requestedInputs)).toEqual([null, 'input-1'])

  // Новый вход — новая комната: шум меряется заново, и ноты снова слышны.
  await page.waitForTimeout(1000)
  const asked = await cardOnScreen(page)
  await pluck(page, asked.midi)
  await expect(tally(page).first()).toHaveText('1')

  // В следующий раз тренажёр сразу просит тот же вход.
  await page.reload()
  await startSession(page)
  await expect(cardHeading(page, 1)).toBeVisible()
  expect(await page.evaluate(() => window.__requestedInputs)).toEqual(['input-1'])
})

test('без доступа к микрофону тренажёр объясняет, что делать, а тональности работают', async ({ page }) => {
  await refuseMicrophone(page)
  await page.goto('/?practice=neck')

  await page.getByRole('button', { name: 'Начать' }).click()
  await expect(page.getByRole('alert')).toContainText('Браузер не дал доступ к микрофону')
  // Сессия не началась: кнопка на месте, можно попробовать ещё раз.
  await expect(page.getByRole('button', { name: 'Начать' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Ноты на грифе' })).toBeVisible()

  await page.getByRole('button', { name: 'Тональности', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Крутить барабан' })).toBeVisible()
})

test('переключатель дисциплин: адрес, круг и выход из тренировки', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click()

  // По умолчанию — тональности: круг с барабаном на месте.
  await expect(page).toHaveURL(/practice=1/)
  await expect(page.locator('.circle-panel')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Тональности', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Переключатель стоит над панелями и не двигается: две дисциплины раскладывают
  // страницу по-разному, и кнопка не должна уезжать из-под курсора.
  const spots = async () => [
    await page.getByRole('button', { name: 'Тональности', exact: true }).boundingBox(),
    await page.getByRole('button', { name: 'Гриф', exact: true }).boundingBox(),
  ]
  const before = await spots()
  const panel = await page.locator('.details-panel').boundingBox()
  expect(before[1]?.y ?? 0).toBeLessThan(panel?.y ?? 0)

  await page.getByRole('button', { name: 'Гриф', exact: true }).click()
  await expect(page).toHaveURL(/practice=neck/)
  expect(await spots()).toEqual(before)
  await expect(page).not.toHaveURL(/minorVariant/)
  await expect(page.locator('.circle-panel')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ноты на грифе' })).toBeVisible()
  // Инструмент и его параметры остаются под рукой: строй здесь важнее всего.
  await expect(page.getByRole('button', { name: 'Параметры инструмента' })).toBeVisible()

  await page.getByRole('button', { name: 'Тональности', exact: true }).click()
  await expect(page).toHaveURL(/practice=1/)
  await expect(page.locator('.circle-panel')).toBeVisible()
  expect(await spots()).toEqual(before)

  await page.getByRole('button', { name: 'Выйти из тренировки' }).click()
  await expect(page.getByRole('button', { name: /Гамма и TAB/ })).toBeVisible()
})

test('смена строя в параметрах перестраивает зону под новый инструмент', async ({ page }) => {
  await page.goto('/?practice=neck')
  await expect(page.locator('.neck-zone .practice-chip')).toHaveCount(6)

  await page.getByRole('button', { name: 'Параметры инструмента' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '7', exact: true }).click()
  await page.getByRole('button', { name: 'Закрыть настройки' }).click()

  await expect(page.locator('.neck-zone .practice-chip')).toHaveCount(7)
  await expect(stringChip(page, '7-я струна, B')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.neck-board .fretboard__string')).toHaveCount(7)
})

test('английский интерфейс тренажёра', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await page.goto('/?practice=neck')

  await expect(page.getByRole('heading', { name: 'Notes on the neck' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fretboard', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'String 6, E', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await context.close()
})
