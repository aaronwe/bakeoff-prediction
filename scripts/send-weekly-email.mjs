import 'dotenv/config'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'
import { sendMail } from './lib/mailer.mjs'
import { buildWeeklyEmailHtml, buildAdminReminderHtml } from './lib/emailTemplates.mjs'
import { decideWeeklyAction } from './lib/weeklyEmailDecision.mjs'
import { episodeLabel } from './lib/episodeLabel.mjs'

// `node send-weekly-email.mjs --test` sends a draft of the current episode's
// email to the copy recipients only. It ignores lock/sent state and never
// marks the episode as sent.
const testMode = process.argv.includes('--test')

async function getAdminEmails() {
  const { data, error } = await supabaseAdmin.from('admins').select('email')
  if (error) throw error
  return data.map((a) => a.email)
}

// Who gets a copy of the weekly email (and the test draft): WEEKLY_EMAIL_CC
// (comma-separated) if set, otherwise every admin.
async function getCopyRecipients() {
  const configured = (process.env.WEEKLY_EMAIL_CC ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  return configured.length ? configured : getAdminEmails()
}

async function buildWeeklyEmail(episode, siteUrl) {
  const { data: bonusQuestions, error: bonusError } = await supabaseAdmin
    .from('bonus_questions')
    .select('*')
    .eq('episode_id', episode.id)
    .order('sort_order')
    .order('created_at')
  if (bonusError) throw bonusError

  const { data: players, error: playersError } = await supabaseAdmin.from('players').select('*')
  if (playersError) throw playersError

  let previousLeaderboard = null
  const { data: previousEpisode, error: prevEpError } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .eq('number', episode.number - 1)
    .eq('status', 'scored')
    .maybeSingle()
  if (prevEpError) throw prevEpError

  if (previousEpisode) {
    const { data: prevScores, error: prevScoresError } = await supabaseAdmin
      .from('scores')
      .select('*')
      .eq('episode_id', previousEpisode.id)
    if (prevScoresError) throw prevScoresError

    const rows = (prevScores ?? [])
      .map((s) => ({
        name: players.find((p) => p.id === s.player_id)?.display_name ?? 'Unknown',
        total: s.total,
      }))
      .sort((a, b) => b.total - a.total)
    previousLeaderboard = { episodeNumber: previousEpisode.number, rows }
  }

  const html = buildWeeklyEmailHtml({ episode, bonusQuestions: bonusQuestions ?? [], siteUrl, previousLeaderboard })
  return {
    players: players ?? [],
    html,
    text: html.replace(/<br\s*\/?>|<\/(p|h[1-6]|li|div)>/g, '$&\n').replace(/<[^>]+>/g, ''),
    subject: `Bake Off Pool: ${episodeLabel(episode)} predictions are open!`,
  }
}

async function sendTest(siteUrl) {
  // Unlike the real send, a draft is fine here: previewing before publishing.
  const { data: episode, error } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .in('status', ['open', 'draft'])
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!episode) throw new Error('No open or draft episode to preview')

  const recipients = await getCopyRecipients()
  if (!recipients.length) throw new Error('No recipients: set WEEKLY_EMAIL_CC or add an admin')

  const { html, text, subject } = await buildWeeklyEmail(episode, siteUrl)
  await sendMail({ to: recipients, subject: `[TEST] ${subject}`, html, text })
  console.log(`Sent test email for ${episodeLabel(episode)} (${episode.status}) to ${recipients.join(', ')}.`)
}

async function main() {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL must be set')

  if (testMode) {
    await sendTest(siteUrl)
    return
  }

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

  if (decision.action === 'remind') {
    const adminEmails = await getAdminEmails()
    const html = buildAdminReminderHtml({ episode, kind: 'not-locked' })
    for (const email of adminEmails) {
      await sendMail({ to: email, subject: `${episodeLabel(episode)} email isn't locked yet`, html, text: html.replace(/<[^>]+>/g, '') })
    }
    console.log(`Sent lock reminder to ${adminEmails.length} admin(s).`)
    return
  }

  // decision.action === 'send'
  const { players, html, text, subject } = await buildWeeklyEmail(episode, siteUrl)

  for (const player of players) {
    await sendMail({ to: player.email, subject, html, text })
  }

  // Players get individual emails, so cc'ing on each would land the copy
  // recipients one duplicate per player. Send them a single copy instead.
  const copyRecipients = await getCopyRecipients()
  if (copyRecipients.length) {
    await sendMail({ to: copyRecipients, subject, html, text })
  }

  const { error: updateError } = await supabaseAdmin
    .from('episodes')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', episode.id)
  if (updateError) throw updateError

  console.log(`Sent weekly email to ${players.length} player(s) and ${copyRecipients.length} copy recipient(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
