export default function PlayersTab() {
  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      <div className="empty-state">
        <i className="ti ti-users" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
        <div style={{ fontWeight: 700, marginBottom: 4 }}>No players yet</div>
        <div style={{ fontSize: 13 }}>Add your players here. They're stored under your account.</div>
      </div>
    </div>
  )
}
