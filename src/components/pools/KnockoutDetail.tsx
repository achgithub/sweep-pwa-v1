import { useState } from 'react'
import { api } from '../../api/client'
import type {
  PoolDetail, Team, TournamentGroup, GroupMembership,
  GroupMatch, KnockoutStage, KnockoutMatch,
} from '../../types'

type SubTab = 'teams' | 'groups' | 'bracket'

interface Props {
  detail: PoolDetail
  onRefresh: () => void
}

export default function KnockoutDetail({ detail, onRefresh }: Props) {
  const hasGroups = !!detail.pool.hasGroupStage
  const tabs: SubTab[] = hasGroups ? ['teams', 'groups', 'bracket'] : ['teams', 'bracket']
  const [tab, setTab] = useState<SubTab>('teams')

  return (
    <div>
      <div className="pill-row" style={{ padding: '4px 18px 12px' }}>
        {tabs.map(t => (
          <button key={t} className={`pill${tab === t ? ' pill--active' : ''}`}
            onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 18px' }}>
        {tab === 'teams'   && <TeamsPanel   detail={detail} onRefresh={onRefresh} />}
        {tab === 'groups'  && <GroupsPanel  detail={detail} onRefresh={onRefresh} />}
        {tab === 'bracket' && <BracketPanel detail={detail} onRefresh={onRefresh} />}
      </div>
    </div>
  )
}

// ── Teams ─────────────────────────────────────────────────────────────────

function TeamsPanel({ detail, onRefresh }: Props) {
  const teams = detail.teams ?? []
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function addTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (teams.some(t => t.name.toLowerCase() === name.trim().toLowerCase())) {
      setError(`"${name.trim()}" is already in this pool`)
      return
    }
    setAdding(true)
    setError('')
    try {
      await api.post(`/pools/${detail.pool.id}/teams`, { name: name.trim() })
      setName('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  async function deleteTeam(team: Team) {
    setDeleting(team.id)
    setError('')
    try {
      await api.delete(`/pools/${detail.pool.id}/teams/${team.id}`)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot delete — team may be assigned')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="section-header" style={{ marginBottom: 12 }}>
        <div className="section-label" style={{ margin: 0 }}>
          Teams <span style={{ color: 'var(--indigo)' }}>({teams.length})</span>
        </div>
      </div>

      <form onSubmit={addTeam} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Team name" style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={adding || !name.trim()}>
          {adding ? <span className="spinner" /> : <><i className="ti ti-plus" /> Add</>}
        </button>
      </form>

      {teams.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 13 }}>No teams yet. Add them above.</div>
        </div>
      ) : (
        <div className="card" style={{ flexDirection: 'column', gap: 0, padding: 0 }}>
          {teams.map((team, i) => (
            <div key={team.id} className="list-item"
              style={{ borderTop: i > 0 ? '1px solid var(--border-default)' : 'none' }}>
              <span style={{ fontWeight: 500 }}>{team.name}</span>
              <button className="btn-icon" onClick={() => deleteTeam(team)}
                disabled={deleting === team.id} aria-label="Remove team">
                {deleting === team.id
                  ? <span className="spinner" style={{ width: 12, height: 12 }} />
                  : <i className="ti ti-x" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Groups ────────────────────────────────────────────────────────────────

function GroupsPanel({ detail, onRefresh }: Props) {
  const groups  = detail.groups ?? []
  const teams   = detail.teams ?? []
  const members = detail.groupMemberships ?? []
  const matches = detail.groupMatches ?? []

  const [groupName, setGroupName] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [error, setError] = useState('')

  async function addGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!groupName.trim()) return
    if (groups.some(g => g.name.toLowerCase() === groupName.trim().toLowerCase())) {
      setError(`"${groupName.trim()}" already exists`)
      return
    }
    setAddingGroup(true)
    setError('')
    try {
      await api.post(`/pools/${detail.pool.id}/groups`, { name: groupName.trim() })
      setGroupName('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add group')
    } finally {
      setAddingGroup(false)
    }
  }

  async function deleteGroup(g: TournamentGroup) {
    if (!confirm(`Delete ${g.name} and all its fixtures?`)) return
    try {
      await api.delete(`/pools/${detail.pool.id}/groups/${g.id}`)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <form onSubmit={addGroup} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)}
          placeholder="Group name e.g. Group A" style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={addingGroup || !groupName.trim()}>
          {addingGroup ? <span className="spinner" /> : <><i className="ti ti-plus" /> Add</>}
        </button>
      </form>

      {groups.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 13 }}>No groups yet. Add one above.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map(group => {
            const groupMembers  = members.filter(m => m.groupId === group.id)
            const groupMatches  = matches.filter(m => m.groupId === group.id)
            // Exclude teams already in ANY group, not just this one
            const allAssignedIds = members.map(m => m.teamId)
            const available     = teams.filter(t => !allAssignedIds.includes(t.id))
            return (
              <GroupSection
                key={group.id}
                poolId={detail.pool.id}
                group={group}
                members={groupMembers}
                matches={groupMatches}
                availableTeams={available}
                onRefresh={onRefresh}
                onDelete={() => deleteGroup(group)}
              />
            )
          })}
        </div>
      )}
    </>
  )
}

function GroupSection({ poolId, group, members, matches, availableTeams, onRefresh, onDelete }: {
  poolId: number
  group: TournamentGroup
  members: GroupMembership[]
  matches: GroupMatch[]
  availableTeams: Team[]
  onRefresh: () => void
  onDelete: () => void
}) {
  const [addTeamId, setAddTeamId] = useState('')
  const [homeId, setHomeId] = useState('')
  const [awayId, setAwayId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [addingMatch, setAddingMatch] = useState(false)
  const [scoringMatch, setScoringMatch] = useState<number | null>(null)
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [error, setError] = useState('')

  async function addMember() {
    if (!addTeamId) return
    try {
      await api.post(`/pools/${poolId}/groups/${group.id}/members`, { teamId: Number(addTeamId) })
      setAddTeamId('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function removeMember(teamId: number) {
    try {
      await api.delete(`/pools/${poolId}/groups/${group.id}/members/${teamId}`)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function addMatch(e: React.FormEvent) {
    e.preventDefault()
    if (!homeId || !awayId || homeId === awayId) return
    setAddingMatch(true)
    try {
      await api.post(`/pools/${poolId}/group-matches`, {
        groupId: group.id,
        homeTeamId: Number(homeId),
        awayTeamId: Number(awayId),
        scheduledAt: scheduledAt || null,
      })
      setHomeId(''); setAwayId(''); setScheduledAt('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setAddingMatch(false)
    }
  }

  async function saveScore(matchId: number) {
    try {
      await api.patch(`/pools/${poolId}/group-matches/${matchId}`, {
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
      })
      setScoringMatch(null)
      setHomeScore(''); setAwayScore('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function updateMatchDate(matchId: number, scheduledAt: string) {
    try {
      await api.patch(`/pools/${poolId}/group-matches/${matchId}`, {
        homeScore: undefined,
        awayScore: undefined,
        scheduledAt,
      })
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function deleteMatch(matchId: number) {
    try {
      await api.delete(`/pools/${poolId}/group-matches/${matchId}`)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  const sorted = [...members].sort((a, b) =>
    b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga)
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{group.name}</div>
        <button className="btn-icon" onClick={onDelete} style={{ color: 'var(--red)' }}>
          <i className="ti ti-trash" />
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 8, fontSize: 12 }}>{error}</div>}

      {/* Team membership */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {members.map(m => (
          <span key={m.teamId} className="badge badge-open" style={{ cursor: 'pointer' }}
            onClick={() => removeMember(m.teamId)}>
            {m.teamName} <i className="ti ti-x" style={{ fontSize: 9 }} />
          </span>
        ))}
        {availableTeams.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={addTeamId} onChange={e => setAddTeamId(e.target.value)}
              style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }}>
              <option value="">+ Add team</option>
              {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {addTeamId && (
              <button className="btn btn-primary btn-sm" onClick={addMember}>Add</button>
            )}
          </div>
        )}
      </div>

      {/* Standings */}
      {members.length > 0 && (
        <div className="table-wrap card" style={{ padding: 0, marginBottom: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th style={{ textAlign: 'center' }}>P</th>
                <th style={{ textAlign: 'center' }}>W</th>
                <th style={{ textAlign: 'center' }}>D</th>
                <th style={{ textAlign: 'center' }}>L</th>
                <th style={{ textAlign: 'center' }}>GD</th>
                <th style={{ textAlign: 'center' }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => (
                <tr key={m.teamId}>
                  <td style={{ fontWeight: 600 }}>{m.teamName}</td>
                  <td style={{ textAlign: 'center' }}>{m.played}</td>
                  <td style={{ textAlign: 'center' }}>{m.won}</td>
                  <td style={{ textAlign: 'center' }}>{m.drawn}</td>
                  <td style={{ textAlign: 'center' }}>{m.lost}</td>
                  <td style={{ textAlign: 'center', color: m.gf - m.ga >= 0 ? 'var(--emerald)' : 'var(--red)' }}>
                    {m.gf - m.ga >= 0 ? '+' : ''}{m.gf - m.ga}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--indigo)' }}>{m.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fixtures */}
      {matches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {matches.map(match => (
            <div key={match.id} className="card" style={{ gap: 8, flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, textAlign: 'right' }}>
                  {match.homeTeamName}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>
                  {match.status === 'complete'
                    ? `${match.homeScore} – ${match.awayScore}`
                    : 'vs'}
                </span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>
                  {match.awayTeamName}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {match.status !== 'complete' && (
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => { setScoringMatch(match.id); setHomeScore(''); setAwayScore('') }}>
                      Score
                    </button>
                  )}
                  <button className="btn-icon" onClick={() => deleteMatch(match.id)}>
                    <i className="ti ti-x" />
                  </button>
                </div>
              </div>
              {/* Date — always editable until complete */}
              {match.status !== 'complete' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Date &amp; time</label>
                  <input type="datetime-local"
                    defaultValue={match.scheduledAt?.slice(0, 16) ?? ''}
                    onBlur={e => e.target.value && updateMatchDate(match.id, e.target.value)}
                    style={{ flex: 1, fontSize: 12 }} />
                </div>
              ) : match.scheduledAt ? (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {new Date(match.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              ) : null}
              {scoringMatch === match.id && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" min={0} value={homeScore} onChange={e => setHomeScore(e.target.value)}
                    placeholder="0" style={{ width: 56, textAlign: 'center' }} />
                  <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                  <input type="number" min={0} value={awayScore} onChange={e => setAwayScore(e.target.value)}
                    placeholder="0" style={{ width: 56, textAlign: 'center' }} />
                  <button className="btn btn-success btn-sm"
                    onClick={() => saveScore(match.id)}
                    disabled={homeScore === '' || awayScore === ''}>
                    Save
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setScoringMatch(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add fixture */}
      {members.length >= 2 && (
        <form onSubmit={addMatch}>
          <div className="section-label">Add fixture</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <select value={homeId} onChange={e => setHomeId(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
              <option value="">Home team</option>
              {members.map(m => <option key={m.teamId} value={m.teamId}>{m.teamName}</option>)}
            </select>
            <select value={awayId} onChange={e => setAwayId(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
              <option value="">Away team</option>
              {members.map(m => m.teamId !== Number(homeId) && (
                <option key={m.teamId} value={m.teamId}>{m.teamName}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Date &amp; time</label>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              style={{ flex: 1 }} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm"
            disabled={addingMatch || !homeId || !awayId || homeId === awayId}>
            {addingMatch ? <span className="spinner" /> : 'Add fixture'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Bracket ───────────────────────────────────────────────────────────────

function BracketPanel({ detail, onRefresh }: Props) {
  const stages  = detail.knockoutStages ?? []
  const matches = detail.knockoutMatches ?? []
  const teams   = detail.teams ?? []

  const [stageName, setStageName] = useState('')
  const [matchCount, setMatchCount] = useState('4')
  const [addingStage, setAddingStage] = useState(false)
  const [error, setError] = useState('')

  const sortedStages = [...stages].sort((a, b) => a.stageOrder - b.stageOrder)
  const isFirstStageSet = stages.some(s => s.isFirstStage)

  async function addStage(e: React.FormEvent) {
    e.preventDefault()
    if (!stageName.trim() || !matchCount) return
    setAddingStage(true)
    setError('')
    try {
      const nextOrder = stages.length ? Math.max(...stages.map(s => s.stageOrder)) + 1 : 1
      await api.post(`/pools/${detail.pool.id}/knockout-stages`, {
        name: stageName.trim(),
        stageOrder: nextOrder,
        isFirstStage: !isFirstStageSet,
        matchCount: Number(matchCount),
      })
      setStageName('')
      setMatchCount('4')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stage')
    } finally {
      setAddingStage(false)
    }
  }

  return (
    <>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Add stage form */}
      <form onSubmit={addStage} style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="text" value={stageName} onChange={e => setStageName(e.target.value)}
          placeholder="Stage name e.g. Quarter-finals" style={{ flex: 1, minWidth: 160 }} />
        <input type="number" value={matchCount} onChange={e => setMatchCount(e.target.value)}
          min={1} placeholder="Matches" style={{ width: 90 }} />
        <button type="submit" className="btn btn-primary btn-sm"
          disabled={addingStage || !stageName.trim() || !matchCount}>
          {addingStage ? <span className="spinner" /> : <><i className="ti ti-plus" /> Add stage</>}
        </button>
      </form>

      {stages.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <div style={{ fontSize: 13 }}>No stages yet. Add the first stage above (e.g. Quarter-finals with 4 matches).</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sortedStages.map(stage => {
            const stageMatches = matches
              .filter(m => m.stageId === stage.id)
              .sort((a, b) => a.matchNumber - b.matchNumber)
            return (
              <StageSection
                key={stage.id}
                poolId={detail.pool.id}
                stage={stage}
                matches={stageMatches}
                teams={teams}
                onRefresh={onRefresh}
              />
            )
          })}
        </div>
      )}
    </>
  )
}

function StageSection({ poolId, stage, matches, teams, onRefresh }: {
  poolId: number
  stage: KnockoutStage
  matches: KnockoutMatch[]
  teams: Team[]
  onRefresh: () => void
}) {
  const [scoringId, setScoringId] = useState<number | null>(null)
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [error, setError] = useState('')

  async function setTeam(matchId: number, side: 'home' | 'away', teamId: number) {
    try {
      await api.patch(`/pools/${poolId}/knockout-matches/${matchId}`, {
        [side === 'home' ? 'homeTeamId' : 'awayTeamId']: teamId,
      })
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function setSchedule(matchId: number, scheduledAt: string) {
    try {
      await api.patch(`/pools/${poolId}/knockout-matches/${matchId}`, { scheduledAt })
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function saveScore(matchId: number) {
    try {
      await api.patch(`/pools/${poolId}/knockout-matches/${matchId}`, {
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
      })
      setScoringId(null)
      setHomeScore(''); setAwayScore('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{stage.name}</div>
        {stage.isFirstStage && (
          <span className="badge badge-open" style={{ fontSize: 10 }}>Manual draw</span>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 8, fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matches.map(match => {
          // Teams already assigned elsewhere in this stage (exclude current match's own picks)
          const usedInStage = matches
            .filter(m => m.id !== match.id)
            .flatMap(m => [m.homeTeamId, m.awayTeamId].filter(Boolean) as number[])
          const availableHome = teams.filter(t => t.id !== match.awayTeamId && !usedInStage.includes(t.id))
          const availableAway = teams.filter(t => t.id !== match.homeTeamId && !usedInStage.includes(t.id))

          return (
          <div key={match.id} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Home team */}
              {stage.isFirstStage && !match.homeTeamId ? (
                <select style={{ flex: 1, fontSize: 13 }}
                  onChange={e => e.target.value && setTeam(match.id, 'home', Number(e.target.value))}>
                  <option value="">Select home team</option>
                  {availableHome.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, textAlign: 'right' }}>
                  {match.homeTeamName ?? <span style={{ color: 'var(--text-tertiary)' }}>TBD</span>}
                </span>
              )}

              {/* Score */}
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 48, textAlign: 'center' }}>
                {match.status === 'complete'
                  ? <strong style={{ color: 'var(--text-primary)' }}>{match.homeScore} – {match.awayScore}</strong>
                  : 'vs'}
              </span>

              {/* Away team */}
              {stage.isFirstStage && !match.awayTeamId ? (
                <select style={{ flex: 1, fontSize: 13 }}
                  onChange={e => e.target.value && setTeam(match.id, 'away', Number(e.target.value))}>
                  <option value="">Select away team</option>
                  {availableAway.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>
                  {match.awayTeamName ?? <span style={{ color: 'var(--text-tertiary)' }}>TBD</span>}
                </span>
              )}

              {/* Actions */}
              {match.homeTeamId && match.awayTeamId && match.status !== 'complete' && (
                <button className="btn btn-secondary btn-sm"
                  onClick={() => { setScoringId(match.id); setHomeScore(''); setAwayScore('') }}>
                  Score
                </button>
              )}
              {match.status === 'complete' && (
                <span className="badge badge-active" style={{ fontSize: 10, flexShrink: 0 }}>
                  <i className="ti ti-check" />
                  {match.winnerTeamName}
                </span>
              )}
            </div>

            {/* Schedule datetime */}
            {match.homeTeamId && match.awayTeamId && match.status !== 'complete' && (
              <input type="datetime-local"
                defaultValue={match.scheduledAt?.slice(0, 16) ?? ''}
                onBlur={e => e.target.value && setSchedule(match.id, e.target.value)}
                style={{ fontSize: 12 }} />
            )}

            {/* Score entry */}
            {scoringId === match.id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" min={0} value={homeScore} onChange={e => setHomeScore(e.target.value)}
                  placeholder="0" style={{ width: 56, textAlign: 'center' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                <input type="number" min={0} value={awayScore} onChange={e => setAwayScore(e.target.value)}
                  placeholder="0" style={{ width: 56, textAlign: 'center' }} />
                <button className="btn btn-success btn-sm"
                  onClick={() => saveScore(match.id)}
                  disabled={homeScore === '' || awayScore === ''}>
                  Save
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setScoringId(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )
        })}
      </div>
    </div>
  )
}
