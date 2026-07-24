import type { InstrumentModule } from './types'

const modules = new Map<string, InstrumentModule<unknown>>()

export function registerInstrument<Config>(module: InstrumentModule<Config>): void {
  if (modules.has(module.id)) {
    throw new Error(`Инструмент с id «${module.id}» уже зарегистрирован`)
  }
  modules.set(module.id, module as InstrumentModule<unknown>)
}

export function replaceInstrument<Config>(module: InstrumentModule<Config>): void {
  modules.set(module.id, module as InstrumentModule<unknown>)
}

export function getInstrument(id: string): InstrumentModule<unknown> | undefined {
  return modules.get(id)
}

export function listInstruments(): InstrumentModule<unknown>[] {
  return [...modules.values()]
}

export function clearInstrumentRegistry(): void {
  modules.clear()
}
