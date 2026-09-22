import { supabase } from './supabaseClient'

export async function fetchOpenEpisode() {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchActiveBakers() {
  const { data, error } = await supabase
    .from('bakers')
    .select('*')
    .eq('eliminated', false)
    .order('name')
  if (error) throw error
  return data
}

export async function fetchAllBakers() {
  const { data, error } = await supabase.from('bakers').select('*').order('name')
  if (error) throw error
  return data
}

export async function fetchAllPlayers() {
  const { data, error } = await supabase.from('players').select('*').order('display_name')
  if (error) throw error
  return data
}

export async function fetchBonusQuestions(episodeId) {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('*')
    .eq('episode_id', episodeId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function fetchMyAnswer(episodeId, playerId) {
  const { data, error } = await supabase
    .from('answers')
    .select('*')
    .eq('episode_id', episodeId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchMyBonusAnswers(bonusQuestionIds, playerId) {
  if (bonusQuestionIds.length === 0) return []
  const { data, error } = await supabase
    .from('bonus_answers')
    .select('*')
    .in('bonus_question_id', bonusQuestionIds)
    .eq('player_id', playerId)
  if (error) throw error
  return data
}

export async function fetchEpisodeRevealData(episodeNumber) {
  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('*')
    .eq('number', episodeNumber)
    .single()
  if (episodeError) throw episodeError

  // players_public, not players — see the comment in fetchLeaderboardData
  // above: a plain `players` select here would only return the caller's own
  // row to a non-admin player under players_select's RLS.
  const results = await Promise.all([
    supabase.from('bakers').select('*'),
    supabase.from('players_public').select('*'),
    supabase.from('answers').select('*').eq('episode_id', episode.id),
    supabase.from('bonus_questions').select('*').eq('episode_id', episode.id),
    supabase.from('bonus_answers').select('*, bonus_questions!inner(episode_id)').eq('bonus_questions.episode_id', episode.id),
    supabase.from('scores').select('*').eq('episode_id', episode.id),
  ])
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw firstError
  const [{ data: bakers }, { data: players }, { data: answers }, { data: bonusQuestions }, { data: bonusAnswers }, { data: scores }] = results

  return { episode, bakers, players, answers, bonusQuestions, bonusAnswers, scores }
}

export async function fetchLeaderboardData() {
  // players_public, not players: players_select's RLS restricts full player
  // rows (which include email) to the caller's own row or an admin, so a
  // plain `players` select here would silently return just the signed-in
  // player's own row to everyone else. players_public (see schema.sql)
  // exposes every player's id/display_name without that restriction.
  const [{ data: players, error: playersError }, { data: scores, error: scoresError }, { data: episodes, error: episodesError }] =
    await Promise.all([
      supabase.from('players_public').select('*'),
      supabase.from('scores').select('*'),
      supabase.from('episodes').select('*').eq('status', 'scored').order('number'),
    ])
  if (playersError) throw playersError
  if (scoresError) throw scoresError
  if (episodesError) throw episodesError
  return { players, scores, episodes }
}

export async function fetchUnresolvedBonusQuestions() {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('*, episodes!inner(number, status)')
    .eq('episodes.status', 'scored')
    .is('correct_answer', null)
    .is('correct_baker_ids', null)
    .order('created_at')
  if (error) throw error
  return data
}

// The complement of fetchUnresolvedBonusQuestions: questions on scored episodes
// that already have an answer key. The admin grading page lists these too so a
// mistyped key can be corrected and re-scored — without this there is no UI
// anywhere that can change a bonus question's answer once it's been graded.
export async function fetchGradedBonusQuestions() {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('*, episodes!inner(number, status)')
    .eq('episodes.status', 'scored')
    .or('correct_answer.not.is.null,correct_baker_ids.not.is.null')
    .order('created_at')
  if (error) throw error
  return data
}
