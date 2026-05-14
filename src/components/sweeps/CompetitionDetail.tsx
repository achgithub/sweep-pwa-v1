import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/client'
import type { CompetitionDetail, Entry, Player } from '../../types'
import SpinScreen from './SpinScreen'

type Tab = 'overview' | 'entries' | 'draw' | 'results'

interface Props {
  competitionId: number
  onBack: () => void
}

export default function CompetitionDetailView({ competitionId, onBack }: Props) {
  const [detail, setDetail] = useState<CompetitionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [spinEntry, setSpinEntry] = useState<Entry | null>(null)
  const hasLoaded = useRef(false)

  useEffect(() => {
    hasLoaded.current = false
    load()
  }, [competitionId])

  async function load() {
    if (!hasLoaded.current) setLoading(true)
    try {
      const data = await api.get<CompetitionDetail>(`/competitions/${competitionId}`)
      setDetail(data)
      hasLoaded.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  function handleSpinComplete(updated: Entry) {
    setDetail(prev => {
      if (!prev) return prev
      return {
        ...prev,
        entries: prev.entries.map(e => e.id === updated.id ? updated : e),
        competition: { ...prev.competition, spunCount: prev.competition.spunCount + 1 },
      }
    })
    setSpinEntry(null)
  }

  if (spinEntry && detail) {
    return (
      <SpinScreen
        competitionId={competitionId}
        entry={spinEntry}
        poolType={detail.competition.poolType}
        poolOptions={detail.poolOptions}
        onComplete={handleSpinComplete}
        onCancel={() => setSpinEntry(null)}
      />
    )
  }

  const comp = detail?.competition

  return (
    <div className="app-content" style={{ padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px 10px' }}>
        <button className="btn-icon" onClick={onBack}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {comp?.name ?? '…'}
          </div>
          {comp && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
              {comp.poolName} · {comp.poolType === 'racing' ? 'Racing' : 'Knockout'}
            </div>
          )}
        </div>
        {comp && (
          <StatusPill compId={competitionId} currentStatus={comp.status} onUpdate={load} />
        )}
      </div>

      {error && <div className="alert alert-error" style={{ margin: '0 18px 10px' }}>{error}</div>}

      {/* Tab pills */}
      <div className="pill-row" style={{ padding: '4px 18px 12px' }}>
        {(['overview', 'entries', 'draw', 'results'] as Tab[]).map(t => (
          <button
            key={t}
            className={`pill${tab === t ? ' pill--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'draw'
              ? `Draw (${detail?.competition.spunCount ?? 0}/${detail?.competition.entryCount ?? 0})`
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state" style={{ paddingTop: 60 }}><span className="spinner" /></div>
      ) : detail ? (
        <>
          {tab === 'overview' && (
            <OverviewTab detail={detail} competitionId={competitionId} onUpdate={load} onDelete={onBack} />
          )}
          {tab === 'entries' && (
            <EntriesTab detail={detail} competitionId={competitionId} onUpdate={load} />
          )}
          {tab === 'draw' && (
            <DrawTab detail={detail} onSpin={setSpinEntry} />
          )}
          {tab === 'results' && (
            <ResultsTab detail={detail} competitionId={competitionId} onUpdate={load} />
          )}
        </>
      ) : null}
    </div>
  )
}

// ── Status pill (cycles setup → active → complete) ────────────────────────

function StatusPill({ compId, currentStatus, onUpdate }: {
  compId: number
  currentStatus: string
  onUpdate: () => void
}) {
  const [saving, setSaving] = useState(false)
  const next: Record<string, string> = { setup: 'active', active: 'complete', complete: 'setup' }
  const cls: Record<string, string> = { setup: 'badge-pending', active: 'badge-active', complete: 'badge-completed' }

  async function cycle() {
    setSaving(true)
    try {
      await api.patch(`/competitions/${compId}`, { status: next[currentStatus] })
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      className={`badge ${cls[currentStatus] ?? 'badge-pending'}`}
      onClick={cycle} disabled={saving}
      style={{ cursor: 'pointer', border: '1px solid' }}
    >
      {saving ? <span className="spinner" style={{ width: 10, height: 10 }} /> : currentStatus}
    </button>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────

function OverviewTab({ detail, competitionId, onUpdate, onDelete }: {
  detail: CompetitionDetail
  competitionId: number
  onUpdate: () => void
  onDelete: () => void
}) {
  const { competition, prizePositions } = detail
  const [positions, setPositions] = useState(prizePositions.map(p => p.label))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPositions(prizePositions.map(p => p.label))
  }, [prizePositions])

  async function savePositions() {
    setSaving(true)
    setError('')
    try {
      await api.put(`/competitions/${competitionId}/prize-positions`, {
        positions: positions.map(p => p.trim()).filter(Boolean),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function deleteComp() {
    if (!confirm('Delete this sweep? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.delete(`/competitions/${competitionId}`)
      onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot delete')
      setDeleting(false)
    }
  }

  const positionsChanged = positions.join('\n') !== prizePositions.map(p => p.label).join('\n')

  return (
    <div style={{ padding: '0 18px' }}>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Saved</div>}

      <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
          <Row label="Pool" value={competition.poolName} />
          <Row label="Type" value={competition.poolType === 'racing' ? 'Racing' : 'Knockout'} />
          <Row
            label="Entries"
            value={`${competition.entryCount} total · ${competition.spunCount} drawn`}
          />
          <Row label="Manager" value={competition.managerName} />
        </div>
      </div>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Prize positions</div>
        {positions.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text" style={{ flex: 1 }} value={p}
              onChange={e => setPositions(positions.map((x, j) => j === i ? e.target.value : x))}
              placeholder={`Position ${i + 1}`}
            />
            {positions.length > 1 && (
              <button
                type="button" className="btn-icon"
                onClick={() => setPositions(positions.filter((_, j) => j !== i))}
              >
                <i className="ti ti-x" />
              </button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button
            type="button" className="btn btn-ghost btn-sm"
            onClick={() => setPositions([...positions, ''])}
          >
            + Add
          </button>
          {positionsChanged && (
            <button
              type="button" className="btn btn-primary btn-sm"
              onClick={savePositions} disabled={saving}
            >
              {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Save'}
            </button>
          )}
        </div>
      </div>

      <button className="btn btn-danger btn-full" onClick={deleteComp} disabled={deleting}>
        {deleting
          ? <span className="spinner" style={{ width: 14, height: 14 }} />
          : <><i className="ti ti-trash" /> Delete sweep</>}
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── Entries tab ───────────────────────────────────────────────────────────

function EntriesTab({ detail, competitionId, onUpdate }: {
  detail: CompetitionDetail
  competitionId: number
  onUpdate: () => void
}) {
  const { entries } = detail
  const isRacing = detail.competition.poolType === 'racing'
  const [players, setPlayers] = useState<Player[]>([])
  const [playerId, setPlayerId] = useState<number | ''>('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Player[]>('/players').then(ps => {
      setPlayers(ps)
      if (ps.length) setPlayerId(ps[0].id)
    }).catch(() => {})
  }, [])

  async function addEntry() {
    if (!playerId) return
    setAdding(true)
    setError('')
    try {
      await api.post(`/competitions/${competitionId}/entries`, { playerId })
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  async function deleteEntry(entryId: number) {
    setDeletingId(entryId)
    setError('')
    try {
      await api.delete(`/competitions/${competitionId}/entries/${entryId}`)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot remove — entry already drawn')
      setDeletingId(null)
    }
  }

  return (
    <div style={{ padding: '0 18px' }}>
      {error && <div className="alert alert-error">{error}</div>}

      {players.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select
            style={{ flex: 1 }} value={playerId}
            onChange={e => setPlayerId(Number(e.target.value))}
          >
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={addEntry} disabled={adding || !playerId}
          >
            {adding
              ? <span className="spinner" style={{ width: 12, height: 12 }} />
              : '+ Add'}
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-users" style={{ fontSize: 28, display: 'block', marginBottom: 10 }} />
          <div>No entries yet — add players above</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {entries.map(e => (
            <div key={e.id} className="list-item">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.playerName}</div>
                {e.spunAt ? (
                  <div style={{ fontSize: 12, color: 'var(--emerald)', marginTop: 2 }}>
                    <i className="ti ti-check" style={{ marginRight: 4 }} />
                    {isRacing ? e.assignedRunnerName : e.assignedTeamName}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Not drawn
                  </div>
                )}
              </div>
              {!e.spunAt && (
                <button
                  className="btn-icon"
                  onClick={() => deleteEntry(e.id)}
                  disabled={deletingId === e.id}
                >
                  {deletingId === e.id
                    ? <span className="spinner" style={{ width: 12, height: 12 }} />
                    : <i className="ti ti-x" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Draw tab ──────────────────────────────────────────────────────────────

function DrawTab({ detail, onSpin }: {
  detail: CompetitionDetail
  onSpin: (entry: Entry) => void
}) {
  const { entries, competition } = detail
  const isRacing = competition.poolType === 'racing'
  const unspun = entries.filter(e => !e.spunAt)
  const spun = entries.filter(e => e.spunAt)

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <i className="ti ti-users" style={{ fontSize: 28, display: 'block', marginBottom: 10 }} />
        <div>Add entries in the Entries tab first</div>
      </div>
    )
  }

  const pct = competition.entryCount
    ? Math.round((competition.spunCount / competition.entryCount) * 100)
    : 0

  return (
    <div style={{ padding: '0 18px' }}>
      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6,
        }}>
          <span>{competition.spunCount} of {competition.entryCount} drawn</span>
          <span>{pct}%</span>
        </div>
        <div style={{
          height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.07)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: 'var(--emerald)', borderRadius: 3,
            transition: 'width 0.4s',
          }} />
        </div>
      </div>

      {unspun.length > 0 && (
        <>
          <div className="section-label" style={{ marginBottom: 8 }}>To draw</div>
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            {unspun.map(e => (
              <div key={e.id} className="list-item">
                <span style={{ fontWeight: 600 }}>{e.playerName}</span>
                <button className="btn btn-primary btn-sm" onClick={() => onSpin(e)}>
                  Spin
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {unspun.length === 0 && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <i className="ti ti-check" /> All entries drawn
        </div>
      )}

      {spun.length > 0 && (
        <>
          <div className="section-label" style={{ marginBottom: 8 }}>
            {unspun.length === 0 ? 'Results' : 'Already drawn'}
          </div>
          <div className="card" style={{ padding: 0 }}>
            {spun.map(e => (
              <div key={e.id} className="list-item">
                <span style={{ fontWeight: 600 }}>{e.playerName}</span>
                <span style={{ fontSize: 13, color: 'var(--emerald)', fontWeight: 600 }}>
                  {isRacing ? e.assignedRunnerName : e.assignedTeamName}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Results tab ───────────────────────────────────────────────────────────

function ResultsTab({ detail, competitionId, onUpdate }: {
  detail: CompetitionDetail
  competitionId: number
  onUpdate: () => void
}) {
  const { prizePositions, results, entries, poolOptions } = detail
  const isRacing = detail.competition.poolType === 'racing'

  const [resultMap, setResultMap] = useState<Record<number, number>>(() => {
    const m: Record<number, number> = {}
    for (const r of results) {
      const id = isRacing ? r.runnerId : r.teamId
      if (id) m[r.prizePositionId] = id
    }
    return m
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = prizePositions.map(pp => ({
        prizePositionId: pp.id,
        ...(isRacing
          ? { runnerId: resultMap[pp.id] || undefined }
          : { teamId: resultMap[pp.id] || undefined }),
      }))
      await api.put(`/competitions/${competitionId}/results`, { results: payload })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function getWinners(prizePositionId: number): string[] {
    const optionId = resultMap[prizePositionId]
    if (!optionId) return []
    return entries
      .filter(e => isRacing ? e.assignedRunnerId === optionId : e.assignedTeamId === optionId)
      .map(e => e.playerName)
  }

  if (prizePositions.length === 0) {
    return (
      <div className="empty-state">No prize positions — configure them in Overview</div>
    )
  }

  return (
    <div style={{ padding: '0 18px' }}>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Results saved</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {prizePositions.map(pp => {
          const winners = getWinners(pp.id)
          return (
            <div key={pp.id} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: winners.length ? 8 : 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, width: 44, flexShrink: 0,
                  color: 'var(--text-secondary)',
                }}>
                  {pp.label}
                </div>
                <select
                  style={{ flex: 1, padding: '6px 10px', minHeight: 36 }}
                  value={resultMap[pp.id] ?? ''}
                  onChange={e => setResultMap({ ...resultMap, [pp.id]: Number(e.target.value) })}
                >
                  <option value="">— not set —</option>
                  {poolOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              {winners.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--emerald)', paddingLeft: 54, fontWeight: 600 }}>
                  {winners.join(' · ')}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
        {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save results'}
      </button>
    </div>
  )
}
