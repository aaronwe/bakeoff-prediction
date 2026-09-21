import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchOpenEpisode, fetchActiveBakers, fetchAllBakers } from '../lib/queries'
import WeeklyForm from '../components/WeeklyForm'

function SignInForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    // Safe with HashRouter: Supabase's implicit auth flow puts the session
    // token in the URL hash fragment (#access_token=...), which the auth
    // client reads directly from window.location.hash on load — independent
    // of, and before, HashRouter's own hash-based route matching.
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (signInError) {
      setError(signInError.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return <p>Check your email for a sign-in link.</p>
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button type="submit">Send sign-in link</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function OnboardingForm() {
  const { session, refreshPlayer } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase
      .from('players')
      .insert({ email: session.user.email, display_name: displayName })
    if (insertError) {
      setError(insertError.message)
      return
    }
    await refreshPlayer()
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>Welcome! What name should other players see?</p>
      <label>
        Display name
        <input
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <button type="submit">Continue</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default function Home() {
  const { session, player, loading } = useAuth()
  const [episode, setEpisode] = useState(null)
  const [allBakers, setAllBakers] = useState([])
  const [activeBakers, setActiveBakers] = useState([])
  const [episodeLoading, setEpisodeLoading] = useState(true)
  const [episodeLoadError, setEpisodeLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!player) return
    let cancelled = false
    async function load() {
      setEpisodeLoading(true)
      setEpisodeLoadError(null)
      try {
        const [ep, active, all] = await Promise.all([
          fetchOpenEpisode(),
          fetchActiveBakers(),
          fetchAllBakers(),
        ])
        if (cancelled) return
        setEpisode(ep)
        setActiveBakers(active)
        setAllBakers(all)
      } catch (err) {
        if (!cancelled) setEpisodeLoadError(err.message)
      } finally {
        if (!cancelled) setEpisodeLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [player, retryCount])

  if (loading) return <p>Loading…</p>
  if (!session) return <SignInForm />
  if (!player) return <OnboardingForm />
  if (episodeLoading) return <p>Loading…</p>
  if (episodeLoadError) {
    return (
      <div>
        <p className="error">Couldn't load this week's episode: {episodeLoadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>Try again</button>
      </div>
    )
  }

  return (
    <div>
      <p>Welcome back, {player.display_name}.</p>
      {episode ? (
        <WeeklyForm episode={episode} player={player} allBakers={allBakers} activeBakers={activeBakers} />
      ) : (
        <p>No episode is open for predictions right now — check back soon.</p>
      )}
    </div>
  )
}
