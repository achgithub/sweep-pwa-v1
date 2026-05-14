import { useState } from 'react'
import { api } from '../../api/client'
import type { PoolDetail, Runner } from '../../types'

interface Props {
  detail: PoolDetail
  onRefresh: () => void
}

export default function RacingDetail({ detail, onRefresh }: Props) {
  const runners = detail.runners ?? []
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function addRunner(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      await api.post(`/pools/${detail.pool.id}/runners`, { name: name.trim() })
      setName('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  async function deleteRunner(runner: Runner) {
    setDeleting(runner.id)
    setError('')
    try {
      await api.delete(`/pools/${detail.pool.id}/runners/${runner.id}`)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot delete — runner may be assigned in a sweep')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div style={{ padding: '4px 18px 0' }}>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="section-header" style={{ marginBottom: 12 }}>
        <div className="section-label" style={{ margin: 0 }}>
          Runners <span style={{ color: 'var(--indigo)' }}>({runners.length})</span>
        </div>
      </div>

      <form onSubmit={addRunner} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Runner name" style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={adding || !name.trim()}>
          {adding ? <span className="spinner" /> : <><i className="ti ti-plus" /> Add</>}
        </button>
      </form>

      {runners.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 13 }}>No runners yet. Add them above.</div>
        </div>
      ) : (
        <div className="card" style={{ flexDirection: 'column', gap: 0, padding: 0 }}>
          {runners.map((runner, i) => (
            <div key={runner.id} className="list-item"
              style={{ borderTop: i > 0 ? '1px solid var(--border-default)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 20, textAlign: 'right' }}>
                  {i + 1}
                </span>
                <span style={{ fontWeight: 500 }}>{runner.name}</span>
              </div>
              <button className="btn-icon" onClick={() => deleteRunner(runner)}
                disabled={deleting === runner.id} aria-label="Remove runner">
                {deleting === runner.id
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
