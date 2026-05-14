import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/client'
import type { PoolDetail as PoolDetailType } from '../../types'
import RacingDetail from './RacingDetail'
import KnockoutDetail from './KnockoutDetail'

interface Props {
  poolId: number
  onBack: () => void
}

export default function PoolDetail({ poolId, onBack }: Props) {
  const [detail, setDetail] = useState<PoolDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const hasLoaded = useRef(false)

  useEffect(() => {
    hasLoaded.current = false
    load()
  }, [poolId])

  async function load() {
    if (!hasLoaded.current) setLoading(true)
    try {
      const data = await api.get<PoolDetailType>(`/pools/${poolId}`)
      setDetail(data)
      hasLoaded.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const pool = detail?.pool

  return (
    <div className="app-content" style={{ padding: '0 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px 12px' }}>
        <button className="btn-icon" onClick={onBack}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pool?.name ?? '…'}
          </div>
          {pool && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
              {pool.type === 'racing' ? 'Racing' : pool.hasGroupStage ? 'Knockout + groups' : 'Straight knockout'}
            </div>
          )}
        </div>
        {pool && (
          <StatusPill poolId={poolId} currentStatus={pool.status} onUpdate={load} />
        )}
      </div>

      {error && <div className="alert alert-error" style={{ margin: '0 18px 12px' }}>{error}</div>}

      {loading ? (
        <div className="empty-state" style={{ paddingTop: 60 }}><span className="spinner" /></div>
      ) : detail && (
        detail.pool.type === 'racing'
          ? <RacingDetail detail={detail} onRefresh={load} />
          : <KnockoutDetail detail={detail} onRefresh={load} />
      )}
    </div>
  )
}

function StatusPill({ poolId, currentStatus, onUpdate }: {
  poolId: number
  currentStatus: string
  onUpdate: () => void
}) {
  const [saving, setSaving] = useState(false)
  const next: Record<string, string> = { setup: 'active', active: 'complete', complete: 'setup' }
  const cls: Record<string, string>  = { setup: 'badge-pending', active: 'badge-active', complete: 'badge-completed' }

  async function cycle() {
    setSaving(true)
    try {
      await api.patch(`/pools/${poolId}`, { status: next[currentStatus] })
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <button className={`badge ${cls[currentStatus]}`} onClick={cycle} disabled={saving}
      style={{ cursor: 'pointer', border: '1px solid' }}>
      {saving ? <span className="spinner" style={{ width: 10, height: 10 }} /> : currentStatus}
    </button>
  )
}
