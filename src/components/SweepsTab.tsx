export default function SweepsTab() {
  return (
    <div className="app-content" style={{ padding: '16px 18px 80px' }}>
      <div className="empty-state">
        <i className="ti ti-trophy" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
        <div style={{ fontWeight: 700, marginBottom: 4 }}>No sweeps yet</div>
        <div style={{ fontSize: 13 }}>Create a pool first, then start a sweep on it.</div>
      </div>
    </div>
  )
}
