import InviteQR from './auth/InviteQR'

export default function ManagersTab() {
  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      <div style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Managers</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Invite managers to create and run their own sweeps.</p>
      </div>
      <InviteQR />
    </div>
  )
}
