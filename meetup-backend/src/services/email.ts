import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM = process.env.SMTP_FROM || '"MeetUp" <noreply@meetup.local>'
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL}/auth?mode=reset&token=${token}`
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Восстановление пароля — MeetUp',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb;">MeetUp</h2>
        <p>Вы запросили восстановление пароля.</p>
        <p>Нажмите на кнопку ниже, чтобы установить новый пароль:</p>
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #fff;
                  text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Восстановить пароль
        </a>
        <p style="color: #6b7280; font-size: 13px;">
          Ссылка действительна 1 час. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.
        </p>
      </div>
    `,
  })
}

export async function sendMeetingInviteEmail(
  to: string,
  meetingTitle: string,
  startTime: Date,
  _meetingId: number,
): Promise<void> {
  const meetingUrl = `${APP_URL}/schedule`
  const dateStr = startTime.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Приглашение на встречу: ${meetingTitle} — MeetUp`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb;">MeetUp</h2>
        <p>Вас пригласили на встречу <strong>«${meetingTitle}»</strong>.</p>
        <p>📅 ${dateStr}</p>
        <a href="${meetingUrl}"
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #fff;
                  text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Открыть расписание
        </a>
        <p style="color: #6b7280; font-size: 13px;">
          Вы можете принять или отклонить приглашение на странице расписания.
        </p>
      </div>
    `,
  })
}

export async function sendMeetingUpdatedEmail(
  to: string,
  meetingTitle: string,
  startTime: Date,
): Promise<void> {
  const meetingUrl = `${APP_URL}/schedule`
  const dateStr = startTime.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Встреча обновлена: ${meetingTitle} — MeetUp`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2563eb;">MeetUp</h2>
        <p>Встреча <strong>«${meetingTitle}»</strong> была обновлена организатором.</p>
        <p>📅 ${dateStr}</p>
        <a href="${meetingUrl}"
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #fff;
                  text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">
          Открыть расписание
        </a>
      </div>
    `,
  })
}
