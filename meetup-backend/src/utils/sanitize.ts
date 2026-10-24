import xss from 'xss'

const xssOptions = {
  whiteList: {}, // strip all HTML tags
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
}

/**
 * Sanitize a string value against XSS.
 */
export function sanitizeStr(value: string): string {
  return xss(value.trim(), xssOptions)
}

/**
 * Recursively sanitize all string values in an object.
 * Skips fields that are not meant to be displayed as text (passwords, tokens, etc.).
 */
const SKIP_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'refreshToken',
  'accessToken',
  'passwordHash',
])

export function sanitizeInput<T>(input: T): T {
  if (typeof input === 'string') {
    return xss(input.trim(), xssOptions) as unknown as T
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item)) as unknown as T
  }
  if (input !== null && typeof input === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SKIP_KEYS.has(key)) {
        result[key] = value
      } else {
        result[key] = sanitizeInput(value)
      }
    }
    return result as T
  }
  return input
}
