import 'dotenv/config'
import nodemailer from 'nodemailer'

let transporter

function getTransporter() {
  if (!transporter) {
    const user = process.env.GMAIL_USER
    const pass = process.env.GMAIL_APP_PASSWORD

    if (!user || !pass) {
      throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set')
    }

    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user,
        pass,
      },
    })
  }
  return transporter
}

export async function sendMail({ to, subject, html, text, attachments }) {
  const info = await getTransporter().sendMail({
    from: `"Bake Off Pool" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
    attachments,
  })
  return info
}
