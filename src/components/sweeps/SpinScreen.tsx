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

const CONFETTI_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#ffffff', '#a78bfa', '#6ee7b7']

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

      // Exclude the winner from the cycling names so it only appears at the reveal
      const cycleNames = poolOptions.map(o => o.name).filter(n => n !== winner)
      const PRE = 48
      const seq: string[] = []
      while (seq.length < PRE && cycleNames.length > 0) {
        seq.push(...[...cycleNames].sort(() => Math.random() - 0.5))
      }
      seq.splice(PRE)
      seq.push(winner)

      let i = 0
      const tick = () => {
        setDisplayName(seq[i])
        i++
        if (i >= seq.length) { setPhase('result'); return }
        const progress = i / seq.length
        // Fast start (35ms), quintic deceleration — stays fast for ~60% then drops sharply
        timerRef.current = setTimeout(tick, 35 + Math.pow(progress, 5) * 1400)
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
      {/* Confetti burst on reveal */}
      <Confetti active={revealed} />

      {phase !== 'spinning' && (
        <button
          className="btn-icon"
          style={{ position: 'absolute', top: 18, left: 16, zIndex: 2 }}
          onClick={isResult ? () => onComplete(resultRef.current!) : onCancel}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 20 }} />
        </button>
      )}

      {/* Player name */}
      <div style={{ marginBottom: 40, position: 'relative', zIndex: 2 }}>
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
        position: 'relative', zIndex: 2,
      }}>
        {phase === 'ready' ? (
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Press spin</span>
        ) : (
          <div style={{
            padding: '0 18px',
            transform: isResult ? (revealed ? 'scale(1)' : 'scale(0.35)') : 'scale(1)',
            opacity: isResult ? (revealed ? 1 : 0) : 1,
            transition: isResult
              ? 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s'
              : 'none',
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
        <div className="alert alert-error" style={{ marginBottom: 20, maxWidth: 300, zIndex: 2, position: 'relative' }}>
          {error}
        </div>
      )}

      {phase === 'ready' && (
        <button
          className="btn btn-primary"
          style={{ fontSize: 17, padding: '16px 56px', borderRadius: 100, letterSpacing: '0.06em', position: 'relative', zIndex: 2 }}
          onClick={handleSpin}
        >
          SPIN
        </button>
      )}

      {phase === 'spinning' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, position: 'relative', zIndex: 2 }}>
          <span className="spinner" style={{ width: 14, height: 14, verticalAlign: 'middle', marginRight: 8 }} />
          Drawing…
        </div>
      )}

      {isResult && (
        <div style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.35s 0.3s, transform 0.35s 0.3s',
          position: 'relative', zIndex: 2,
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

// ── Canvas confetti ───────────────────────────────────────────────────────

interface Piece {
  x: number; y: number
  vx: number; vy: number
  rot: number; vrot: number
  color: string
  w: number; h: number
  opacity: number
}

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()

  // Each time active flips to true, fire a fresh burst
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Burst origin: centre of screen, slightly above mid (where the wheel is)
    const ox = canvas.width / 2
    const oy = canvas.height * 0.42

    const pieces: Piece[] = Array.from({ length: 90 }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 4 + Math.random() * 10
      return {
        x: ox, y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4, // bias upward
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.25,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        w: 7 + Math.random() * 7,
        h: 4 + Math.random() * 4,
        opacity: 1,
      }
    })

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of pieces) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.28        // gravity
        p.vx *= 0.995       // slight air resistance
        p.rot += p.vrot
        p.opacity -= 0.012
        if (p.opacity <= 0) continue
        alive = true
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (alive) rafRef.current = requestAnimationFrame(animate)
    }
    animate()

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 1,
      }}
    />
  )
}
