import { useMemo, useState } from 'react'
import type { FretLocation, PlayableEvent } from '../instruments/types'
import type { GuitarConfig } from '../instruments/guitar'
import { formatOpenString } from '../instruments/guitar'
import type { ScaleDirection } from '../music/types'

interface TablatureProps {
  config: GuitarConfig
  locations: FretLocation[]
  events: PlayableEvent[]
  direction: ScaleDirection
  activeStepIndex?: number | null
  showFingerings?: boolean
  showShifts?: boolean
}

interface TabStep {
  stringIndex: number
  fret: number
  finger?: number
  positionShift?: boolean
  locationId: string
}

function makeTextTab(config: GuitarConfig, steps: TabStep[]): string {
  return [...config.strings]
    .map((openMidi, stringIndex) => ({ openMidi, stringIndex }))
    .reverse()
    .map(({ openMidi, stringIndex }) => {
      const cells = steps.map((step) => (step.stringIndex === stringIndex ? String(step.fret) : '—'))
      return `${formatOpenString(openMidi).padEnd(4, ' ')}|-${cells.join('-')}-|`
    })
    .join('\n')
}

export function Tablature({
  config,
  locations,
  events,
  direction,
  activeStepIndex = null,
  showFingerings = false,
  showShifts = false,
}: TablatureProps) {
  const [copied, setCopied] = useState(false)
  const steps = useMemo(() => {
    const locationsById = new Map(locations.map((location) => [location.id, location]))
    return events.flatMap((event) => {
      const location = event.locationId ? locationsById.get(event.locationId) : undefined
      return location
        ? [{
            stringIndex: location.stringIndex,
            fret: location.fret,
            finger: event.finger ?? location.finger,
            positionShift: event.positionShift,
            locationId: location.id,
          }]
        : []
    })
  }, [events, locations])
  const textTab = useMemo(() => makeTextTab(config, steps), [config, steps])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textTab)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="tab-card">
      <div className="tab-card__header">
        <div>
          <span className="eyebrow">TAB</span>
          <strong>{direction === 'ascending' ? 'Восходящая' : 'Нисходящая'}</strong>
        </div>
        <button type="button" className="text-button" onClick={() => void copy()}>
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <div className="tab-scroll" tabIndex={0} aria-label="Табулатура с горизонтальной прокруткой">
        <div
          className="tab-grid"
          style={{ gridTemplateColumns: `46px repeat(${steps.length}, minmax(24px, 1fr))` }}
        >
          {[...config.strings]
            .map((openMidi, stringIndex) => ({ openMidi, stringIndex }))
            .reverse()
            .flatMap(({ openMidi, stringIndex }) => [
              <div className="tab-grid__label" key={`label-${stringIndex}`}>
                {formatOpenString(openMidi)}
              </div>,
              ...steps.map((step, stepIndex) => (
                <div
                  className={`tab-grid__cell${showShifts && step.positionShift ? ' has-shift' : ''}${activeStepIndex === stepIndex ? ' is-playing' : ''}`}
                  key={`${stringIndex}-${stepIndex}`}
                  data-tab-step={step.stringIndex === stringIndex ? stepIndex : undefined}
                  data-location-id={step.stringIndex === stringIndex ? step.locationId : undefined}
                  data-playing={activeStepIndex === stepIndex && step.stringIndex === stringIndex ? 'true' : undefined}
                >
                  <span>
                    {step.stringIndex === stringIndex ? step.fret : ''}
                    {showFingerings && step.stringIndex === stringIndex && step.finger && (
                      <small aria-label={`палец ${step.finger}`}>{step.finger}</small>
                    )}
                  </span>
                </div>
              )),
            ])}
        </div>
      </div>
    </div>
  )
}
