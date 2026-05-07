type LogLevel = 'info' | 'warn' | 'error'

const SECRET_PATTERNS = [/token/i, /key/i, /password/i, /authorization/i, /cookie/i]

function scrubValue(value: unknown): unknown {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(scrubValue)

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
        const shouldRedact = SECRET_PATTERNS.some((pattern) => pattern.test(key))
        return [key, shouldRedact ? '[redacted]' : scrubValue(entryValue)]
      })
    )
  }

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 497)}...` : value
  }

  return value
}

export function logServerEvent(level: LogLevel, event: string, payload: Record<string, unknown> = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    payload: scrubValue(payload),
  })

  if (level === 'error') {
    console.error(entry)
    return
  }

  if (level === 'warn') {
    console.warn(entry)
    return
  }

  console.info(entry)
}
