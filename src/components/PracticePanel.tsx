import { useState } from 'react'
import { chromaticNotes, DEGREE_LABELS, scaleDisplayName } from '../music/theory'
import type { BuiltScale, KeySelection, ScaleNote } from '../music/types'
import { currentStep } from '../practice/machine'
import {
  acceptedSignatures,
  checkNoteSlots,
  checkSignature,
  emptyNoteSlots,
  expectedPitchClasses,
  noteSlotsFilled,
  type NoteSlots,
} from '../practice/questions'
import type { PracticeState, StepOutcome } from '../practice/types'
import { useT } from '../i18n'

const SIGNATURE_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7] as const

const CHROMATIC_PITCH_CLASSES = Array.from({ length: 12 }, (_, pitchClass) => pitchClass)

/** The signature answer while it is being assembled: both halves start unset. */
interface DraftSignature {
  count: number | null
  accidental: 'sharp' | 'flat' | null
}

const EMPTY_SIGNATURE: DraftSignature = { count: null, accidental: null }

function spellingsOf(pitchClass: number): { symbols: string; solfege: string; names: string[] } {
  const notes = chromaticNotes(pitchClass)
  return {
    symbols: notes.map((note) => note.symbol).join(' / '),
    solfege: notes.map((note) => note.solfege).join(' / '),
    names: notes.map((note) => note.accessibleName),
  }
}

function ChromaticKeyboard({
  used,
  full,
  onPick,
}: {
  used: NoteSlots
  full: boolean
  onPick: (pitchClass: number) => void
}) {
  const tr = useT()
  return (
    <div className="chromatic-keyboard" role="group" aria-label={tr('practice.keyboardAria')}>
      {CHROMATIC_PITCH_CLASSES.map((pitchClass) => {
        const { symbols, solfege, names } = spellingsOf(pitchClass)
        const taken = used.includes(pitchClass)
        return (
          <button
            type="button"
            key={pitchClass}
            className={names.length > 1 ? 'chromatic-key chromatic-key--altered' : 'chromatic-key'}
            disabled={taken || full}
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

function SignatureQuestion({
  draft,
  onChange,
}: {
  draft: DraftSignature
  onChange: (draft: DraftSignature) => void
}) {
  const tr = useT()
  const noAccidentals = draft.count === 0
  return (
    <div className="signature-question">
      <div>
        <span className="control-label">{tr('practice.signature.count')}</span>
        <div className="practice-chips" role="group" aria-label={tr('practice.signature.count')}>
          {SIGNATURE_COUNTS.map((count) => (
            <button
              type="button"
              key={count}
              className={draft.count === count ? 'practice-chip is-active' : 'practice-chip'}
              aria-pressed={draft.count === count}
              onClick={() => onChange({ ...draft, count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="control-label">{tr('practice.signature.kind')}</span>
        {noAccidentals ? (
          <p className="practice-note">{tr('practice.signature.noneHint')}</p>
        ) : (
          <div className="segmented segmented--small" role="group" aria-label={tr('practice.signature.kind')}>
            <button
              type="button"
              className={draft.accidental === 'sharp' ? 'is-active' : ''}
              aria-pressed={draft.accidental === 'sharp'}
              onClick={() => onChange({ ...draft, accidental: 'sharp' })}
            >
              ♯ {tr('practice.signature.sharps')}
            </button>
            <button
              type="button"
              className={draft.accidental === 'flat' ? 'is-active' : ''}
              aria-pressed={draft.accidental === 'flat'}
              onClick={() => onChange({ ...draft, accidental: 'flat' })}
            >
              ♭ {tr('practice.signature.flats')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SignatureAnswer({ selection }: { selection: KeySelection }) {
  const tr = useT()
  const [primary, ...alternatives] = acceptedSignatures(selection)
  return (
    <div className="signature-answer">
      <span className="eyebrow">{tr('practice.correctAnswer')}</span>
      <strong>{primary?.label}</strong>
      {alternatives.length > 0 && (
        <p className="practice-note">
          {tr('practice.alsoAccepted', {
            answer: alternatives.map((signature) => signature.label).join(', '),
          })}
        </p>
      )}
    </div>
  )
}

function PracticeSteps({ state }: { state: PracticeState }) {
  const tr = useT()
  return (
    <ol className="practice-steps" aria-label={tr('practice.stepsAria')}>
      {state.steps.map((step, index) => (
        <li
          key={step}
          className={index === state.stepIndex ? 'is-active' : index < state.stepIndex ? 'is-done' : ''}
          aria-current={index === state.stepIndex ? 'step' : undefined}
        >
          {tr(`practice.step.${step}`)}
        </li>
      ))}
    </ol>
  )
}

export interface PracticePanelProps {
  state: PracticeState
  scale: BuiltScale
  onSpin: () => void
  onLandNeedle: () => void
  onAnswer: (outcome: StepOutcome) => void
  onNext: () => void
}

export function PracticePanel({
  state,
  scale,
  onSpin,
  onLandNeedle,
  onAnswer,
  onNext,
}: PracticePanelProps) {
  const tr = useT()
  const [signature, setSignature] = useState<DraftSignature>(EMPTY_SIGNATURE)
  const [slots, setSlots] = useState<NoteSlots>(emptyNoteSlots)

  const step = currentStep(state)
  const { selection } = state
  const notes = scale.ascending
  const isLastStep = state.stepIndex === state.steps.length - 1

  const resetInputs = () => {
    setSignature(EMPTY_SIGNATURE)
    setSlots(emptyNoteSlots())
  }

  const startRound = () => {
    resetInputs()
    onSpin()
  }

  const advance = () => {
    resetInputs()
    onNext()
    // The last step rolls straight into the next key: an extra "spin again"
    // screen between every round is pure friction.
    if (isLastStep) onSpin()
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
    step === 'signature'
      ? signature.count !== null && (signature.count === 0 || signature.accidental !== null)
      : noteSlotsFilled(slots)

  const submit = () => {
    if (!selection || !step) return
    if (step === 'signature') {
      const isCorrect =
        signature.count !== null &&
        checkSignature(selection, {
          count: signature.count,
          accidental: signature.count === 0 ? 'natural' : signature.accidental ?? 'sharp',
        })
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
          <button type="button" className="primary-button" onClick={startRound}>
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
          <PracticeSteps state={state} />
          <p className="practice-task">
            {tr(`practice.task.${step}`, { key: scaleDisplayName(scale) })}
          </p>

          {state.phase === 'answering' ? (
            <>
              {step === 'signature' ? (
                <SignatureQuestion draft={signature} onChange={setSignature} />
              ) : (
                <div className="notes-question">
                  <NoteSlotRow slots={slots} onClear={clearSlot} />
                  <p className="practice-note">
                    {tr('practice.slotsFilled', {
                      n: slots.filter((slot) => slot !== null).length,
                      total: slots.length,
                    })}
                  </p>
                  <ChromaticKeyboard
                    used={slots}
                    full={noteSlotsFilled(slots)}
                    onPick={fillSlot}
                  />
                </div>
              )}
              <div className="practice-actions">
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
              </div>
            </>
          ) : (
            <>
              <p className={`practice-verdict practice-verdict--${state.outcome ?? 'skipped'}`}>
                {tr(`practice.verdict.${state.outcome ?? 'skipped'}`)}
              </p>
              {step === 'signature' ? (
                <SignatureAnswer selection={selection} />
              ) : (
                // A correct answer needs no correction table: the regular
                // "seven degrees" strip renders right below with the same notes.
                state.outcome !== 'correct' && <NoteAnswerRow slots={slots} notes={notes} />
              )}
              <div className="practice-actions">
                <button type="button" className="primary-button" onClick={advance}>
                  {isLastStep ? tr('practice.nextRound') : tr('practice.next')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
