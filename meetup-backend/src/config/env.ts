const requiredVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
] as const

export function validateEnv(): void {
  const missing: string[] = []

  for (const key of requiredVars) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    console.error(
      `FATAL ERROR: Missing required environment variables:\n  - ${missing.join('\n  - ')}\n` +
        'Copy .env.example to .env and fill in the values.',
    )
    process.exit(1)
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 16) {
    console.error('FATAL ERROR: JWT_SECRET must be at least 16 characters long.')
    process.exit(1)
  }
}
