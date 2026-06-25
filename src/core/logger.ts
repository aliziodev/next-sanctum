import type { LogLevel } from "./types"

const PREFIX = "[next-sanctum]"

export interface Logger {
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

/** Leveled logger. logLevel 0 = silent; 3 = info (default). */
export function createLogger(level: LogLevel): Logger {
  const enabled = (threshold: LogLevel) => level >= threshold
  return {
    error: (...args) => {
      if (enabled(1)) console.error(PREFIX, ...args)
    },
    warn: (...args) => {
      if (enabled(2)) console.warn(PREFIX, ...args)
    },
    info: (...args) => {
      if (enabled(3)) console.info(PREFIX, ...args)
    },
    debug: (...args) => {
      if (enabled(4)) console.debug(PREFIX, ...args)
    },
  }
}
