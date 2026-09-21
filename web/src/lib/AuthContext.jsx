import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [player, setPlayer] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadPlayerAndAdmin = useCallback(async (currentSession) => {
    if (!currentSession) {
      setPlayer(null)
      setIsAdmin(false)
      return
    }
    const email = currentSession.user.email
    const [{ data: playerRow }, { data: adminResult }] = await Promise.all([
      supabase.from('players').select('*').eq('email', email).maybeSingle(),
      supabase.rpc('is_admin'),
    ])
    setPlayer(playerRow ?? null)
    setIsAdmin(Boolean(adminResult))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadPlayerAndAdmin(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      setLoading(true)
      await loadPlayerAndAdmin(newSession)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [loadPlayerAndAdmin])

  const refreshPlayer = useCallback(async () => {
    await loadPlayerAndAdmin(session)
  }, [session, loadPlayerAndAdmin])

  return (
    <AuthContext.Provider value={{ session, player, isAdmin, loading, refreshPlayer }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
