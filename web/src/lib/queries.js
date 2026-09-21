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

export async function fetchLeaderboardData() {
  const [{ data: players, error: playersError }, { data: scores, error: scoresError }, { data: episodes, error: episodesError }] =
    await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('scores').select('*'),
      supabase.from('episodes').select('*').eq('status', 'scored').order('number'),
    ])
  if (playersError) throw playersError
  if (scoresError) throw scoresError
  if (episodesError) throw episodesError
  return { players, scores, episodes }
}
