# musicamustdie

[![CI](https://github.com/mmolotov/musicamustdie/actions/workflows/ci.yml/badge.svg)](https://github.com/mmolotov/musicamustdie/actions/workflows/ci.yml)

An interactive circle of fourths and fifths for guitar: fretboard map, a library of CAGED / positional / 3NPS / one-octave / hybrid two-octave / diagonal fingerings, tablature, diatonic chords, a practice-form generator, and a practice mode that spins the wheel for a random key and drills its signature, notes, fingering and chords with every hint hidden until you answer.

Built with React, TypeScript, and Vite. The app is fully static and needs no application server.

## Requirements

- Node.js 24 LTS (pinned in `.nvmrc`) and npm 11+

## Setup

```bash
nvm use       # switches to the version in .nvmrc
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build     # output in dist/
npm run preview   # serve the production build locally
```

## Tests

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript (tsc -b)
npm test            # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (Playwright)
```
