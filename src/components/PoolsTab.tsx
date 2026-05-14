export default function PoolsTab() {
  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      <div className="empty-state">
        <i className="ti ti-database" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
        <div style={{ fontWeight: 700, marginBottom: 4 }}>No pools yet</div>
        <div style={{ fontSize: 13 }}>A pool holds your runners or teams. Create one to get started.</div>
      </div>
    </div>
  )
}
