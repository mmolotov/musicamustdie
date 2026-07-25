import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import type { FretLocation, PlayableEvent } from '../instruments/types'
import type { FretboardLabelMode, GuitarConfig } from '../instruments/guitar'
import { formatOpenString } from '../instruments/guitar'
import { useT } from '../i18n'

interface FretboardViewport {
  fromFret: number
  toFret: number
}

interface FretboardProps {
  config: GuitarConfig
  locations: FretLocation[]
  labelMode: FretboardLabelMode
  onPlayNote: (midi: number) => void
  compact?: boolean
  activeLocationId?: string | null
  activeStepIndex?: number | null
  routeLocationIds?: readonly string[]
  routeEvents?: readonly PlayableEvent[]
  viewport?: FretboardViewport
  showFingerings?: boolean
  showShifts?: boolean
}

const MARKER_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21, 24])

export function Fretboard({
  config,
  locations,
  labelMode,
  onPlayNote,
  compact = false,
  activeLocationId = null,
  activeStepIndex = null,
  routeLocationIds,
  routeEvents = [],
  viewport,
  showFingerings = false,
  showShifts = false,
}: FretboardProps) {
  const tr = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const viewFrom = Math.max(0, Math.min(viewport?.fromFret ?? 0, config.frets))
  const viewTo = Math.max(viewFrom, Math.min(viewport?.toFret ?? config.frets, config.frets))
  const focused = viewport !== undefined
  const firstFretted = Math.max(1, viewFrom)
  const visibleFretCount = Math.max(1, viewTo - firstFretted + 1)
  const includesOpen = viewFrom === 0
  const stringSpacing = compact ? 40 : 43
  const fretWidth = focused ? 112 : compact ? 48 : 52
  const labelWidth = includesOpen ? 66 : 54
  const paddingY = 42
  const boardStartNatural = labelWidth
  const boardEndNatural = boardStartNatural + visibleFretCount * fretWidth
  const width = boardEndNatural + 22
  const height = paddingY * 2 + (config.strings.length - 1) * stringSpacing
  const isLeft = config.handedness === 'left'
  const markerRadius = focused ? 16 : 13
  const activeEvent = activeStepIndex === null ? undefined : routeEvents[activeStepIndex]
  const resolvedActiveLocationId = activeEvent?.locationId ?? activeLocationId
  const routeEventByLocation = useMemo(() => {
    const result = new Map<string, PlayableEvent>()
    routeEvents.forEach((event) => {
      if (event.locationId && !result.has(event.locationId)) result.set(event.locationId, event)
    })
    return result
  }, [routeEvents])

  const mirrorX = (naturalX: number) => isLeft ? width - naturalX : naturalX
  const boundaryX = (boundaryIndex: number) =>
    mirrorX(boardStartNatural + boundaryIndex * fretWidth)
  const locationX = (fret: number) => {
    if (fret === 0) return mirrorX(28)
    return mirrorX(boardStartNatural + (fret - firstFretted + 0.5) * fretWidth)
  }
  const stringY = (stringIndex: number) =>
    paddingY + (config.strings.length - 1 - stringIndex) * stringSpacing

  const visibleLocations = locations.filter((location) =>
    location.fret === 0
      ? includesOpen
      : location.fret >= firstFretted && location.fret <= viewTo,
  )

  const handleMarkerKey = (event: KeyboardEvent<SVGGElement>, midi: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlayNote(midi)
    }
  }

  useEffect(() => {
    if (!resolvedActiveLocationId || !scrollRef.current) return
    const scroller = scrollRef.current
    const marker = scroller.querySelector<SVGGElement>(
      `[data-location-id="${resolvedActiveLocationId}"]`,
    )
    if (!marker || typeof scroller.scrollTo !== 'function') return

    const markerBox = marker.getBoundingClientRect()
    const scrollerBox = scroller.getBoundingClientRect()
    const edgePadding = 54
    const isOutside =
      markerBox.left < scrollerBox.left + edgePadding ||
      markerBox.right > scrollerBox.right - edgePadding
    if (!isOutside) return

    scroller.scrollTo({
      left:
        scroller.scrollLeft +
        markerBox.left -
        scrollerBox.left -
        scroller.clientWidth / 2 +
        markerBox.width / 2,
      behavior: 'smooth',
    })
  }, [resolvedActiveLocationId])

  const boardLeft = Math.min(mirrorX(boardStartNatural), mirrorX(boardEndNatural))

  return (
    <div
      ref={scrollRef}
      className={`fretboard-scroll${focused ? ' fretboard-scroll--focused' : ''}`}
      tabIndex={0}
      aria-label={tr('fretboard.mapAria')}
    >
      <svg
        className={`fretboard${focused ? ' fretboard--focused' : ''}`}
        width={width}
        height={height + 28}
        viewBox={`0 0 ${width} ${height + 28}`}
        role="group"
        aria-label={tr('fretboard.boardAria', { strings: config.strings.length, from: viewFrom, to: viewTo })}
      >
        <rect
          x={boardLeft}
          y={paddingY - 18}
          width={boardEndNatural - boardStartNatural}
          height={(config.strings.length - 1) * stringSpacing + 36}
          rx="12"
          className="fretboard__wood"
        />

        {Array.from({ length: visibleFretCount + 1 }, (_, boundaryIndex) => (
          <line
            key={`boundary-${boundaryIndex}`}
            x1={boundaryX(boundaryIndex)}
            x2={boundaryX(boundaryIndex)}
            y1={paddingY - 18}
            y2={height - paddingY + 18}
            className={includesOpen && boundaryIndex === 0 ? 'fretboard__nut' : 'fretboard__fret'}
          />
        ))}

        {config.strings.map((openMidi, stringIndex) => {
          const y = stringY(stringIndex)
          const thickness = 1 + (config.strings.length - stringIndex) * 0.22
          return (
            <g key={`string-${stringIndex}`}>
              <line
                x1={isLeft ? boardLeft : 16}
                x2={isLeft ? width - 16 : boardLeft + boardEndNatural - boardStartNatural}
                y1={y}
                y2={y}
                strokeWidth={thickness}
                className="fretboard__string"
              />
              <text
                x={isLeft ? width - 7 : 7}
                y={y + 4}
                textAnchor={isLeft ? 'end' : 'start'}
                className="fretboard__string-label"
              >
                {formatOpenString(openMidi)}
              </text>
            </g>
          )
        })}

        {Array.from({ length: visibleFretCount }, (_, index) => firstFretted + index).map((fret) => {
          const x = locationX(fret)
          const double = fret === 12 || fret === 24
          return (
            <g key={`marker-${fret}`} aria-hidden="true">
              {MARKER_FRETS.has(fret) && (
                <>
                  <circle cx={x} cy={height - 5} r="3" className="fretboard__position-marker" />
                  {double && <circle cx={x} cy={24} r="3" className="fretboard__position-marker" />}
                </>
              )}
              <text x={x} y={height + 22} textAnchor="middle" className="fretboard__fret-label">
                {fret}
              </text>
            </g>
          )
        })}

        {visibleLocations.map((location) => {
          const routeEvent = routeEventByLocation.get(location.id)
          const finger = routeEvent?.finger ?? location.finger
          const label = labelMode === 'degrees' ? String(location.degree) : location.note.symbol
          const root = location.degree === 1
          const isPlaying = resolvedActiveLocationId === location.id
          const isOnRoute = routeLocationIds?.includes(location.id) ?? false
          const isContext = routeLocationIds !== undefined && !isOnRoute
          const hasShift = showShifts && Boolean(routeEvent?.positionShift)
          const x = locationX(location.fret)
          const y = stringY(location.stringIndex)
          return (
            <g
              key={location.id}
              data-location-id={location.id}
              data-string-index={location.stringIndex}
              data-playing={isPlaying ? 'true' : undefined}
              data-finger={showFingerings && finger ? finger : undefined}
              role="button"
              tabIndex={0}
              aria-label={tr('fretboard.noteAria', {
                note: location.note.accessibleName,
                stringNumber: config.strings.length - location.stringIndex,
                fret: location.fret,
                finger: finger ? tr('fretboard.fingerSuffix', { n: finger }) : '',
              })}
              className={`fret-note${root ? ' is-root' : ''}${isPlaying ? ' is-playing' : ''}${isContext ? ' is-context' : ''}${isOnRoute ? ' is-route' : ''}${hasShift ? ' has-shift' : ''}`}
              onClick={() => onPlayNote(location.midi)}
              onKeyDown={(event) => handleMarkerKey(event, location.midi)}
            >
              {hasShift && (
                <circle cx={x} cy={y} r={markerRadius + 5} className="fret-note__shift-ring" aria-hidden="true" />
              )}
              {isPlaying && (
                <circle cx={x} cy={y} r={markerRadius + 5} className="fret-note__pulse" aria-hidden="true" />
              )}
              <circle cx={x} cy={y} r={markerRadius} className="fret-note__marker" />
              <text x={x} y={y + 4} textAnchor="middle" aria-hidden="true">
                {label}
              </text>
              {showFingerings && finger && (
                <g className="fret-note__finger" aria-hidden="true">
                  <circle cx={x + markerRadius - 1} cy={y - markerRadius + 1} r="7" />
                  <text x={x + markerRadius - 1} y={y - markerRadius + 4} textAnchor="middle">{finger}</text>
                </g>
              )}
              <title>{tr('fretboard.title', {
                note: location.note.symbol,
                solfege: location.note.solfege,
                fret: location.fret,
                finger: finger ? tr('fretboard.titleFinger', { n: finger }) : '',
                shift: hasShift ? ` · ${tr('fretboard.shift')}` : '',
              })}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
