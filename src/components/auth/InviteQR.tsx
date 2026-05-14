import { useState } from 'react'
import { api } from '../../api/client'

interface InviteResponse {
  token: string
  inviteUrl: string
  role: string
  expiresAt: string
}

export default function InviteQR() {
  const [invite, setInvite] = useState<InviteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    setError('')
    setLoading(true)
    try {
      const res = await api.post<InviteResponse>('/auth/invite', {})
      setInvite(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <div className="alert alert-error mt-8">{error}</div>}

      {!invite ? (
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? <span className="spinner" /> : <><i className="ti ti-qrcode" /> Generate manager invite</>}
        </button>
      ) : (
        <div className="card" style={{ gap: 16, flexDirection: 'column', alignItems: 'flex-start' }}>
          <div>
            <div className="section-label">Manager invite link</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all', marginTop: 4 }}>{invite.inviteUrl}</p>
          </div>
          <div style={{ fontSize: 12, color: 'var(--amber)' }}>
            <i className="ti ti-clock" /> Expires in 24 hours · one use only
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(invite.inviteUrl) }}>
              <i className="ti ti-copy" /> Copy link
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setInvite(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
