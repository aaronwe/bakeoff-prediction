import 'dotenv/config'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'
import { sendMail } from './lib/mailer.mjs'
import { buildAdminReminderHtml } from './lib/emailTemplates.mjs'

async function main() {
  const { data: episode, error: episodeError } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (episodeError) throw episodeError

  if (!episode) {
    console.log('No open episode — nothing to score.')
    return
  }

  const { data: admins, error: adminsError } = await supabaseAdmin.from('admins').select('email')
  if (adminsError) throw adminsError

  const html = buildAdminReminderHtml({ episode, kind: 'scoring-day' })
  for (const admin of admins ?? []) {
    await sendMail({ to: admin.email, subject: 'Bake Off Pool: scoring day', html, text: html.replace(/<[^>]+>/g, '') })
  }
  console.log(`Sent scoring reminder to ${(admins ?? []).length} admin(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
