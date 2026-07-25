import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { setLang } from '../i18n'

// jsdom reports navigator.language as en-US; pin the suite to Russian so the
// existing (Russian) assertions stay valid regardless of the environment.
setLang('ru')

afterEach(() => cleanup())
