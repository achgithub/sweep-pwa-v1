import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import type { Competition, Pool, Player } from '../types'
import CompetitionDetail from './sweeps/CompetitionDetail'

export default function SweepsTab() {
  const { isAdmin } = useAuth()
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setCompetitions(await api.get<Competition[]>('/competitions'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  if (selectedId !== null) {
    return (
      <CompetitionDetail
        competitionId={selectedId}
        onBack={() => { setSelectedId(null); load() }}
      />
    )
  }

  if (showCreate) {
    return (
      <CreateForm
        onBack={() => setShowCreate(false)}
        onCreate={id => { setShowCreate(false); setSelectedId(id) }}
      />
    )
  }

  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="section-title">Sweeps</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <i className="ti ti-plus" /> New sweep
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="empty-state" style={{ paddingTop: 60 }}><span className="spinner" /></div>
      ) : competitions.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-trophy" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No sweeps yet</div>
          <div style={{ fontSize: 13 }}>Create a pool first, then start a sweep on it.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {competitions.map(c => (
            <button
              key={c.id}
              className="card"
              style={{ textAlign: 'left', cursor: 'pointer', padding: '14px 16px', width: '100%', border: 'none' }}
              onClick={() => setSelectedId(c.id)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.poolName} · {c.poolType === 'racing' ? 'Racing' : 'Knockout'}
                    {isAdmin && <span> · {c.managerName}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <StatusBadge status={c.status} />
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {c.spunCount}/{c.entryCount} drawn
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = { setup: 'badge-pending', active: 'badge-active', complete: 'badge-completed' }
  return <span className={`badge ${cls[status] ?? 'badge-pending'}`}>{status}</span>
}

function CreateForm({ onBack, onCreate }: { onBack: () => void; onCreate: (id: number) => void }) {
  const [pools, setPools] = useState<Pool[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [poolId, setPoolId] = useState<number | ''>('')
  const [name, setName] = useState('')
  const [positions, setPositions] = useState(['1st', '2nd', '3rd'])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get<Pool[]>('/pools'),
      api.get<Player[]>('/players'),
    ]).then(([ps, pls]) => {
      setPools(ps)
      if (ps.length) setPoolId(ps[0].id)
      setPlayers(pls)
    }).catch(() => setError('Failed to load')).finally(() => setLoading(false))
  }, [])

  function togglePlayer(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(selected.size === players.length ? new Set() : new Set(players.map(p => p.id)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!poolId || !name.trim()) return
    const validPositions = positions.map(p => p.trim()).filter(Boolean)
    if (!validPositions.length) { setError('At least one prize position required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await api.post<{ id: number }>('/competitions', {
        poolId,
        name: name.trim(),
        prizePositions: validPositions,
        playerIds: [...selected],
      })
      onCreate(res.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-content" style={{ padding: '0 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px 20px' }}>
        <button className="btn-icon" onClick={onBack}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20 }} />
        </button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>New sweep</div>
      </div>

      {error && <div className="alert alert-error" style={{ margin: '0 18px 12px' }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ padding: '0 18px' }}>
        <div style={{ marginBottom: 14 }}>
          <label>Pool</label>
          {loading ? (
            <div style={{ marginTop: 8 }}><span className="spinner" style={{ width: 14, height: 14 }} /></div>
          ) : (
            <select value={poolId} onChange={e => setPoolId(Number(e.target.value))} required>
              <option value="">— select a pool —</option>
              {pools.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type === 'racing' ? 'Racing' : 'Knockout'})
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label>Sweep name</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Work sweep · £5 entry" required
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>Prize positions</label>
          {positions.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text" style={{ flex: 1 }} value={p}
                onChange={e => setPositions(positions.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Position ${i + 1}`}
              />
              {positions.length > 1 && (
                <button type="button" className="btn-icon"
                  onClick={() => setPositions(positions.filter((_, j) => j !== i))}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => setPositions([...positions, ''])}>
            + Add position
          </button>
        </div>

        {/* Player selection */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ display: 'block' }}>
              Players{selected.size > 0 ? ` (${selected.size} selected)` : ''}
            </label>
            {players.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
                {selected.size === players.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          {loading ? null : players.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              No players in pool yet — you can add them after creating.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {players.map(p => {
                const on = selected.has(p.id)
                return (
                  <button
                    key={p.id} type="button" onClick={() => togglePlayer(p.id)}
                    style={{
                      padding: '7px 14px', border: '1px solid', borderRadius: 'var(--radius-sm)',
                      borderColor: on ? 'var(--indigo)' : 'var(--border-default)',
                      background: on ? 'var(--indigo-dim)' : 'transparent',
                      color: on ? 'var(--indigo)' : 'var(--text-primary)',
                      fontSize: 13, fontWeight: on ? 600 : 400,
                      fontFamily: 'inherit', cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-full"
          disabled={saving || loading || !poolId}>
          {saving
            ? <span className="spinner" style={{ width: 14, height: 14 }} />
            : `Create sweep${selected.size ? ` with ${selected.size} player${selected.size > 1 ? 's' : ''}` : ''}`}
        </button>
      </form>
    </div>
  )
}
