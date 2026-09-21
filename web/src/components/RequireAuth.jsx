import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!session) return <Navigate to="/" replace />
  return children
}
