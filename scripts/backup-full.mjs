// Full-table JSON snapshot of every public table, written locally only (no
// email, unlike backup-scores.mjs). Run before schema migrations.
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'

const TABLES = [
  'bakers',
  'episodes',
  'players',
  'bonus_questions',
  'answers',
  'bonus_answers',
  'scores',
  'admins',
  'episode_draft_answer_keys',
  'bonus_question_draft_answer_keys',
]

// PostgREST caps a response (default 1000 rows), so page through each table.
async function fetchAll(table) {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin.from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const dir = path.join(repoRoot, 'backups', `full-${stamp}`)
  await mkdir(dir, { recursive: true })
  for (const table of TABLES) {
    const rows = await fetchAll(table)
    await writeFile(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2))
    console.log(`${table}: ${rows.length} rows`)
  }
  console.log(`Wrote full backup to ${dir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
