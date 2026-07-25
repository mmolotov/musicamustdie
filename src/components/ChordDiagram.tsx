import type { GuitarConfig, GuitarVoicing } from '../instruments/guitar'
import { formatOpenString } from '../instruments/guitar'
import { useT } from '../i18n'

interface ChordDiagramProps {
  config: GuitarConfig
  voicing: GuitarVoicing
  chordSymbol: string
  showFingerings: boolean
}

export function ChordDiagram({
  config,
  voicing,
  chordSymbol,
  showFingerings,
}: ChordDiagramProps) {
  const tr = useT()
  const spacingX = 30
  const spacingY = 28
  const paddingX = 34
  const diagramWidth = paddingX * 2 + (config.strings.length - 1) * spacingX
  const baseFret = voicing.position > 1 ? voicing.position : 1
  const fretRows = 5
  const diagramHeight = 50 + fretRows * spacingY + 32
  const isLeft = config.handedness === 'left'
  const stringX = (stringIndex: number) => {
    const visualIndex = isLeft ? stringIndex : config.strings.length - 1 - stringIndex
    return paddingX + visualIndex * spacingX
  }
  const fretY = (fret: number) => 42 + (fret - baseFret + 0.5) * spacingY

  return (
    <figure className="chord-diagram" aria-label={tr('chord.diagramAria', { chord: chordSymbol })}>
      <svg
        viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
        role="img"
        aria-label={tr('chord.voicingAria', { chord: chordSymbol, inversion: voicing.inversionLabel, position: voicing.position })}
      >
        {Array.from({ length: config.strings.length }, (_, stringIndex) => {
          const x = stringX(stringIndex)
          const fret = voicing.frets[stringIndex] ?? -1
          return (
            <g key={`string-${stringIndex}`}>
              <line x1={x} x2={x} y1="42" y2={42 + fretRows * spacingY} className="chord-svg__line" />
              <text x={x} y="26" textAnchor="middle" className="chord-svg__status">
                {fret < 0 ? '×' : fret === 0 ? '○' : ''}
              </text>
              <text
                x={x}
                y={42 + fretRows * spacingY + 22}
                textAnchor="middle"
                className="chord-svg__string"
              >
                {formatOpenString(config.strings[stringIndex] ?? 40).replace(/\d+$/, '')}
              </text>
            </g>
          )
        })}

        {Array.from({ length: fretRows + 1 }, (_, row) => (
          <line
            key={`fret-${row}`}
            x1={paddingX}
            x2={diagramWidth - paddingX}
            y1={42 + row * spacingY}
            y2={42 + row * spacingY}
            className={row === 0 && baseFret === 1 ? 'chord-svg__nut' : 'chord-svg__fret'}
          />
        ))}

        {baseFret > 1 && (
          <text x="8" y={fretY(baseFret) + 4} className="chord-svg__base-fret">
            {baseFret}
          </text>
        )}

        {showFingerings &&
          voicing.barres.map((barre) => (
            <line
              key={`barre-${barre.fret}-${barre.fromString}`}
              x1={stringX(barre.fromString)}
              x2={stringX(barre.toString)}
              y1={fretY(barre.fret)}
              y2={fretY(barre.fret)}
              className="chord-svg__barre"
            />
          ))}

        {voicing.frets.map((fret, stringIndex) => {
          if (fret <= 0 || fret < baseFret || fret >= baseFret + fretRows) return null
          const finger = voicing.fingers[stringIndex]
          return (
            <g key={`finger-${stringIndex}`}>
              <circle cx={stringX(stringIndex)} cy={fretY(fret)} r="10" className="chord-svg__finger" />
              {showFingerings && finger !== null && (
                <text
                  x={stringX(stringIndex)}
                  y={fretY(fret) + 4}
                  textAnchor="middle"
                  className="chord-svg__finger-label"
                >
                  {finger}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption>
        <strong>{voicing.inversionLabel}</strong>
        <span>{voicing.position === 0 ? tr('chord.openPosition') : tr('chord.fret', { n: voicing.position })}</span>
      </figcaption>
      <div className="chord-mini-tab" aria-label={tr('chord.tabAria')}>
        {[...config.strings]
          .map((openMidi, stringIndex) => ({ openMidi, stringIndex }))
          .reverse()
          .map(({ openMidi, stringIndex }) => (
            <div key={`tab-${stringIndex}`}>
              <span>{formatOpenString(openMidi)}</span>
              <code>|—{(voicing.frets[stringIndex] ?? -1) < 0 ? 'x' : voicing.frets[stringIndex]}—|</code>
            </div>
          ))}
      </div>
    </figure>
  )
}
