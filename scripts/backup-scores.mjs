import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'
import { sendMail } from './lib/mailer.mjs'
import { toCsv } from './lib/csv.mjs'

async function main() {
  const [
    { data: scores, error: scoresError },
    { data: answers, error: answersError },
    { data: bonusAnswers, error: bonusAnswersError },
    { data: players, error: playersError },
    { data: episodes, error: episodesError },
    { data: admins, error: adminsError },
  ] = await Promise.all([
    supabaseAdmin.from('scores').select('*'),
    supabaseAdmin.from('answers').select('*'),
    supabaseAdmin.from('bonus_answers').select('*'),
    supabaseAdmin.from('players').select('*'),
    supabaseAdmin.from('episodes').select('*'),
    supabaseAdmin.from('admins').select('email'),
  ])

  if (scoresError) throw scoresError
  if (answersError) throw answersError
  if (bonusAnswersError) throw bonusAnswersError
  if (playersError) throw playersError
  if (episodesError) throw episodesError
  if (adminsError) throw adminsError

  const playerName = (id) => (players ?? []).find((p) => p.id === id)?.display_name ?? id
  const episodeNumber = (id) => (episodes ?? []).find((e) => e.id === id)?.number ?? id

  const scoresRows = (scores ?? []).map((s) => ({
    episode: episodeNumber(s.episode_id),
    player: playerName(s.player_id),
    total: s.total,
    manually_overridden: s.manually_overridden,
    breakdown: JSON.stringify(s.points_breakdown),
  }))
  const answersRows = (answers ?? []).map((a) => ({
    episode: episodeNumber(a.episode_id),
    player: playerName(a.player_id),
    technical_pick_id: a.technical_pick_id,
    star_baker_pick_id: a.star_baker_pick_id,
    eliminated_pick_id: a.eliminated_pick_id,
    handshake_guess: a.handshake_guess,
  }))
  const bonusAnswersRows = (bonusAnswers ?? []).map((b) => ({
    bonus_question_id: b.bonus_question_id,
    player: playerName(b.player_id),
    answer_text: b.answer_text,
    // baker_multi_pick answers live here, not in answer_text — without this
    // column the backup shows a blank cell for every multi-pick answer.
    answer_baker_ids: (b.answer_baker_ids ?? []).join(' '),
  }))

  const scoresCsv = toCsv(scoresRows, ['episode', 'player', 'total', 'manually_overridden', 'breakdown'])
  const answersCsv = toCsv(answersRows, ['episode', 'player', 'technical_pick_id', 'star_baker_pick_id', 'eliminated_pick_id', 'handshake_guess'])
  const bonusAnswersCsv = toCsv(bonusAnswersRows, ['bonus_question_id', 'player', 'answer_text', 'answer_baker_ids'])

  const dateStr = new Date().toISOString().slice(0, 10)
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const backupDir = path.join(repoRoot, 'backups', dateStr)
  await mkdir(backupDir, { recursive: true })
  await writeFile(path.join(backupDir, 'scores.csv'), scoresCsv)
  await writeFile(path.join(backupDir, 'answers.csv'), answersCsv)
  await writeFile(path.join(backupDir, 'bonus_answers.csv'), bonusAnswersCsv)
  console.log(`Wrote backup CSVs to ${backupDir}`)

  for (const admin of admins ?? []) {
    await sendMail({
      to: admin.email,
      subject: `Bake Off Pool backup — ${dateStr}`,
      text: 'Attached: current scores, answers, and bonus answers.',
      html: '<p>Attached: current scores, answers, and bonus answers.</p>',
      attachments: [
        { filename: 'scores.csv', content: scoresCsv },
        { filename: 'answers.csv', content: answersCsv },
        { filename: 'bonus_answers.csv', content: bonusAnswersCsv },
      ],
    })
  }
  console.log(`Emailed backup to ${(admins ?? []).length} admin(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
