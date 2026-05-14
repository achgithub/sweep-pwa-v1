import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import type { Pool } from '../types'
import PoolDetail from './pools/PoolDetail'

export default function PoolsTab() {
  const { user, isAdmin } = useAuth()
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState<'racing' | 'knockout'>('racing')
  const [createGroupStage, setCreateGroupStage] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copying, setCopying] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<Pool[]>('/pools')
      setPools(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const pool = await api.post<Pool>('/pools', {
        name: createName.trim(),
        type: createType,
        hasGroupStage: createGroupStage,
      })
      setCreateName('')
      setShowCreate(false)
      await load()
      setSelectedPool(pool)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy(pool: Pool) {
    setCopying(pool.id)
    setError('')
    try {
      const copied = await api.post<Pool>(`/pools/${pool.id}/copy`, {})
      await load()
      setSelectedPool(copied)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy')
    } finally {
      setCopying(null)
    }
  }

  if (selectedPool) {
    return (
      <PoolDetail
        poolId={selectedPool.id}
        onBack={() => { setSelectedPool(null); load() }}
      />
    )
  }

  const myPools    = pools.filter(p => p.ownerId === user?.id)
  const otherPools = pools.filter(p => p.ownerId !== user?.id)

  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="section-header">
        <div className="section-title">Pools</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(v => !v)}>
          <i className="ti ti-plus" /> New pool
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 16 }}>
          <div className="card-title">New pool</div>

          <div>
            <label>Pool name</label>
            <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
              placeholder="e.g. Grand National 2026" required autoFocus />
          </div>

          <div>
            <label style={{ marginBottom: 8, display: 'block' }}>Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['racing', 'knockout'] as const).map(t => (
                <button key={t} type="button"
                  className={`pill${createType === t ? ' pill--active' : ''}`}
                  onClick={() => setCreateType(t)}>
                  {t === 'racing' ? 'Racing' : 'Knockout'}
                </button>
              ))}
            </div>
          </div>

          {createType === 'knockout' && (
            <label className="checkbox-row">
              <input type="checkbox" checked={createGroupStage}
                onChange={e => setCreateGroupStage(e.target.checked)} />
              <span>Include group stage</span>
            </label>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
              {creating ? <span className="spinner" /> : 'Create'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : (
        <>
          {myPools.length === 0 && otherPools.length === 0 && !showCreate && (
            <div className="empty-state">
              <i className="ti ti-database" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
              <div style={{ fontWeight: 700, marginBottom: 4 }}>No pools yet</div>
              <div style={{ fontSize: 13 }}>A pool holds your runners or teams. Create one to get started.</div>
            </div>
          )}

          {myPools.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 8 }}>My pools</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myPools.map(pool => (
                  <PoolCard key={pool.id} pool={pool} onClick={() => setSelectedPool(pool)} />
                ))}
              </div>
            </>
          )}

          {otherPools.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 16 }}>
                {isAdmin ? 'All pools' : 'Available to copy'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {otherPools.map(pool => (
                  <PoolCard
                    key={pool.id}
                    pool={pool}
                    onClick={isAdmin ? () => setSelectedPool(pool) : undefined}
                    onCopy={!isAdmin ? () => handleCopy(pool) : undefined}
                    copyLoading={copying === pool.id}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function PoolCard({ pool, onClick, onCopy, copyLoading }: {
  pool: Pool
  onClick?: () => void
  onCopy?: () => void
  copyLoading?: boolean
}) {
  const statusClass = pool.status === 'active' ? 'badge-active'
    : pool.status === 'complete' ? 'badge-completed' : 'badge-pending'
  const statusIcon = pool.status === 'active' ? 'ti-check'
    : pool.status === 'complete' ? 'ti-star' : 'ti-clock'

  return (
    <div className="card" style={{ cursor: onClick ? 'pointer' : 'default', gap: 12 }}
      onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className={`card-icon ${pool.status === 'active' ? 'card-icon--live' : 'card-icon--done'}`}>
        <i className={`ti ${pool.type === 'racing' ? 'ti-flag-3' : 'ti-tournament'}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{pool.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {pool.type === 'racing' ? 'Racing'
            : pool.hasGroupStage ? 'Knockout + groups' : 'Straight knockout'}
          {' · '}{pool.ownerName}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span className={`badge ${statusClass}`}>
          <i className={`ti ${statusIcon}`} aria-hidden="true" />
          {pool.status}
        </span>
        {onCopy && (
          <button className="btn btn-secondary btn-sm"
            onClick={e => { e.stopPropagation(); onCopy() }} disabled={copyLoading}>
            {copyLoading ? <span className="spinner" /> : <><i className="ti ti-copy" /> Copy</>}
          </button>
        )}
        {onClick && (
          <i className="ti ti-chevron-right" style={{ color: 'var(--text-tertiary)' }} />
        )}
      </div>
    </div>
  )
}
