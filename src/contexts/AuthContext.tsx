import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../types'
import { tokenStore } from '../api/client'

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isAdmin: boolean
  isManager: boolean
  login: (user: AuthUser, token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(tokenStore.get())

  const login = useCallback((u: AuthUser, t: string) => {
    tokenStore.set(t)
    setToken(t)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setToken(null)
    setUser(null)
  }, [])

  // Handle token expiry dispatched by the API client
  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('auth:expired', handler)
    return () => window.removeEventListener('auth:expired', handler)
  }, [logout])

  // Restore user from token on mount
  useEffect(() => {
    const stored = tokenStore.get()
    if (!stored) return
    try {
      const parts = stored.split('.')
      if (parts.length !== 3) throw new Error('bad token')
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        tokenStore.clear()
        return
      }
      setUser({ id: payload.sub, name: payload.name, role: payload.role })
    } catch {
      tokenStore.clear()
    }
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAdmin: user?.role === 'admin',
      isManager: user?.role === 'manager',
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
