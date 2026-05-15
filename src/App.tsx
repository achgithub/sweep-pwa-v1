import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { api } from './api/client'
import SetupPage from './components/auth/SetupPage'
import LoginPage from './components/auth/LoginPage'
import RegisterPage from './components/auth/RegisterPage'
import SweepsTab from './components/SweepsTab'
import PoolsTab from './components/PoolsTab'
import PlayersTab from './components/PlayersTab'
import ManagersTab from './components/ManagersTab'

type Tab = 'sweeps' | 'pools' | 'players' | 'managers'

function useUpdateAvailable() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true)
          }
        })
      })
    })
  }, [])
  return updateAvailable
}

function Shell() {
  const { user, isAdmin, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('sweeps')
  const [showProfile, setShowProfile] = useState(false)
  const updateAvailable = useUpdateAvailable()

  const managerNav: { id: Tab; label: string; icon: string }[] = [
    { id: 'sweeps',  label: 'Sweeps',  icon: 'ti-trophy' },
    { id: 'pools',   label: 'Pools',   icon: 'ti-database' },
    { id: 'players', label: 'Players', icon: 'ti-users' },
  ]

  const adminNav: { id: Tab; label: string; icon: string }[] = [
    { id: 'sweeps',   label: 'Sweeps',   icon: 'ti-trophy' },
    { id: 'pools',    label: 'Pools',    icon: 'ti-database' },
    { id: 'managers', label: 'Managers', icon: 'ti-user-check' },
    { id: 'players',  label: 'Players',  icon: 'ti-users' },
  ]

  const nav = isAdmin ? adminNav : managerNav

  return (
    <div style={{ minHeight: '100dvh', position: 'relative' }}>
      {/* Decorative blobs */}
      <div className="blob blob-indigo" aria-hidden="true" />
      <div className="blob blob-emerald" aria-hidden="true" />

      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(14px + env(safe-area-inset-top)) 18px 0', position: 'relative', zIndex: 1 }}>
        <div className="app-logo">
          <span style={{ color: 'var(--indigo)' }}>Sweep</span>
        </div>
        <button
          onClick={() => setShowProfile(true)}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.09)',
            border: '1px solid rgba(255,255,255,0.13)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {user?.name.slice(0, 2).toUpperCase()}
        </button>
      </header>

      {/* Update banner */}
      {updateAvailable && (
        <div className="offline-banner" style={{ background: 'var(--indigo-dim)', borderColor: 'var(--indigo-border)', color: 'var(--indigo)', position: 'relative', zIndex: 1 }}>
          New version available — close all app tabs and reopen to update
        </div>
      )}

      {/* Page content */}
      <main style={{ position: 'relative', zIndex: 1 }}>
        {tab === 'sweeps'   && <SweepsTab />}
        {tab === 'pools'    && <PoolsTab />}
        {tab === 'players'  && <PlayersTab />}
        {tab === 'managers' && isAdmin && <ManagersTab />}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        {nav.map(item => (
          <button
            key={item.id}
            className={`nav-item${tab === item.id ? ' nav-item--active' : ''}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </nav>

      {showProfile && user && (
        <ProfileSheet
          user={user}
          onClose={() => setShowProfile(false)}
          onSignOut={logout}
        />
      )}
    </div>
  )
}

function ProfileSheet({ user, onClose, onSignOut }: {
  user: { name: string; role: string }
  onClose: () => void
  onSignOut: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function deleteAccount() {
    setDeleting(true)
    setError('')
    try {
      await api.delete('/auth/me')
      onSignOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setDeleting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-base)', borderTop: '1px solid var(--border-default)',
          borderRadius: '20px 20px 0 0', padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
          width: '100%', maxWidth: 600, margin: '0 auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* User info */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{user.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, textTransform: 'capitalize' }}>
            {user.role}
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-ghost btn-full" style={{ marginBottom: 8 }} onClick={onSignOut}>
          <i className="ti ti-logout" /> Sign out
        </button>

        {user.role === 'manager' && !confirm && (
          <button className="btn btn-danger btn-full" onClick={() => setConfirm(true)}>
            <i className="ti ti-trash" /> Delete my account
          </button>
        )}

        {user.role === 'manager' && confirm && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12, lineHeight: 1.5 }}>
              This permanently deletes all your sweeps, pools and players. There is no undo.
            </div>
            <button className="btn btn-danger btn-full" style={{ marginBottom: 8 }}
              onClick={deleteAccount} disabled={deleting}>
              {deleting
                ? <span className="spinner" style={{ width: 14, height: 14 }} />
                : 'Yes, delete everything'}
            </button>
            <button className="btn btn-ghost btn-full" onClick={() => setConfirm(false)} disabled={deleting}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AppRouter() {
  const { user } = useAuth()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  // Check invite token in URL
  const params = new URLSearchParams(window.location.search)
  const inviteToken = params.get('token')

  useEffect(() => {
    if (user || inviteToken) return
    api.get<{ needsSetup: boolean }>('/auth/status')
      .then(res => setNeedsSetup(res.needsSetup))
      .catch(() => setNeedsSetup(false))
  }, [user, inviteToken])

  if (inviteToken && !user) return <RegisterPage token={inviteToken} />
  if (user) return <Shell />
  if (needsSetup === null) return null  // loading
  if (needsSetup) return <SetupPage />
  return <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
