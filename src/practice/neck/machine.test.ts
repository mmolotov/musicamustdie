import { describe, expect, it } from 'vitest'
import { initialNeckState, NECK_SERIES, neckReducer, summarize } from './machine'
import { zoneCards } from './zone'
import type { NeckAction, NeckCard, NeckState } from './types'

const GUITAR = [40, 45, 50, 55, 59, 64]
const FRETS = 24
const TWO_STRINGS = zoneCards(GUITAR, FRETS, { strings: [0, 1], span: 'low', pool: 'natural' })
const FOURTH_ONLY = zoneCards(GUITAR, FRETS, { strings: [2], span: 'low', pool: 'natural' })

const run = (state: NeckState, ...actions: NeckAction[]) => actions.reduce(neckReducer, state)

/** A session past its sound check, with the first card on screen. */
function started(seed = 5, pool: NeckCard[] = TWO_STRINGS): NeckState {
  return run(
    initialNeckState(seed),
    { type: 'begin', pool, openStrings: GUITAR, frets: FRETS, at: 0 },
    { type: 'heard', midi: 40, at: 500 },
    { type: 'advance', at: 1000 },
  )
}

const answer = (state: NeckState) => state.card?.answers[0]?.midi ?? -1
const cardKey = (state: NeckState) => `${state.card?.stringIndex}:${state.card?.pitchClass}`

/** Plays the card right and moves on. */
function solve(state: NeckState, at: number): NeckState {
  return run(state, { type: 'heard', midi: answer(state), at }, { type: 'advance', at: at + 900 })
}

describe('машина состояний тренажёра грифа', () => {
  it('начинает с саундчека: открытая нижняя струна открывает серию', () => {
    const check = run(initialNeckState(5), {
      type: 'begin',
      pool: TWO_STRINGS,
      openStrings: GUITAR,
      frets: FRETS,
      at: 0,
    })
    expect(check.phase).toBe('check')
    expect(check.card).toBeNull()

    const ready = run(check, { type: 'heard', midi: 40, at: 400 })
    expect(ready.phase).toBe('ready')
    expect(ready.transpose).toBe(0)

    const asking = run(ready, { type: 'advance', at: 1500 })
    expect(asking.phase).toBe('asking')
    expect(asking.position).toBe(1)
    expect(asking.card).not.toBeNull()
    expect(asking.shownAt).toBe(1500)
  })

  it('саундчек принимает сдвинутый строй со второго раза и сдвигает задания', () => {
    const check = run(initialNeckState(5), {
      type: 'begin',
      pool: TWO_STRINGS,
      openStrings: GUITAR,
      frets: FRETS,
      at: 0,
    })
    // Гитара на полтона ниже: первый E♭ — возможно, просто не та струна.
    const once = run(check, { type: 'heard', midi: 39, at: 300 })
    expect(once.phase).toBe('check')
    expect(once.checkHeard).toBe(39)

    const twice = run(once, { type: 'heard', midi: 39, at: 900 })
    expect(twice.phase).toBe('ready')
    expect(twice.transpose).toBe(-1)

    const asking = run(twice, { type: 'advance', at: 2000 })
    const solved = run(asking, { type: 'heard', midi: answer(asking) - 1, at: 3000 })
    expect(solved.phase).toBe('solved')
    expect(solved.tally.correct).toBe(1)
  })

  it('саундчек не принимает за строй далёкую ноту и напоминает, что делать', () => {
    const check = run(
      initialNeckState(5),
      { type: 'begin', pool: TWO_STRINGS, openStrings: GUITAR, frets: FRETS, at: 0 },
      { type: 'heard', midi: 47, at: 300 },
      { type: 'heard', midi: 47, at: 900 },
    )
    expect(check.phase).toBe('check')
    expect(check.checkNagged).toBe(false)
    expect(run(check, { type: 'nag' }).checkNagged).toBe(true)
  })

  it('верная нота закрывает карточку, и следующая выходит сама', () => {
    const asking = started()
    const solved = run(asking, { type: 'heard', midi: answer(asking), at: 2400 })
    expect(solved.phase).toBe('solved')
    expect(solved.verdict).toMatchObject({ kind: 'correct' })
    expect(solved.tally).toEqual({ correct: 1, corrected: 0, revealed: 0 })
    expect(solved.attempts).toEqual([{ card: asking.card, outcome: 'correct', seconds: 1.4 }])

    const next = run(solved, { type: 'advance', at: 3300 })
    expect(next.phase).toBe('asking')
    expect(next.position).toBe(2)
    expect(cardKey(next)).not.toBe(cardKey(asking))
    expect(next.verdict).toBeNull()
  })

  it('ошибка оставляет карточку открытой, а исправление идёт в счёт как исправление', () => {
    const asking = started()
    const missed = run(asking, { type: 'heard', midi: answer(asking) + 1, at: 2000 })
    expect(missed.phase).toBe('asking')
    expect(missed.mistakes).toBe(1)
    expect(missed.verdict).toMatchObject({ kind: 'wrong', semitones: 1 })
    expect(missed.tally.correct).toBe(0)

    const fixed = run(missed, { type: 'heard', midi: answer(asking), at: 3500 })
    expect(fixed.phase).toBe('solved')
    expect(fixed.tally).toEqual({ correct: 0, corrected: 1, revealed: 0 })
    expect(fixed.attempts[0]).toMatchObject({ outcome: 'corrected', seconds: 2.5 })
  })

  it('та же нота октавой выше — не ответ', () => {
    const asking = started()
    const single = asking.card?.answers.length === 1
    const octave = run(asking, { type: 'heard', midi: answer(asking) + (single ? 12 : 24), at: 2000 })
    expect(octave.phase).toBe('asking')
    expect(octave.verdict).toMatchObject({ kind: 'octave' })
  })

  it('после подсказки карточка ждёт ноту, но в счёт идёт как «с подсказкой»', () => {
    const hinted = run(started(), { type: 'hintDue' })
    expect(hinted.phase).toBe('asking')
    expect(hinted.revealed).toBe(true)

    const solved = run(hinted, { type: 'heard', midi: answer(hinted), at: 12000 })
    expect(solved.tally).toEqual({ correct: 0, corrected: 0, revealed: 1 })
  })

  it('пропуск сразу открывает следующую карточку', () => {
    const asking = started()
    const skipped = run(asking, { type: 'skip', at: 4000 })
    expect(skipped.phase).toBe('asking')
    expect(skipped.position).toBe(2)
    expect(skipped.tally.revealed).toBe(1)
    expect(skipped.attempts[0]).toMatchObject({ card: asking.card, outcome: 'revealed' })
  })

  it('серия из десяти карточек кончается итогом, следующая начинается с любой ноты', () => {
    let state = started()
    for (let i = 0; i < NECK_SERIES; i += 1) state = solve(state, 2000 + i * 2000)
    expect(state.phase).toBe('summary')
    expect(state.card).toBeNull()
    expect(summarize(state.attempts)).toEqual({ total: 10, clean: 10, meanSeconds: expect.any(Number) })

    // Нота-сигнал не оценивается: это не ответ на ещё не показанную карточку.
    const again = run(state, { type: 'heard', midi: 47, at: 60000 })
    expect(again.phase).toBe('asking')
    expect(again.position).toBe(1)
    expect(again.attempts).toEqual([])
    expect(again.mistakes).toBe(0)
    expect(again.tally.correct).toBe(10)
  })

  it('мешок переходит из серии в серию: первые четырнадцать карточек все разные', () => {
    let state = started()
    const seen: string[] = []
    while (seen.length < TWO_STRINGS.length) {
      if (state.phase === 'summary') state = run(state, { type: 'heard', midi: 40, at: 0 })
      seen.push(cardKey(state))
      state = solve(state, 0)
    }
    expect(new Set(seen).size).toBe(TWO_STRINGS.length)
  })

  it('тишина ставит на паузу, любая нота продолжает с той же карточки', () => {
    const asking = started()
    const paused = run(asking, { type: 'idle' })
    expect(paused.phase).toBe('paused')

    const resumed = run(paused, { type: 'heard', midi: answer(asking) + 1, at: 90000 })
    expect(resumed.phase).toBe('asking')
    expect(cardKey(resumed)).toBe(cardKey(asking))
    expect(resumed.mistakes).toBe(0)
    expect(resumed.shownAt).toBe(90000)
  })

  it('смена зоны посреди карточки пересдаёт её, не сдвигая серию', () => {
    const asking = run(started(), { type: 'heard', midi: 30, at: 2000 })
    expect(asking.mistakes).toBe(1)

    const rezoned = run(asking, { type: 'zone', pool: FOURTH_ONLY, at: 5000 })
    expect(rezoned.phase).toBe('asking')
    expect(rezoned.position).toBe(asking.position)
    expect(rezoned.card?.stringIndex).toBe(2)
    expect(rezoned.mistakes).toBe(0)
    expect(rezoned.verdict).toBeNull()
    expect(rezoned.shownAt).toBe(5000)

    // И все следующие — тоже из новой зоны.
    let state = rezoned
    for (let i = 0; i < 5; i += 1) {
      state = solve(state, 6000 + i * 1000)
      expect(state.card?.stringIndex).toBe(2)
    }
  })

  it('смена зоны между карточками действует со следующей', () => {
    const asking = started()
    const solved = run(asking, { type: 'heard', midi: answer(asking), at: 2000 })
    const next = run(solved, { type: 'zone', pool: FOURTH_ONLY, at: 2100 }, { type: 'advance', at: 2900 })
    expect(next.position).toBe(2)
    expect(next.card?.stringIndex).toBe(2)
  })

  it('одинаковый seed воспроизводит ту же серию', () => {
    const sequence = (seed: number) => {
      let state = started(seed)
      const keys: string[] = []
      for (let i = 0; i < 8; i += 1) {
        keys.push(cardKey(state))
        state = solve(state, 0)
      }
      return keys
    }
    expect(sequence(21)).toEqual(sequence(21))
    expect(sequence(21)).not.toEqual(sequence(22))
  })

  it('стоп возвращает к началу и обнуляет счёт', () => {
    const stopped = run(solve(started(), 2000), { type: 'stop' })
    expect(stopped.phase).toBe('idle')
    expect(stopped.tally).toEqual({ correct: 0, corrected: 0, revealed: 0 })
    expect(stopped.card).toBeNull()
  })

  it('не начинает сессию без карточек и не слушает ноты до её начала', () => {
    const idle = initialNeckState(5)
    expect(run(idle, { type: 'begin', pool: [], openStrings: GUITAR, frets: FRETS, at: 0 })).toBe(idle)
    expect(run(idle, { type: 'heard', midi: 40, at: 0 })).toBe(idle)
    expect(run(idle, { type: 'advance', at: 0 })).toBe(idle)
  })
})
