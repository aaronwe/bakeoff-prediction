import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchOpenEpisode, fetchActiveBakers, fetchAllBakers } from '../lib/queries'
import WeeklyForm from '../components/WeeklyForm'
import * as copy from './Home.copy'

const RESEND_COOLDOWN_SECONDS = 60

function SignInForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Ticks the cooldown down one second at a time rather than a single
  // setTimeout(60s): re-running the effect on every change keeps it accurate
  // even if the tab is backgrounded and timers get throttled/coalesced.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSending(true)
    // Safe with HashRouter: Supabase's implicit auth flow puts the session
    // token in the URL hash fragment (#access_token=...), which the auth
    // client reads directly from window.location.hash on load — independent
    // of, and before, HashRouter's own hash-based route matching.
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setSending(false)
    if (signInError) {
      setError(signInError.message)
    } else {
      setSent(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }

  const buttonLabel = sending
    ? copy.SENDING
    : cooldown > 0
      ? copy.resendIn(cooldown)
      : sent
        ? copy.RESEND_LINK
        : copy.SEND_LINK

  return (
    <div>
      {sent && <p className="success">{copy.checkEmail(email)}</p>}
      <form className="card" onSubmit={handleSubmit}>
        <label>
          {copy.EMAIL_LABEL}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" disabled={sending || cooldown > 0}>{buttonLabel}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
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
    <form className="card" onSubmit={handleSubmit}>
      <p>{copy.ONBOARDING_WELCOME}</p>
      <label>
        {copy.DISPLAY_NAME_LABEL}
        <input
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <button type="submit">{copy.CONTINUE}</button>
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

  if (loading) return <p>{copy.LOADING}</p>
  if (!session) return <SignInForm />
  if (!player) return <OnboardingForm />
  if (episodeLoading) return <p>{copy.LOADING}</p>
  if (episodeLoadError) {
    return (
      <div>
        <p className="error">{copy.EPISODE_LOAD_ERROR_PREFIX}{episodeLoadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>{copy.TRY_AGAIN}</button>
      </div>
    )
  }

  return (
    <div>
      <p>{copy.welcomeBack(player.display_name)}</p>
      {episode ? (
        <WeeklyForm episode={episode} player={player} allBakers={allBakers} activeBakers={activeBakers} />
      ) : (
        <p className="muted">{copy.NO_OPEN_EPISODE}</p>
      )}
    </div>
  )
}
