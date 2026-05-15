import { useState, useEffect } from 'react'
import { api } from '../api/client'
import InviteQR from './auth/InviteQR'

interface Manager {
  id: number
  name: string
  isActive: number
  createdAt: string
}

export default function ManagersTab() {
  const [managers, setManagers] = useState<Manager[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setManagers(await api.get<Manager[]>('/managers'))
    } catch {
      setError('Failed to load managers')
    } finally {
      setLoading(false)
    }
  }

  async function revoke(id: number) {
    setDeletingId(id)
    setError('')
    try {
      await api.delete(`/managers/${id}`)
      setConfirmId(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke')
      setDeletingId(null)
    }
  }

  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      <div style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Managers</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Invite managers to create and run their own sweeps.
        </p>
      </div>

      <InviteQR />

      <div style={{ marginTop: 28 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Active managers</div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : managers.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No managers yet.</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {managers.map(m => (
              <div key={m.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
                {confirmId !== m.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Joined {new Date(m.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirmId(m.id)}
                    >
                      Revoke
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '4px 0' }}>
                    <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>
                      Remove <strong>{m.name}</strong>? This permanently deletes all their sweeps, pools and players.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => revoke(m.id)}
                        disabled={deletingId === m.id}
                      >
                        {deletingId === m.id
                          ? <span className="spinner" style={{ width: 12, height: 12 }} />
                          : 'Yes, remove'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === m.id}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
