import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'

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

  if (loading) return <p>Loading…</p>
  if (!session) return <SignInForm />
  if (!player) return <OnboardingForm />

  return <p>Welcome back, {player.display_name}. (Weekly questions coming in a later task.)</p>
}
