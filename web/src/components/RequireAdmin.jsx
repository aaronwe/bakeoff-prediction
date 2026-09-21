import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
