import type { KeyboardEvent } from 'react'
import type { KeySelection, Mode } from '../music/types'
import {
  CIRCLE_MAJOR_PITCHES,
  circleTonicLabel,
  defaultSpellingForMajorPitch,
  getKeySignature,
  getRelativeMajorPitch,
  getRelativeMinorPitch,
  keyDisplayName,
  mod,
} from '../music/theory'

interface CircleOfFifthsProps {
  selection: KeySelection
  onSelect: (selection: KeySelection) => void
}

const COLORS = [
  '#88a91d',
  '#4ba232',
  '#16996a',
  '#099087',
  '#08869e',
  '#2d69af',
  '#5a4faf',
  '#8148ad',
  '#a03b8c',
  '#b4376a',
  '#b5404e',
  '#b35731',
] as const

function polarPoint(cx: number, cy: number, radius: number, angle: number): [number, number] {
  const radians = (angle * Math.PI) / 180
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)]
}

function annularPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const [outerStartX, outerStartY] = polarPoint(cx, cy, outerRadius, startAngle)
  const [outerEndX, outerEndY] = polarPoint(cx, cy, outerRadius, endAngle)
  const [innerEndX, innerEndY] = polarPoint(cx, cy, innerRadius, endAngle)
  const [innerStartX, innerStartY] = polarPoint(cx, cy, innerRadius, startAngle)
  return [
    `M ${outerStartX} ${outerStartY}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEndX} ${outerEndY}`,
    `L ${innerEndX} ${innerEndY}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStartX} ${innerStartY}`,
    'Z',
  ].join(' ')
}

function majorSectorLabel(pitch: number): string {
  if (pitch === 11) return 'B / C♭'
  if (pitch === 6) return 'F♯ / G♭'
  if (pitch === 1) return 'C♯ / D♭'
  return circleTonicLabel(pitch, 'major', defaultSpellingForMajorPitch(pitch))
}

function minorSectorLabel(majorPitch: number): string {
  if (majorPitch === 11) return 'G♯m / A♭m'
  if (majorPitch === 6) return 'D♯m / E♭m'
  if (majorPitch === 1) return 'A♯m / B♭m'
  const minorPitch = getRelativeMinorPitch(majorPitch)
  return `${circleTonicLabel(minorPitch, 'minor', defaultSpellingForMajorPitch(majorPitch))}m`
}

export function CircleOfFifths({ selection, onSelect }: CircleOfFifthsProps) {
  const selectedMajorPitch =
    selection.mode === 'major' ? selection.tonic : getRelativeMajorPitch(selection.tonic)
  const signature = getKeySignature(selection)

  const selectSector = (majorPitch: number, mode: Mode) => {
    const spelling = defaultSpellingForMajorPitch(majorPitch)
    onSelect({
      tonic: mode === 'major' ? majorPitch : getRelativeMinorPitch(majorPitch),
      mode,
      spelling,
    })
  }

  const handleKeyDown = (
    event: KeyboardEvent<SVGGElement>,
    sectorIndex: number,
    mode: Mode,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const pitch = CIRCLE_MAJOR_PITCHES[sectorIndex]
      if (pitch !== undefined) selectSector(pitch, mode)
      return
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const targetIndex = mod(sectorIndex + step, CIRCLE_MAJOR_PITCHES.length)
    const targetPitch = CIRCLE_MAJOR_PITCHES[targetIndex]
    if (targetPitch !== undefined) selectSector(targetPitch, mode)
  }

  return (
    <div className="circle-shell">
      <div className="circle-direction circle-direction--left">
        <span aria-hidden="true">←</span> кварты · бемоли
      </div>
      <div className="circle-direction circle-direction--right">
        квинты · диезы <span aria-hidden="true">→</span>
      </div>
      <svg
        className="fifths-circle"
        viewBox="0 0 600 600"
        role="group"
        aria-label="Кварто-квинтовый круг. Внешнее кольцо — мажор, внутреннее — минор."
      >
        <defs>
          <filter id="circle-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="9" floodColor="#b7ff2a" floodOpacity="0.13" />
            <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#000000" floodOpacity="0.72" />
          </filter>
        </defs>
        <circle cx="300" cy="300" r="282" fill="#090b0e" filter="url(#circle-shadow)" />
        {CIRCLE_MAJOR_PITCHES.map((majorPitch, index) => {
          const centerAngle = -90 + index * 30
          const startAngle = centerAngle - 15
          const endAngle = centerAngle + 15
          const [majorX, majorY] = polarPoint(300, 300, 230, centerAngle)
          const [minorX, minorY] = polarPoint(300, 300, 157, centerAngle)
          const minorPitch = getRelativeMinorPitch(majorPitch)
          const outerSelected = selection.mode === 'major' && selection.tonic === majorPitch
          const innerSelected = selection.mode === 'minor' && selection.tonic === minorPitch
          const sectorSelected = selectedMajorPitch === majorPitch
          const color = COLORS[index] ?? '#ece7df'
          return (
            <g key={majorPitch} className={sectorSelected ? 'circle-sector is-family-selected' : 'circle-sector'}>
              <g
                role="button"
                tabIndex={0}
                aria-label={`${majorSectorLabel(majorPitch)} мажор`}
                aria-pressed={outerSelected}
                onClick={() => selectSector(majorPitch, 'major')}
                onKeyDown={(event) => handleKeyDown(event, index, 'major')}
                className={outerSelected ? 'circle-hit is-selected' : 'circle-hit'}
              >
                <path
                  d={annularPath(300, 300, 190, 280, startAngle, endAngle)}
                  fill={color}
                  className="circle-wedge circle-wedge--major"
                />
                <text
                  x={majorX}
                  y={majorY - 4}
                  textAnchor="middle"
                  className="circle-label circle-label--major"
                  aria-hidden="true"
                >
                  {majorSectorLabel(majorPitch)}
                </text>
                <text
                  x={majorX}
                  y={majorY + 18}
                  textAnchor="middle"
                  className="circle-label circle-label--mode"
                  aria-hidden="true"
                >
                  мажор
                </text>
              </g>
              <g
                role="button"
                tabIndex={0}
                aria-label={`${minorSectorLabel(majorPitch)} минор`}
                aria-pressed={innerSelected}
                onClick={() => selectSector(majorPitch, 'minor')}
                onKeyDown={(event) => handleKeyDown(event, index, 'minor')}
                className={innerSelected ? 'circle-hit is-selected' : 'circle-hit'}
              >
                <path
                  d={annularPath(300, 300, 105, 188, startAngle, endAngle)}
                  fill={color}
                  className="circle-wedge circle-wedge--minor"
                />
                <text
                  x={minorX}
                  y={minorY + 6}
                  textAnchor="middle"
                  className={`circle-label circle-label--minor${[11, 6, 1].includes(majorPitch) ? ' circle-label--enharmonic' : ''}`}
                  aria-hidden="true"
                >
                  {minorSectorLabel(majorPitch)}
                </text>
              </g>
            </g>
          )
        })}
        <circle cx="300" cy="300" r="101" className="circle-center" />
        <text x="300" y="266" textAnchor="middle" className="circle-center__eyebrow">
          выбрана тональность
        </text>
        <text x="300" y="305" textAnchor="middle" className="circle-center__key">
          {keyDisplayName(selection).split(' · ')[0]}
        </text>
        <text x="300" y="331" textAnchor="middle" className="circle-center__mode">
          {selection.mode === 'major' ? 'мажор' : 'минор'}
        </text>
        <text x="300" y="356" textAnchor="middle" className="circle-center__signature">
          {signature.label}
        </text>
      </svg>
      <p className="circle-help">Нажмите внешнюю часть для мажора, внутреннюю — для минора</p>
    </div>
  )
}
