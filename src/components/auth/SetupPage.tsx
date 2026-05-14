import { useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import type { AuthUser } from '../../types'

export default function SetupPage() {
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/auth/setup', { name, passcode })
      login(res.user, res.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ marginBottom: 28 }}>
          <div className="app-logo" style={{ marginBottom: 6 }}>
            <span style={{ color: 'var(--indigo)' }}>Sweep</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Create your admin account to get started.</p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="name">Your name</label>
            <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dave" required autoFocus />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="passcode">Passcode</label>
            <input id="passcode" type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Choose a passcode" required />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create admin account'}
          </button>
        </form>
      </div>
    </div>
  )
}
