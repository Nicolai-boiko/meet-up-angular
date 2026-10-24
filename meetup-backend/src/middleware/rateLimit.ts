import rateLimit from 'express-rate-limit'

// 5 попыток входа за 15 минут
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много попыток входа. Попробуйте позже.' },
})

// 3 регистрации в час с одного IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много регистраций. Попробуйте позже.' },
})

// 3 запроса восстановления пароля в час
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много запросов. Попробуйте позже.' },
})

// 5 сбросов пароля за 15 минут
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много попыток. Попробуйте позже.' },
})
