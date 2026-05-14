import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/client'
import type { Entry } from '../../types'

interface Props {
  competitionId: number
  entry: Entry
  poolType: 'racing' | 'knockout'
  poolOptions: { id: number; name: string }[]
  onComplete: (updated: Entry) => void
  onCancel: () => void
}

export default function SpinScreen({ competitionId, entry, poolType, poolOptions, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<'ready' | 'spinning' | 'result'>('ready')
  const [displayName, setDisplayName] = useState(poolOptions[0]?.name ?? '…')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState('')
  const resultRef = useRef<Entry | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  useEffect(() => {
    if (phase === 'result') setTimeout(() => setRevealed(true), 60)
  }, [phase])

  async function handleSpin() {
    if (phase !== 'ready') return
    setPhase('spinning')
    setError('')
    setRevealed(false)

    try {
      const res = await api.post<{
        assignedRunner?: { id: number; name: string }
        assignedTeam?: { id: number; name: string }
      }>(`/competitions/${competitionId}/entries/${entry.id}/spin`, {})

      const winner = res.assignedRunner?.name ?? res.assignedTeam?.name ?? '?'
      resultRef.current = {
        ...entry,
        spunAt: new Date().toISOString(),
        ...(res.assignedRunner
          ? { assignedRunnerId: res.assignedRunner.id, assignedRunnerName: res.assignedRunner.name }
          : {}),
        ...(res.assignedTeam
          ? { assignedTeamId: res.assignedTeam.id, assignedTeamName: res.assignedTeam.name }
          : {}),
      }

      const names = poolOptions.map(o => o.name)
      const PRE = 22
      const seq = Array.from({ length: PRE }, (_, i) => names[i % names.length])
      seq.push(winner)

      let i = 0
      const tick = () => {
        setDisplayName(seq[i])
        i++
        if (i >= seq.length) { setPhase('result'); return }
        const progress = i / seq.length
        timerRef.current = setTimeout(tick, 65 + Math.pow(progress, 2.2) * 900)
      }
      tick()

    } catch (err) {
      setPhase('ready')
      setError(err instanceof Error ? err.message : 'Spin failed — try again')
    }
  }

  const noun = poolType === 'racing' ? 'runner' : 'team'
  const isResult = phase === 'result'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, textAlign: 'center',
    }}>
      {phase !== 'spinning' && (
        <button
          className="btn-icon"
          style={{ position: 'absolute', top: 18, left: 16 }}
          onClick={isResult ? () => onComplete(resultRef.current!) : onCancel}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 20 }} />
        </button>
      )}

      {/* Player name */}
      <div style={{ marginBottom: 40 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8,
        }}>
          Drawing {noun} for
        </div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{entry.playerName}</div>
      </div>

      {/* Wheel */}
      <div style={{
        width: 220, height: 220, borderRadius: '50%',
        border: `3px solid ${isResult ? 'var(--emerald)' : 'rgba(255,255,255,0.10)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 48,
        background: isResult ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
        boxShadow: isResult ? '0 0 56px rgba(52,211,153,0.18)' : 'none',
        transition: 'border-color 0.5s, background 0.5s, box-shadow 0.6s',
        overflow: 'hidden',
      }}>
        {phase === 'ready' ? (
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Press spin</span>
        ) : (
          <div style={{
            padding: '0 18px',
            transform: isResult ? (revealed ? 'scale(1)' : 'scale(0.35)') : 'scale(1)',
            opacity: isResult ? (revealed ? 1 : 0) : 1,
            transition: isResult ? 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s' : 'none',
          }}>
            <div style={{
              fontSize: displayName.length > 14 ? 15 : displayName.length > 10 ? 18 : 22,
              fontWeight: 800,
              lineHeight: 1.3,
              color: isResult ? 'var(--emerald)' : 'var(--text-primary)',
              transition: 'color 0.4s',
            }}>
              {displayName}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 20, maxWidth: 300 }}>{error}</div>
      )}

      {phase === 'ready' && (
        <button
          className="btn btn-primary"
          style={{ fontSize: 17, padding: '16px 56px', borderRadius: 100, letterSpacing: '0.06em' }}
          onClick={handleSpin}
        >
          SPIN
        </button>
      )}

      {phase === 'spinning' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          <span className="spinner" style={{ width: 14, height: 14, verticalAlign: 'middle', marginRight: 8 }} />
          Drawing…
        </div>
      )}

      {isResult && (
        <div style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.35s 0.25s, transform 0.35s 0.25s',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
            {entry.playerName} drew{' '}
            <strong style={{ color: 'var(--emerald)' }}>{displayName}</strong>
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: '12px 40px' }}
            onClick={() => onComplete(resultRef.current!)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
