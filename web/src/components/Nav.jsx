import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function Nav() {
  const { session, isAdmin } = useAuth()

  return (
    <nav className="nav">
      <Link to="/">Home</Link>
      {session && <Link to="/leaderboard">Leaderboard</Link>}
      {isAdmin && <Link to="/admin">Admin</Link>}
      {session && (
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      )}
    </nav>
  )
}
