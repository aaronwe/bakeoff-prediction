import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'
import * as copy from './Nav.copy'

export default function Nav() {
  const { session, isAdmin } = useAuth()

  return (
    <header className="site-header">
      <h1 className="site-title">{copy.SITE_TITLE}</h1>
      <nav className="nav">
        <Link to="/">{copy.HOME}</Link>
        {session && <Link to="/leaderboard">{copy.LEADERBOARD}</Link>}
        {isAdmin && <Link to="/admin">{copy.ADMIN}</Link>}
        {session && (
          <button
            className="button-ghost"
            onClick={() => supabase.auth.signOut().catch((err) => console.error('Sign out failed:', err))}
          >
            {copy.SIGN_OUT}
          </button>
        )}
      </nav>
    </header>
  )
}
