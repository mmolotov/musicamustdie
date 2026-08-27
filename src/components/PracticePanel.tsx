import { useState, type ReactNode } from 'react'
import { chromaticNotes, DEGREE_LABELS, scaleDisplayName } from '../music/theory'
import {
  buildPentatonic,
  pentatonicDisplayName,
  type PentatonicScale,
} from '../music/pentatonic'
import type { BuiltScale, ChordDefinition, HarmonizedDegree, ScaleNote } from '../music/types'
import { canVisitStep, currentOutcome, currentStep, isSelfChecked } from '../practice/machine'
import {
  checkChord,
  checkNoteSlots,
  emptyNoteSlots,
  expectedPitchClasses,
  noteSlotsFilled,
  TRIAD_QUALITIES,
  type NoteSlots,
} from '../practice/questions'
import type { PracticeState, StepOutcome, TriadQuality } from '../practice/types'
import { useT } from '../i18n'

const CHROMATIC_PITCH_CLASSES = Array.from({ length: 12 }, (_, pitchClass) => pitchClass)

function spellingsOf(pitchClass: number): { symbols: string; solfege: string; names: string[] } {
  const notes = chromaticNotes(pitchClass)
  return {
    symbols: notes.map((note) => note.symbol).join(' / '),
    solfege: notes.map((note) => note.solfege).join(' / '),
    names: notes.map((note) => note.accessibleName),
  }
}

function ChromaticKeyboard({
  isDisabled,
  isSelected,
  onPick,
}: {
  isDisabled: (pitchClass: number) => boolean
  isSelected: (pitchClass: number) => boolean
  onPick: (pitchClass: number) => void
}) {
  const tr = useT()
  return (
    <div className="chromatic-keyboard" role="group" aria-label={tr('practice.keyboardAria')}>
      {CHROMATIC_PITCH_CLASSES.map((pitchClass) => {
        const { symbols, solfege, names } = spellingsOf(pitchClass)
        const classes = ['chromatic-key']
        if (names.length > 1) classes.push('chromatic-key--altered')
        if (isSelected(pitchClass)) classes.push('is-selected')
        return (
          <button
            type="button"
            key={pitchClass}
            className={classes.join(' ')}
            disabled={isDisabled(pitchClass)}
            aria-pressed={isSelected(pitchClass)}
            aria-label={names.join(` ${tr('practice.spellingOr')} `)}
            onClick={() => onPick(pitchClass)}
          >
            <strong>{symbols}</strong>
            {solfege !== symbols && <span>{solfege}</span>}
          </button>
        )
      })}
    </div>
  )
}

function NoteSlotRow({ slots, onClear }: { slots: NoteSlots; onClear: (index: number) => void }) {
  const tr = useT()
  return (
    <div className="note-slots" role="group" aria-label={tr('practice.slotsAria')}>
      {slots.map((slot, index) => (
        <button
          type="button"
          key={DEGREE_LABELS[index]}
          className={slot === null ? 'note-slot' : 'note-slot is-filled'}
          disabled={slot === null}
          onClick={() => onClear(index)}
          aria-label={
            slot === null
              ? tr('practice.slotEmptyAria', { degree: index + 1 })
              : tr('practice.slotFilledAria', {
                  degree: index + 1,
                  note: spellingsOf(slot).names.join(` ${tr('practice.spellingOr')} `),
                })
          }
        >
          <span className="note-slot__degree">{DEGREE_LABELS[index]}</span>
          <strong>{slot === null ? '·' : spellingsOf(slot).symbols}</strong>
        </button>
      ))}
    </div>
  )
}

function NoteAnswerRow({ slots, notes }: { slots: NoteSlots; notes: ScaleNote[] }) {
  const tr = useT()
  const results = checkNoteSlots(slots, expectedPitchClasses(notes))
  return (
    <div className="note-answers" aria-label={tr('practice.correctAnswer')}>
      {notes.map((note, index) => {
        const correct = results[index]
        const entered = slots[index]
        return (
          <div
            className={correct ? 'note-answer is-correct' : 'note-answer is-wrong'}
            key={note.degree}
          >
            <span className="note-answer__degree">{note.degreeLabel}</span>
            <strong>{note.symbol}</strong>
            {note.solfege !== note.symbol && <span>{note.solfege}</span>}
            {!correct && typeof entered === 'number' && <s>{spellingsOf(entered).symbols}</s>}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The key's seven degrees with the two the pentatonic drops greyed out. It is
 * shown before the shape rather than after it: the step asks for the box, not
 * for the notes, so the notes are context and not an answer to withhold.
 */
function PentatonicDegrees({ pentatonic }: { pentatonic: PentatonicScale }) {
  const tr = useT()
  const dropped = new Set(pentatonic.omitted.map((note) => note.degree))

  return (
    <div className="practice-pentatonic">
      <p className="practice-note">{tr('practice.pentatonic.kept')}</p>
      <div className="note-strip note-strip--pentatonic">
        {pentatonic.parent.ascending.map((note) => (
          <div
            className={[
              'note-card',
              note.degree === 1 ? 'is-root' : '',
              dropped.has(note.degree) ? 'is-dropped' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={note.degreeLabel}
          >
            <span className="note-card__degree">{note.degreeLabel}</span>
            <strong>{note.symbol}</strong>
            <span>{note.solfege}</span>
          </div>
        ))}
      </div>
      <p className="practice-note">
        {tr('practice.pentatonic.dropped', {
          notes: pentatonic.omitted.map((note) => note.symbol).join(', '),
        })}
      </p>
    </div>
  )
}

function ChordQuestion({
  root,
  quality,
  onRootChange,
  onQualityChange,
}: {
  root: number | null
  quality: TriadQuality | null
  onRootChange: (pitchClass: number) => void
  onQualityChange: (quality: TriadQuality) => void
}) {
  const tr = useT()
  return (
    <div className="chord-question">
      <span className="control-label">{tr('practice.chord.root')}</span>
      <ChromaticKeyboard
        isDisabled={() => false}
        isSelected={(pitchClass) => pitchClass === root}
        onPick={onRootChange}
      />
      <span className="control-label">{tr('practice.chord.quality')}</span>
      <div className="practice-chips" role="group" aria-label={tr('practice.chord.quality')}>
        {TRIAD_QUALITIES.map((candidate) => (
          <button
            type="button"
            key={candidate}
            className={quality === candidate ? 'practice-chip is-active' : 'practice-chip'}
            aria-pressed={quality === candidate}
            onClick={() => onQualityChange(candidate)}
          >
            {tr(`practice.quality.${candidate}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChordAnswer({ chord }: { chord: ChordDefinition }) {
  const tr = useT()
  return (
    <div className="practice-answer">
      <span className="eyebrow">{tr('practice.correctAnswer')}</span>
      <strong>{chord.roman} · {chord.symbol}</strong>
      <p className="practice-note">
        {chord.qualityLabel} ·{' '}
        {chord.notes
          .map((note) => (note.solfege === note.symbol ? note.symbol : `${note.symbol} (${note.solfege})`))
          .join(' · ')}
      </p>
    </div>
  )
}

/**
 * The steps of the round, and the way back through them: a step already graded
 * can be reopened to look at its answer again, while one still ahead stays
 * shut — jumping forward would hand over an answer that was never earned.
 */
function PracticeSteps({
  state,
  onGoToStep,
}: {
  state: PracticeState
  onGoToStep: (stepIndex: number) => void
}) {
  const tr = useT()
  return (
    <ol className="practice-steps" aria-label={tr('practice.stepsAria')}>
      {state.steps.map((step, index) => {
        const isCurrent = index === state.stepIndex
        return (
          <li
            key={step}
            className={isCurrent ? 'is-active' : index < state.stepIndex ? 'is-done' : ''}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <button
              type="button"
              disabled={!canVisitStep(state, index) || isCurrent}
              title={canVisitStep(state, index) && !isCurrent ? tr('practice.stepBack') : undefined}
              onClick={() => onGoToStep(index)}
            >
              {tr(`practice.step.${step}`)}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Everything the player types during one round, cleared when the key changes. */
interface RoundInputs {
  round: number
  slots: NoteSlots
  chordRoot: number | null
  chordQuality: TriadQuality | null
}

function freshInputs(round: number): RoundInputs {
  return { round, slots: emptyNoteSlots(), chordRoot: null, chordQuality: null }
}

export interface PracticePanelProps {
  state: PracticeState
  scale: BuiltScale
  harmony: HarmonizedDegree[]
  onSpin: () => void
  onLandNeedle: () => void
  /** Runs the same key again — a fresh degree and a fresh fingering. */
  onRepeat: () => void
  onReveal: () => void
  onAnswer: (outcome: StepOutcome) => void
  onNext: () => void
  /** Reopens a step of this round that has already been graded. */
  onGoToStep: (stepIndex: number) => void
  /** The instrument's own step body — the assigned fingering, the shapes. */
  children?: ReactNode
}

export function PracticePanel({
  state,
  scale,
  harmony,
  onSpin,
  onLandNeedle,
  onRepeat,
  onReveal,
  onAnswer,
  onNext,
  onGoToStep,
  children,
}: PracticePanelProps) {
  const tr = useT()
  const [inputs, setInputs] = useState<RoundInputs>(() => freshInputs(state.round))
  // Answers stay put for the length of a round, because a step reopened later
  // has to show what the player actually entered rather than an empty row. A
  // new key — drawn, chosen on the circle or repeated — clears them, and doing
  // it here rather than in an effect keeps the blank row from ever rendering.
  if (inputs.round !== state.round) setInputs(freshInputs(state.round))
  const { slots, chordRoot, chordQuality } = inputs
  const setSlots = (update: (current: NoteSlots) => NoteSlots) =>
    setInputs((current) => ({ ...current, slots: update(current.slots) }))
  const setChordRoot = (root: number | null) =>
    setInputs((current) => ({ ...current, chordRoot: root }))
  const setChordQuality = (quality: TriadQuality | null) =>
    setInputs((current) => ({ ...current, chordQuality: quality }))

  const step = currentStep(state)
  const outcome = currentOutcome(state)
  const { selection } = state
  const notes = scale.ascending
  // Built from the key rather than the drilled scale: the pentatonic ignores
  // the harmonic and melodic alterations, and it drills the key's own flavour.
  const pentatonic = buildPentatonic(scale.selection)
  const chord = harmony[state.chordDegree - 1]?.triad
  const isLastStep = state.stepIndex === state.steps.length - 1

  const advance = () => {
    onNext()
    // The last step rolls straight into the next key: an extra "spin again"
    // screen between every round is pure friction.
    if (isLastStep) onSpin()
  }

  const gradeAndAdvance = (outcome: StepOutcome) => {
    onAnswer(outcome)
    advance()
  }

  const fillSlot = (pitchClass: number) => {
    setSlots((current) => {
      const index = current.indexOf(null)
      if (index === -1) return current
      return current.map((slot, position) => (position === index ? pitchClass : slot))
    })
  }

  const clearSlot = (index: number) => {
    setSlots((current) => current.map((slot, position) => (position === index ? null : slot)))
  }

  const canSubmit =
    step === 'chord' ? chordRoot !== null && chordQuality !== null : noteSlotsFilled(slots)

  const submit = () => {
    if (!selection || !step) return
    if (step === 'chord') {
      const isCorrect =
        chord !== undefined &&
        chordRoot !== null &&
        chordQuality !== null &&
        checkChord(chord, { root: chordRoot, quality: chordQuality })
      onAnswer(isCorrect ? 'correct' : 'wrong')
      return
    }
    const results = checkNoteSlots(slots, expectedPitchClasses(notes))
    onAnswer(results.every(Boolean) ? 'correct' : 'wrong')
  }

  return (
    <section className="practice-panel" aria-labelledby="practice-heading">
      <div className="practice-bar">
        <div>
          <span className="eyebrow">{tr('practice.eyebrow')}</span>
          <h3 id="practice-heading">
            {state.round > 0 ? tr('practice.round', { n: state.round }) : tr('practice.notStarted')}
          </h3>
        </div>
        <dl className="practice-tally" aria-label={tr('practice.tallyAria')}>
          <div>
            <dt>{tr('practice.verdict.correct')}</dt>
            <dd>{state.tally.correct}</dd>
          </div>
          <div>
            <dt>{tr('practice.verdict.wrong')}</dt>
            <dd>{state.tally.wrong}</dd>
          </div>
          <div>
            <dt>{tr('practice.verdict.skipped')}</dt>
            <dd>{state.tally.skipped}</dd>
          </div>
        </dl>
      </div>

      {state.phase === 'idle' && (
        <div className="practice-launch">
          <p>{tr('practice.intro')}</p>
          <button type="button" className="primary-button" onClick={onSpin}>
            {tr('practice.start')}
          </button>
        </div>
      )}

      {state.phase === 'spinning' && (
        <div className="practice-launch">
          <p className="practice-spinning">{tr('practice.spinning')}</p>
          <button type="button" className="secondary-button" onClick={onLandNeedle}>
            {tr('practice.skipSpin')}
          </button>
        </div>
      )}

      {(state.phase === 'answering' || state.phase === 'revealed') && selection && step && (
        <>
          <PracticeSteps state={state} onGoToStep={onGoToStep} />
          <p className="practice-task">
            {tr(`practice.task.${step}`, {
              key: scaleDisplayName(scale),
              pentatonic: pentatonicDisplayName(pentatonic),
              degree: DEGREE_LABELS[state.chordDegree - 1] ?? state.chordDegree,
            })}
          </p>

          {state.phase === 'answering' ? (
            <>
              {step === 'notes' && (
                <div className="notes-question">
                  <NoteSlotRow slots={slots} onClear={clearSlot} />
                  <p className="practice-note">
                    {tr('practice.slotsFilled', {
                      n: slots.filter((slot) => slot !== null).length,
                      total: slots.length,
                    })}
                  </p>
                  <ChromaticKeyboard
                    isDisabled={(pitchClass) =>
                      slots.includes(pitchClass) || noteSlotsFilled(slots)
                    }
                    isSelected={() => false}
                    onPick={fillSlot}
                  />
                </div>
              )}
              {step === 'chord' && (
                <ChordQuestion
                  root={chordRoot}
                  quality={chordQuality}
                  onRootChange={setChordRoot}
                  onQualityChange={setChordQuality}
                />
              )}
              {/* The fretboard steps are played, not answered: the instrument
                  shows the assignment and the player reports back. */}
              {step === 'pentatonic' && (
                <PentatonicDegrees pentatonic={pentatonic} />
              )}
              {isSelfChecked(step) && children}
              <div className="practice-actions">
                {isSelfChecked(step) ? (
                  <button type="button" className="primary-button" onClick={onReveal}>
                    {tr('practice.played')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!canSubmit}
                      onClick={submit}
                    >
                      {tr('practice.check')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onAnswer('skipped')}
                    >
                      {tr('practice.reveal')}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              {outcome !== null && (
                <p className={`practice-verdict practice-verdict--${outcome}`}>
                  {tr(`practice.verdict.${outcome}`)}
                </p>
              )}
              {/* A correct answer needs no correction table: the regular
                  "seven degrees" strip renders right below with the same notes. */}
              {step === 'notes' && outcome !== 'correct' && (
                <NoteAnswerRow slots={slots} notes={notes} />
              )}
              {/* Same rule as the notes step: a correct answer is already
                  spelled out by the chord view that follows. */}
              {step === 'chord' && chord && outcome !== 'correct' && (
                <ChordAnswer chord={chord} />
              )}
              {step === 'pentatonic' && <PentatonicDegrees pentatonic={pentatonic} />}
              {children}
              <div className="practice-actions">
                {isSelfChecked(step) && outcome === null ? (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => gradeAndAdvance('correct')}
                    >
                      {tr('practice.selfCheck.ok')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => gradeAndAdvance('wrong')}
                    >
                      {tr('practice.selfCheck.fail')}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="primary-button" onClick={advance}>
                      {isLastStep ? tr('practice.nextRound') : tr('practice.next')}
                    </button>
                    {isLastStep && (
                      <button type="button" className="secondary-button" onClick={onRepeat}>
                        {tr('practice.again')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
