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
  const [qrSvg, setQrSvg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    setError('')
    setLoading(true)
    setInvite(null)
    setQrSvg('')
    try {
      const res = await api.post<InviteResponse>('/auth/invite', {})
      setInvite(res)
      const QRCode = await import('qrcode')
      const svg = await QRCode.toString(res.inviteUrl, { type: 'svg', width: 220, margin: 2 })
      setQrSvg(svg)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setInvite(null)
    setQrSvg('')
  }

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {!invite ? (
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading
            ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating…</>
            : <><i className="ti ti-qrcode" /> Generate manager invite</>}
        </button>
      ) : (
        <div style={{ textAlign: 'center' }}>
          {qrSvg ? (
            <div
              style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 12 }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div style={{ padding: 40 }}><span className="spinner" /></div>
          )}
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            Manager invite · expires {new Date(invite.expiresAt).toLocaleTimeString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', wordBreak: 'break-all', marginTop: 4, padding: '0 8px' }}>
            {invite.inviteUrl}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard.writeText(invite.inviteUrl)}
            >
              <i className="ti ti-copy" /> Copy link
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Generate another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
