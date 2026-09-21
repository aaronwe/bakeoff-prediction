import 'dotenv/config'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'
import { sendMail } from './lib/mailer.mjs'
import { buildWeeklyEmailHtml, buildAdminReminderHtml } from './lib/emailTemplates.mjs'
import { decideWeeklyAction } from './lib/weeklyEmailDecision.mjs'

async function getAdminEmails() {
  const { data, error } = await supabaseAdmin.from('admins').select('email')
  if (error) throw error
  return data.map((a) => a.email)
}

async function main() {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL must be set')

  const { data: episode, error: episodeError } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (episodeError) throw episodeError

  const decision = decideWeeklyAction(episode)
  console.log(`Decision for episode ${episode?.number ?? '(none open)'}: ${decision.action}`)

  if (decision.action === 'none') {
    return
  }

  const adminEmails = await getAdminEmails()

  if (decision.action === 'remind') {
    const html = buildAdminReminderHtml({ episode, kind: 'not-locked' })
    for (const email of adminEmails) {
      await sendMail({ to: email, subject: `Episode ${episode.number} email isn't locked yet`, html, text: html.replace(/<[^>]+>/g, '') })
    }
    console.log(`Sent lock reminder to ${adminEmails.length} admin(s).`)
    return
  }

  // decision.action === 'send'
  const { data: bonusQuestions } = await supabaseAdmin
    .from('bonus_questions')
    .select('*')
    .eq('episode_id', episode.id)

  const { data: players } = await supabaseAdmin.from('players').select('*')

  let previousLeaderboard = null
  const { data: previousEpisode } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .eq('number', episode.number - 1)
    .eq('status', 'scored')
    .maybeSingle()
  if (previousEpisode) {
    const { data: prevScores } = await supabaseAdmin
      .from('scores')
      .select('*')
      .eq('episode_id', previousEpisode.id)
    const rows = (prevScores ?? [])
      .map((s) => ({
        name: players.find((p) => p.id === s.player_id)?.display_name ?? 'Unknown',
        total: s.total,
      }))
      .sort((a, b) => b.total - a.total)
    previousLeaderboard = { episodeNumber: previousEpisode.number, rows }
  }

  const html = buildWeeklyEmailHtml({ episode, bonusQuestions: bonusQuestions ?? [], siteUrl, previousLeaderboard })
  const text = html.replace(/<[^>]+>/g, '')

  for (const player of players ?? []) {
    await sendMail({ to: player.email, subject: `Bake Off Pool: Episode ${episode.number} predictions are open`, html, text })
  }

  await supabaseAdmin.from('episodes').update({ email_sent_at: new Date().toISOString() }).eq('id', episode.id)
  console.log(`Sent weekly email to ${(players ?? []).length} player(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
