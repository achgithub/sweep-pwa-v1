import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import type { Player } from '../types'

export default function PlayersTab() {
  const { isAdmin } = useAuth()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setPlayers(await api.get<Player[]>('/players'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
      setError(`"${name.trim()}" already exists`)
      return
    }
    setAdding(true)
    setError('')
    try {
      await api.post('/players', { name: name.trim() })
      setName('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  async function deletePlayer(p: Player) {
    setDeleting(p.id)
    setError('')
    try {
      await api.delete(`/players/${p.id}`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot delete — player has entries in a sweep')
    } finally {
      setDeleting(null)
    }
  }

  // Group by manager for admin view
  const byManager = isAdmin
    ? players.reduce<Record<string, Player[]>>((acc, p) => {
        const key = p.managerName ?? 'Unknown'
        ;(acc[key] ??= []).push(p)
        return acc
      }, {})
    : null

  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="section-header">
        <div className="section-title">Players</div>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{players.length} total</span>
      </div>

      {/* Add player — managers only */}
      {!isAdmin && (
        <form onSubmit={addPlayer} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input type="text" value={name} onChange={e => { setName(e.target.value); setError('') }}
            placeholder="Player name" style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={adding || !name.trim()}>
            {adding ? <span className="spinner" /> : <><i className="ti ti-plus" /> Add</>}
          </button>
        </form>
      )}

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : players.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-users" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No players yet</div>
          <div style={{ fontSize: 13 }}>Add your players — they're stored under your account and reused across sweeps.</div>
        </div>
      ) : isAdmin && byManager ? (
        // Admin: grouped by manager
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(byManager).sort(([a], [b]) => a.localeCompare(b)).map(([manager, list]) => (
            <div key={manager}>
              <div className="section-label">{manager} <span style={{ color: 'var(--indigo)' }}>({list.length})</span></div>
              <div className="card" style={{ flexDirection: 'column', gap: 0, padding: 0 }}>
                {list.map((p, i) => (
                  <div key={p.id} className="list-item"
                    style={{ borderTop: i > 0 ? '1px solid var(--border-default)' : 'none' }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Manager: flat list
        <div className="card" style={{ flexDirection: 'column', gap: 0, padding: 0 }}>
          {players.map((p, i) => (
            <div key={p.id} className="list-item"
              style={{ borderTop: i > 0 ? '1px solid var(--border-default)' : 'none' }}>
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              <button className="btn-icon" onClick={() => deletePlayer(p)}
                disabled={deleting === p.id} aria-label="Remove player">
                {deleting === p.id
                  ? <span className="spinner" style={{ width: 12, height: 12 }} />
                  : <i className="ti ti-x" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
