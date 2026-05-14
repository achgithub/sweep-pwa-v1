import { Hono } from 'hono'
import { requireRole } from '../middleware/auth'
import type { HonoEnv } from '../lib/types'

const data = new Hono<HonoEnv>()

// ── Sync ──────────────────────────────────────────────────────────────────

// GET /sync — lightweight sync for offline cache
data.get('/sync', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')

  const isAdmin = userRole === 'admin'

  const pools = await c.env.DB.prepare(`
    SELECT p.id, p.owner_id as ownerId, u.name as ownerName,
           p.copied_from_id as copiedFromId, p.name, p.type,
           p.has_group_stage as hasGroupStage, p.status, p.created_at as createdAt
    FROM pools p
    JOIN users u ON u.id = p.owner_id
    WHERE ${isAdmin ? '1=1' : 'p.owner_id = ?'}
    ORDER BY p.created_at DESC
  `).bind(...(isAdmin ? [] : [userId])).all()

  const competitions = await c.env.DB.prepare(`
    SELECT c.id, c.manager_id as managerId, u.name as managerName,
           c.pool_id as poolId, p.name as poolName, p.type as poolType,
           c.name, c.status, c.created_at as createdAt,
           (SELECT COUNT(*) FROM entries e WHERE e.competition_id = c.id) as entryCount,
           (SELECT COUNT(*) FROM entries e WHERE e.competition_id = c.id AND e.spun_at IS NOT NULL) as spunCount
    FROM competitions c
    JOIN users u ON u.id = c.manager_id
    JOIN pools p ON p.id = c.pool_id
    WHERE ${isAdmin ? '1=1' : 'c.manager_id = ?'}
    ORDER BY c.created_at DESC
  `).bind(...(isAdmin ? [] : [userId])).all()

  const players = await c.env.DB.prepare(`
    SELECT pl.id, pl.manager_id as managerId, u.name as managerName,
           pl.name, pl.created_at as createdAt
    FROM players pl
    JOIN users u ON u.id = pl.manager_id
    WHERE ${isAdmin ? '1=1' : 'pl.manager_id = ?'}
    ORDER BY pl.name ASC
  `).bind(...(isAdmin ? [] : [userId])).all()

  return c.json({ pools: pools.results, competitions: competitions.results, players: players.results })
})

// ── Pools ─────────────────────────────────────────────────────────────────

// GET /pools — list accessible pools
data.get('/pools', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const isAdmin  = userRole === 'admin'

  // Managers see their own pools + admin-owned pools (as templates to copy)
  const rows = await c.env.DB.prepare(`
    SELECT p.id, p.owner_id as ownerId, u.name as ownerName,
           p.copied_from_id as copiedFromId, p.name, p.type,
           p.has_group_stage as hasGroupStage, p.status, p.created_at as createdAt
    FROM pools p
    JOIN users u ON u.id = p.owner_id
    WHERE ${isAdmin ? '1=1' : "p.owner_id = ? OR u.role = 'admin'"}
    ORDER BY u.role ASC, p.created_at DESC
  `).bind(...(isAdmin ? [] : [userId])).all()

  return c.json(rows.results)
})

// POST /pools — create a new pool
data.post('/pools', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ name: string; type: string; hasGroupStage?: boolean }>()

  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400)
  if (!['racing', 'knockout'].includes(body.type)) return c.json({ error: 'type must be racing or knockout' }, 400)

  const pool = await c.env.DB.prepare(
    `INSERT INTO pools (owner_id, name, type, has_group_stage)
     VALUES (?, ?, ?, ?)
     RETURNING id, owner_id as ownerId, name, type, has_group_stage as hasGroupStage, status, created_at as createdAt`
  ).bind(userId, body.name.trim(), body.type, body.type === 'knockout' && body.hasGroupStage !== false ? 1 : 0)
   .first()

  return c.json(pool, 201)
})

// POST /pools/:id/copy — manager copies an admin pool
data.post('/pools/:id/copy', async (c) => {
  const userId = c.get('userId')
  const sourceId = Number(c.req.param('id'))

  const source = await c.env.DB.prepare('SELECT * FROM pools WHERE id = ?').bind(sourceId).first<{
    id: number; name: string; type: string; has_group_stage: number; status: string
  }>()
  if (!source) return c.json({ error: 'Pool not found' }, 404)

  const newPool = await c.env.DB.prepare(
    `INSERT INTO pools (owner_id, copied_from_id, name, type, has_group_stage)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, owner_id as ownerId, copied_from_id as copiedFromId,
               name, type, has_group_stage as hasGroupStage, status, created_at as createdAt`
  ).bind(userId, sourceId, source.name, source.type, source.has_group_stage).first()

  // Copy runners (racing)
  if (source.type === 'racing') {
    const runners = await c.env.DB.prepare('SELECT name FROM runners WHERE pool_id = ?').bind(sourceId).all<{ name: string }>()
    for (const r of runners.results) {
      await c.env.DB.prepare('INSERT INTO runners (pool_id, name) VALUES (?, ?)').bind((newPool as { id: number }).id, r.name).run()
    }
  }

  // Copy teams + groups + group memberships + matches + knockout stages (knockout)
  if (source.type === 'knockout') {
    const teams = await c.env.DB.prepare('SELECT id, name FROM teams WHERE pool_id = ?').bind(sourceId).all<{ id: number; name: string }>()
    const teamIdMap = new Map<number, number>()
    for (const t of teams.results) {
      const newTeam = await c.env.DB.prepare('INSERT INTO teams (pool_id, name) VALUES (?, ?) RETURNING id').bind((newPool as { id: number }).id, t.name).first<{ id: number }>()
      teamIdMap.set(t.id, newTeam!.id)
    }

    if (source.has_group_stage) {
      const groups = await c.env.DB.prepare('SELECT id, name FROM tournament_groups WHERE pool_id = ?').bind(sourceId).all<{ id: number; name: string }>()
      for (const g of groups.results) {
        const newGroup = await c.env.DB.prepare('INSERT INTO tournament_groups (pool_id, name) VALUES (?, ?) RETURNING id').bind((newPool as { id: number }).id, g.name).first<{ id: number }>()
        const memberships = await c.env.DB.prepare('SELECT team_id FROM group_memberships WHERE group_id = ?').bind(g.id).all<{ team_id: number }>()
        for (const m of memberships.results) {
          await c.env.DB.prepare('INSERT INTO group_memberships (group_id, team_id) VALUES (?, ?)').bind(newGroup!.id, teamIdMap.get(m.team_id)).run()
        }
        const matches = await c.env.DB.prepare('SELECT home_team_id, away_team_id, scheduled_at FROM group_matches WHERE group_id = ?').bind(g.id).all<{ home_team_id: number; away_team_id: number; scheduled_at: string }>()
        for (const m of matches.results) {
          await c.env.DB.prepare('INSERT INTO group_matches (group_id, home_team_id, away_team_id, scheduled_at) VALUES (?, ?, ?, ?)').bind(newGroup!.id, teamIdMap.get(m.home_team_id), teamIdMap.get(m.away_team_id), m.scheduled_at).run()
        }
      }
    }

    const stages = await c.env.DB.prepare('SELECT id, name, stage_order, is_first_stage FROM knockout_stages WHERE pool_id = ? ORDER BY stage_order').bind(sourceId).all<{ id: number; name: string; stage_order: number; is_first_stage: number }>()
    for (const s of stages.results) {
      const newStage = await c.env.DB.prepare('INSERT INTO knockout_stages (pool_id, name, stage_order, is_first_stage) VALUES (?, ?, ?, ?) RETURNING id').bind((newPool as { id: number }).id, s.name, s.stage_order, s.is_first_stage).first<{ id: number }>()
      const matches = await c.env.DB.prepare('SELECT match_number FROM knockout_matches WHERE stage_id = ?').bind(s.id).all<{ match_number: number }>()
      for (const m of matches.results) {
        await c.env.DB.prepare('INSERT INTO knockout_matches (stage_id, match_number) VALUES (?, ?)').bind(newStage!.id, m.match_number).run()
      }
    }
  }

  return c.json(newPool, 201)
})

// GET /pools/:id — pool detail with all sub-data
data.get('/pools/:id', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare(`
    SELECT p.id, p.owner_id as ownerId, u.name as ownerName,
           p.copied_from_id as copiedFromId, p.name, p.type,
           p.has_group_stage as hasGroupStage, p.status, p.created_at as createdAt
    FROM pools p JOIN users u ON u.id = p.owner_id
    WHERE p.id = ?
  `).bind(poolId).first<{ ownerId: number; type: string; hasGroupStage: number }>()

  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && (pool as { ownerId: number }).ownerId !== userId) return c.json({ error: 'Forbidden' }, 403)

  const result: Record<string, unknown> = { pool }

  if ((pool as { type: string }).type === 'racing') {
    const runners = await c.env.DB.prepare('SELECT id, pool_id as poolId, name, created_at as createdAt FROM runners WHERE pool_id = ? ORDER BY name').bind(poolId).all()
    const runnerResults = await c.env.DB.prepare(`
      SELECT rr.id, rr.pool_id as poolId, rr.runner_id as runnerId, r.name as runnerName,
             rr.finishing_position as finishingPosition, rr.created_at as createdAt
      FROM runner_results rr JOIN runners r ON r.id = rr.runner_id
      WHERE rr.pool_id = ? ORDER BY rr.finishing_position
    `).bind(poolId).all()
    result.runners = runners.results
    result.runnerResults = runnerResults.results
  } else {
    const teams = await c.env.DB.prepare('SELECT id, pool_id as poolId, name, created_at as createdAt FROM teams WHERE pool_id = ? ORDER BY name').bind(poolId).all()
    result.teams = teams.results

    if ((pool as { hasGroupStage: number }).hasGroupStage) {
      const groups = await c.env.DB.prepare('SELECT id, pool_id as poolId, name, created_at as createdAt FROM tournament_groups WHERE pool_id = ? ORDER BY name').bind(poolId).all()
      const memberships = await c.env.DB.prepare(`
        SELECT gm.id, gm.group_id as groupId, gm.team_id as teamId, t.name as teamName,
               gm.played, gm.won, gm.drawn, gm.lost, gm.gf, gm.ga, gm.points
        FROM group_memberships gm JOIN teams t ON t.id = gm.team_id
        WHERE gm.group_id IN (SELECT id FROM tournament_groups WHERE pool_id = ?)
        ORDER BY gm.group_id, gm.points DESC, (gm.gf - gm.ga) DESC
      `).bind(poolId).all()
      const matches = await c.env.DB.prepare(`
        SELECT gm.id, gm.group_id as groupId,
               gm.home_team_id as homeTeamId, ht.name as homeTeamName,
               gm.away_team_id as awayTeamId, at.name as awayTeamName,
               gm.scheduled_at as scheduledAt, gm.home_score as homeScore,
               gm.away_score as awayScore, gm.status, gm.created_at as createdAt
        FROM group_matches gm
        JOIN teams ht ON ht.id = gm.home_team_id
        JOIN teams at ON at.id = gm.away_team_id
        WHERE gm.group_id IN (SELECT id FROM tournament_groups WHERE pool_id = ?)
        ORDER BY gm.scheduled_at ASC
      `).bind(poolId).all()
      result.groups = groups.results
      result.groupMemberships = memberships.results
      result.groupMatches = matches.results
    }

    const stages = await c.env.DB.prepare('SELECT id, pool_id as poolId, name, stage_order as stageOrder, is_first_stage as isFirstStage, created_at as createdAt FROM knockout_stages WHERE pool_id = ? ORDER BY stage_order').bind(poolId).all()
    const knockoutMatches = await c.env.DB.prepare(`
      SELECT km.id, km.stage_id as stageId, km.match_number as matchNumber,
             km.home_team_id as homeTeamId, ht.name as homeTeamName,
             km.away_team_id as awayTeamId, at.name as awayTeamName,
             km.scheduled_at as scheduledAt, km.home_score as homeScore,
             km.away_score as awayScore,
             km.winner_team_id as winnerTeamId, wt.name as winnerTeamName,
             km.status, km.created_at as createdAt
      FROM knockout_matches km
      LEFT JOIN teams ht ON ht.id = km.home_team_id
      LEFT JOIN teams at ON at.id = km.away_team_id
      LEFT JOIN teams wt ON wt.id = km.winner_team_id
      WHERE km.stage_id IN (SELECT id FROM knockout_stages WHERE pool_id = ?)
      ORDER BY km.stage_id, km.match_number
    `).bind(poolId).all()
    result.knockoutStages = stages.results
    result.knockoutMatches = knockoutMatches.results
  }

  return c.json(result)
})

// PATCH /pools/:id — update pool name or status
data.patch('/pools/:id', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ name?: string; status?: string }>()
  if (body.name !== undefined) {
    await c.env.DB.prepare('UPDATE pools SET name = ? WHERE id = ?').bind(body.name.trim(), poolId).run()
  }
  if (body.status !== undefined) {
    if (!['setup', 'active', 'complete'].includes(body.status)) return c.json({ error: 'Invalid status' }, 400)
    await c.env.DB.prepare('UPDATE pools SET status = ? WHERE id = ?').bind(body.status, poolId).run()
  }
  return c.json({ ok: true })
})

// DELETE /pools/:id
data.delete('/pools/:id', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const inUse = await c.env.DB.prepare('SELECT COUNT(*) as count FROM competitions WHERE pool_id = ?').bind(poolId).first<{ count: number }>()
  if ((inUse?.count ?? 0) > 0) return c.json({ error: 'Pool is used by one or more competitions' }, 409)

  await c.env.DB.prepare('DELETE FROM pools WHERE id = ?').bind(poolId).run()
  return c.body(null, 204)
})

// ── Pool: Runners (Type A) ────────────────────────────────────────────────

data.post('/pools/:id/runners', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare("SELECT owner_id, type FROM pools WHERE id = ?").bind(poolId).first<{ owner_id: number; type: string }>()
  if (!pool || pool.type !== 'racing') return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ name: string }>()
  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400)

  const runner = await c.env.DB.prepare('INSERT INTO runners (pool_id, name) VALUES (?, ?) RETURNING id, pool_id as poolId, name, created_at as createdAt').bind(poolId, body.name.trim()).first()
  return c.json(runner, 201)
})

data.delete('/pools/:id/runners/:runnerId', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const runnerId = Number(c.req.param('runnerId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const inUse = await c.env.DB.prepare('SELECT COUNT(*) as count FROM entries WHERE assigned_runner_id = ?').bind(runnerId).first<{ count: number }>()
  if ((inUse?.count ?? 0) > 0) return c.json({ error: 'Runner already assigned in a competition' }, 409)

  await c.env.DB.prepare('DELETE FROM runners WHERE id = ? AND pool_id = ?').bind(runnerId, poolId).run()
  return c.body(null, 204)
})

// PUT /pools/:id/runner-results — set race results (finishing positions)
data.put('/pools/:id/runner-results', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ results: { runnerId: number; finishingPosition: number }[] }>()

  await c.env.DB.prepare('DELETE FROM runner_results WHERE pool_id = ?').bind(poolId).run()
  for (const r of body.results) {
    await c.env.DB.prepare('INSERT INTO runner_results (pool_id, runner_id, finishing_position) VALUES (?, ?, ?)').bind(poolId, r.runnerId, r.finishingPosition).run()
  }

  return c.json({ ok: true })
})

// ── Pool: Teams (Type B) ──────────────────────────────────────────────────

data.post('/pools/:id/teams', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare("SELECT owner_id, type FROM pools WHERE id = ?").bind(poolId).first<{ owner_id: number; type: string }>()
  if (!pool || pool.type !== 'knockout') return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ name: string }>()
  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400)

  const team = await c.env.DB.prepare('INSERT INTO teams (pool_id, name) VALUES (?, ?) RETURNING id, pool_id as poolId, name, created_at as createdAt').bind(poolId, body.name.trim()).first()
  return c.json(team, 201)
})

data.delete('/pools/:id/teams/:teamId', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const teamId   = Number(c.req.param('teamId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const inUse = await c.env.DB.prepare('SELECT COUNT(*) as count FROM entries WHERE assigned_team_id = ?').bind(teamId).first<{ count: number }>()
  if ((inUse?.count ?? 0) > 0) return c.json({ error: 'Team already assigned in a competition' }, 409)

  await c.env.DB.prepare('DELETE FROM teams WHERE id = ? AND pool_id = ?').bind(teamId, poolId).run()
  return c.body(null, 204)
})

// ── Pool: Groups ──────────────────────────────────────────────────────────

data.post('/pools/:id/groups', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare('SELECT owner_id, has_group_stage FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number; has_group_stage: number }>()
  if (!pool || !pool.has_group_stage) return c.json({ error: 'Pool does not have a group stage' }, 400)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ name: string }>()
  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400)

  const group = await c.env.DB.prepare('INSERT INTO tournament_groups (pool_id, name) VALUES (?, ?) RETURNING id, pool_id as poolId, name, created_at as createdAt').bind(poolId, body.name.trim()).first()
  return c.json(group, 201)
})

data.delete('/pools/:id/groups/:groupId', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const groupId  = Number(c.req.param('groupId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare('DELETE FROM tournament_groups WHERE id = ? AND pool_id = ?').bind(groupId, poolId).run()
  return c.body(null, 204)
})

// POST /pools/:id/groups/:groupId/members — add team to group
data.post('/pools/:id/groups/:groupId/members', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const groupId  = Number(c.req.param('groupId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ teamId: number }>()
  await c.env.DB.prepare('INSERT OR IGNORE INTO group_memberships (group_id, team_id) VALUES (?, ?)').bind(groupId, body.teamId).run()
  return c.json({ ok: true }, 201)
})

data.delete('/pools/:id/groups/:groupId/members/:teamId', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const groupId  = Number(c.req.param('groupId'))
  const teamId   = Number(c.req.param('teamId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare('DELETE FROM group_memberships WHERE group_id = ? AND team_id = ?').bind(groupId, teamId).run()
  return c.body(null, 204)
})

// ── Pool: Group Matches ───────────────────────────────────────────────────

data.post('/pools/:id/group-matches', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ groupId: number; homeTeamId: number; awayTeamId: number; scheduledAt?: string }>()

  const match = await c.env.DB.prepare(`
    INSERT INTO group_matches (group_id, home_team_id, away_team_id, scheduled_at)
    VALUES (?, ?, ?, ?)
    RETURNING id, group_id as groupId, home_team_id as homeTeamId, away_team_id as awayTeamId,
              scheduled_at as scheduledAt, status, created_at as createdAt
  `).bind(body.groupId, body.homeTeamId, body.awayTeamId, body.scheduledAt ?? null).first()

  return c.json(match, 201)
})

// PATCH /pools/:id/group-matches/:matchId — enter score
data.patch('/pools/:id/group-matches/:matchId', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const matchId  = Number(c.req.param('matchId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ homeScore: number; awayScore: number }>()

  // Update match result
  await c.env.DB.prepare(`
    UPDATE group_matches SET home_score = ?, away_score = ?, status = 'complete' WHERE id = ?
  `).bind(body.homeScore, body.awayScore, matchId).run()

  // Recalculate standings for the group
  const match = await c.env.DB.prepare(`
    SELECT group_id, home_team_id, away_team_id FROM group_matches WHERE id = ?
  `).bind(matchId).first<{ group_id: number; home_team_id: number; away_team_id: number }>()

  if (match) await recalcGroupStandings(c.env.DB, match.group_id)

  return c.json({ ok: true })
})

data.delete('/pools/:id/group-matches/:matchId', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const matchId  = Number(c.req.param('matchId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const match = await c.env.DB.prepare('SELECT group_id FROM group_matches WHERE id = ?').bind(matchId).first<{ group_id: number }>()
  await c.env.DB.prepare('DELETE FROM group_matches WHERE id = ?').bind(matchId).run()
  if (match) await recalcGroupStandings(c.env.DB, match.group_id)

  return c.body(null, 204)
})

// ── Pool: Knockout Stages & Matches ───────────────────────────────────────

data.post('/pools/:id/knockout-stages', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))

  const pool = await c.env.DB.prepare("SELECT owner_id, type FROM pools WHERE id = ?").bind(poolId).first<{ owner_id: number; type: string }>()
  if (!pool || pool.type !== 'knockout') return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ name: string; stageOrder: number; isFirstStage?: boolean; matchCount: number }>()
  if (!body.name?.trim() || !body.matchCount) return c.json({ error: 'name and matchCount required' }, 400)

  const stage = await c.env.DB.prepare(`
    INSERT INTO knockout_stages (pool_id, name, stage_order, is_first_stage)
    VALUES (?, ?, ?, ?) RETURNING id, pool_id as poolId, name, stage_order as stageOrder, is_first_stage as isFirstStage, created_at as createdAt
  `).bind(poolId, body.name.trim(), body.stageOrder, body.isFirstStage ? 1 : 0).first<{ id: number }>()

  for (let i = 1; i <= body.matchCount; i++) {
    await c.env.DB.prepare('INSERT INTO knockout_matches (stage_id, match_number) VALUES (?, ?)').bind(stage!.id, i).run()
  }

  return c.json(stage, 201)
})

// PATCH /pools/:id/knockout-matches/:matchId — set teams, schedule, or enter score
data.patch('/pools/:id/knockout-matches/:matchId', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const poolId   = Number(c.req.param('id'))
  const matchId  = Number(c.req.param('matchId'))

  const pool = await c.env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && pool.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{
    homeTeamId?: number
    awayTeamId?: number
    scheduledAt?: string
    homeScore?: number
    awayScore?: number
  }>()

  const match = await c.env.DB.prepare(`
    SELECT km.id, km.stage_id, km.home_team_id, km.away_team_id,
           ks.pool_id, ks.stage_order
    FROM knockout_matches km
    JOIN knockout_stages ks ON ks.id = km.stage_id
    WHERE km.id = ? AND ks.pool_id = ?
  `).bind(matchId, poolId).first<{ stage_id: number; home_team_id: number; away_team_id: number; stage_order: number }>()

  if (!match) return c.json({ error: 'Not found' }, 404)

  // Setting teams (bracket setup)
  if (body.homeTeamId !== undefined || body.awayTeamId !== undefined || body.scheduledAt !== undefined) {
    await c.env.DB.prepare(`
      UPDATE knockout_matches
      SET home_team_id = COALESCE(?, home_team_id),
          away_team_id = COALESCE(?, away_team_id),
          scheduled_at = COALESCE(?, scheduled_at),
          status = CASE WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN 'scheduled' ELSE status END
      WHERE id = ?
    `).bind(body.homeTeamId ?? null, body.awayTeamId ?? null, body.scheduledAt ?? null, matchId).run()
  }

  // Entering score — determines winner and auto-advances to next stage
  if (body.homeScore !== undefined && body.awayScore !== undefined) {
    const winnerId = body.homeScore > body.awayScore
      ? match.home_team_id
      : body.awayScore > body.homeScore
        ? match.away_team_id
        : null  // draw — manager must replay or decide

    await c.env.DB.prepare(`
      UPDATE knockout_matches
      SET home_score = ?, away_score = ?, winner_team_id = ?,
          status = CASE WHEN ? IS NOT NULL THEN 'complete' ELSE status END
      WHERE id = ?
    `).bind(body.homeScore, body.awayScore, winnerId, winnerId, matchId).run()

    // Auto-advance: find the next stage and slot the winner
    if (winnerId) {
      await advanceWinner(c.env.DB, poolId, match.stage_id, matchId, winnerId)
    }
  }

  return c.json({ ok: true })
})

// ── Competitions ──────────────────────────────────────────────────────────

data.get('/competitions', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const isAdmin  = userRole === 'admin'

  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.manager_id as managerId, u.name as managerName,
           c.pool_id as poolId, p.name as poolName, p.type as poolType,
           c.name, c.status, c.created_at as createdAt,
           (SELECT COUNT(*) FROM entries e WHERE e.competition_id = c.id) as entryCount,
           (SELECT COUNT(*) FROM entries e WHERE e.competition_id = c.id AND e.spun_at IS NOT NULL) as spunCount
    FROM competitions c
    JOIN users u ON u.id = c.manager_id
    JOIN pools p ON p.id = c.pool_id
    WHERE ${isAdmin ? '1=1' : 'c.manager_id = ?'}
    ORDER BY c.created_at DESC
  `).bind(...(isAdmin ? [] : [userId])).all()

  return c.json(rows.results)
})

data.post('/competitions', requireRole('manager'), async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ poolId: number; name: string; prizePositions: string[] }>()

  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400)
  if (!body.poolId) return c.json({ error: 'poolId required' }, 400)
  if (!body.prizePositions?.length) return c.json({ error: 'At least one prize position required' }, 400)

  // Verify pool is accessible
  const pool = await c.env.DB.prepare("SELECT id, owner_id FROM pools WHERE id = ?").bind(body.poolId).first<{ owner_id: number }>()
  if (!pool) return c.json({ error: 'Pool not found' }, 404)

  const comp = await c.env.DB.prepare(`
    INSERT INTO competitions (manager_id, pool_id, name)
    VALUES (?, ?, ?) RETURNING id
  `).bind(userId, body.poolId, body.name.trim()).first<{ id: number }>()

  for (let i = 0; i < body.prizePositions.length; i++) {
    await c.env.DB.prepare('INSERT INTO prize_positions (competition_id, label, sort_order) VALUES (?, ?, ?)').bind(comp!.id, body.prizePositions[i], i).run()
  }

  return c.json({ id: comp!.id }, 201)
})

// GET /competitions/:id — full detail
data.get('/competitions/:id', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const compId   = Number(c.req.param('id'))

  const comp = await c.env.DB.prepare(`
    SELECT c.id, c.manager_id as managerId, u.name as managerName,
           c.pool_id as poolId, p.name as poolName, p.type as poolType,
           c.name, c.status, c.created_at as createdAt,
           (SELECT COUNT(*) FROM entries e WHERE e.competition_id = c.id) as entryCount,
           (SELECT COUNT(*) FROM entries e WHERE e.competition_id = c.id AND e.spun_at IS NOT NULL) as spunCount
    FROM competitions c
    JOIN users u ON u.id = c.manager_id
    JOIN pools p ON p.id = c.pool_id
    WHERE c.id = ?
  `).bind(compId).first<{ managerId: number }>()

  if (!comp) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && (comp as { managerId: number }).managerId !== userId) return c.json({ error: 'Forbidden' }, 403)

  const prizePositions = await c.env.DB.prepare('SELECT id, competition_id as competitionId, label, sort_order as sortOrder, created_at as createdAt FROM prize_positions WHERE competition_id = ? ORDER BY sort_order').bind(compId).all()
  const entries = await c.env.DB.prepare(`
    SELECT e.id, e.competition_id as competitionId, e.player_id as playerId, pl.name as playerName,
           e.assigned_runner_id as assignedRunnerId, r.name as assignedRunnerName,
           e.assigned_team_id as assignedTeamId, t.name as assignedTeamName,
           e.spun_at as spunAt, e.created_at as createdAt
    FROM entries e
    JOIN players pl ON pl.id = e.player_id
    LEFT JOIN runners r ON r.id = e.assigned_runner_id
    LEFT JOIN teams t ON t.id = e.assigned_team_id
    WHERE e.competition_id = ?
    ORDER BY pl.name, e.created_at
  `).bind(compId).all()
  const results = await c.env.DB.prepare(`
    SELECT cr.id, cr.competition_id as competitionId,
           cr.prize_position_id as prizePositionId, pp.label as prizePositionLabel,
           cr.runner_id as runnerId, r.name as runnerName,
           cr.team_id as teamId, t.name as teamName,
           cr.created_at as createdAt
    FROM competition_results cr
    JOIN prize_positions pp ON pp.id = cr.prize_position_id
    LEFT JOIN runners r ON r.id = cr.runner_id
    LEFT JOIN teams t ON t.id = cr.team_id
    WHERE cr.competition_id = ?
    ORDER BY pp.sort_order
  `).bind(compId).all()

  return c.json({ competition: comp, prizePositions: prizePositions.results, entries: entries.results, results: results.results })
})

// PATCH /competitions/:id
data.patch('/competitions/:id', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const compId   = Number(c.req.param('id'))

  const comp = await c.env.DB.prepare('SELECT manager_id FROM competitions WHERE id = ?').bind(compId).first<{ manager_id: number }>()
  if (!comp) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && comp.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ name?: string; status?: string }>()
  if (body.name !== undefined) await c.env.DB.prepare('UPDATE competitions SET name = ? WHERE id = ?').bind(body.name.trim(), compId).run()
  if (body.status !== undefined) {
    if (!['setup', 'active', 'complete'].includes(body.status)) return c.json({ error: 'Invalid status' }, 400)
    await c.env.DB.prepare('UPDATE competitions SET status = ? WHERE id = ?').bind(body.status, compId).run()
  }
  return c.json({ ok: true })
})

// DELETE /competitions/:id
data.delete('/competitions/:id', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const compId   = Number(c.req.param('id'))

  const comp = await c.env.DB.prepare('SELECT manager_id FROM competitions WHERE id = ?').bind(compId).first<{ manager_id: number }>()
  if (!comp) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && comp.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare('DELETE FROM competitions WHERE id = ?').bind(compId).run()
  return c.body(null, 204)
})

// ── Prize positions ───────────────────────────────────────────────────────

data.put('/competitions/:id/prize-positions', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const compId   = Number(c.req.param('id'))

  const comp = await c.env.DB.prepare('SELECT manager_id FROM competitions WHERE id = ?').bind(compId).first<{ manager_id: number }>()
  if (!comp) return c.json({ error: 'Not found' }, 404)
  if (userRole !== 'admin' && comp.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ positions: string[] }>()
  if (!body.positions?.length) return c.json({ error: 'At least one position required' }, 400)

  await c.env.DB.prepare('DELETE FROM prize_positions WHERE competition_id = ?').bind(compId).run()
  for (let i = 0; i < body.positions.length; i++) {
    await c.env.DB.prepare('INSERT INTO prize_positions (competition_id, label, sort_order) VALUES (?, ?, ?)').bind(compId, body.positions[i], i).run()
  }

  return c.json({ ok: true })
})

// ── Players ───────────────────────────────────────────────────────────────

data.get('/players', async (c) => {
  const userId   = c.get('userId')
  const userRole = c.get('userRole')
  const isAdmin  = userRole === 'admin'

  const rows = await c.env.DB.prepare(`
    SELECT pl.id, pl.manager_id as managerId, u.name as managerName,
           pl.name, pl.created_at as createdAt
    FROM players pl
    JOIN users u ON u.id = pl.manager_id
    WHERE ${isAdmin ? '1=1' : 'pl.manager_id = ?'}
    ORDER BY pl.name ASC
  `).bind(...(isAdmin ? [] : [userId])).all()

  return c.json(rows.results)
})

data.post('/players', requireRole('manager'), async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ name: string }>()
  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400)

  const existing = await c.env.DB.prepare('SELECT id FROM players WHERE manager_id = ? AND name = ? COLLATE NOCASE').bind(userId, body.name.trim()).first()
  if (existing) return c.json({ error: 'Player already exists' }, 409)

  const player = await c.env.DB.prepare(`
    INSERT INTO players (manager_id, name) VALUES (?, ?)
    RETURNING id, manager_id as managerId, name, created_at as createdAt
  `).bind(userId, body.name.trim()).first()

  return c.json(player, 201)
})

data.delete('/players/:id', requireRole('manager'), async (c) => {
  const userId   = c.get('userId')
  const playerId = Number(c.req.param('id'))

  const player = await c.env.DB.prepare('SELECT manager_id FROM players WHERE id = ?').bind(playerId).first<{ manager_id: number }>()
  if (!player) return c.json({ error: 'Not found' }, 404)
  if (player.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const inUse = await c.env.DB.prepare('SELECT COUNT(*) as count FROM entries WHERE player_id = ?').bind(playerId).first<{ count: number }>()
  if ((inUse?.count ?? 0) > 0) return c.json({ error: 'Player has entries in a competition' }, 409)

  await c.env.DB.prepare('DELETE FROM players WHERE id = ?').bind(playerId).run()
  return c.body(null, 204)
})

// ── Entries & Spin ────────────────────────────────────────────────────────

// POST /competitions/:id/entries — add an unspun entry for a player
data.post('/competitions/:id/entries', requireRole('manager'), async (c) => {
  const userId = c.get('userId')
  const compId = Number(c.req.param('id'))
  const body   = await c.req.json<{ playerId: number }>()

  const comp = await c.env.DB.prepare('SELECT manager_id FROM competitions WHERE id = ?').bind(compId).first<{ manager_id: number }>()
  if (!comp) return c.json({ error: 'Not found' }, 404)
  if (comp.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const entry = await c.env.DB.prepare(`
    INSERT INTO entries (competition_id, player_id) VALUES (?, ?)
    RETURNING id, competition_id as competitionId, player_id as playerId, created_at as createdAt
  `).bind(compId, body.playerId).first()

  return c.json(entry, 201)
})

// POST /competitions/:id/entries/:entryId/spin — assign random unassigned runner/team
data.post('/competitions/:id/entries/:entryId/spin', requireRole('manager'), async (c) => {
  const userId  = c.get('userId')
  const compId  = Number(c.req.param('id'))
  const entryId = Number(c.req.param('entryId'))

  const comp = await c.env.DB.prepare(`
    SELECT c.manager_id, c.pool_id, p.type as poolType
    FROM competitions c JOIN pools p ON p.id = c.pool_id
    WHERE c.id = ?
  `).bind(compId).first<{ manager_id: number; pool_id: number; poolType: string }>()

  if (!comp) return c.json({ error: 'Not found' }, 404)
  if (comp.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const entry = await c.env.DB.prepare('SELECT id, spun_at FROM entries WHERE id = ? AND competition_id = ?').bind(entryId, compId).first<{ spun_at: string | null }>()
  if (!entry) return c.json({ error: 'Entry not found' }, 404)
  if (entry.spun_at) return c.json({ error: 'Already spun' }, 409)

  if (comp.poolType === 'racing') {
    // Find unassigned runners in this pool
    const available = await c.env.DB.prepare(`
      SELECT r.id FROM runners r
      WHERE r.pool_id = ?
        AND r.id NOT IN (
          SELECT assigned_runner_id FROM entries
          WHERE competition_id = ? AND assigned_runner_id IS NOT NULL
        )
    `).bind(comp.pool_id, compId).all<{ id: number }>()

    if (!available.results.length) return c.json({ error: 'No runners left to assign' }, 409)

    const picked = available.results[Math.floor(Math.random() * available.results.length)]
    await c.env.DB.prepare(`
      UPDATE entries SET assigned_runner_id = ?, spun_at = datetime('now') WHERE id = ?
    `).bind(picked.id, entryId).run()

    const runner = await c.env.DB.prepare('SELECT id, name FROM runners WHERE id = ?').bind(picked.id).first()
    return c.json({ assignedRunner: runner })

  } else {
    // Find unassigned teams in this pool for this competition
    const available = await c.env.DB.prepare(`
      SELECT t.id FROM teams t
      WHERE t.pool_id = ?
        AND t.id NOT IN (
          SELECT assigned_team_id FROM entries
          WHERE competition_id = ? AND assigned_team_id IS NOT NULL
        )
    `).bind(comp.pool_id, compId).all<{ id: number }>()

    if (!available.results.length) return c.json({ error: 'No teams left to assign' }, 409)

    const picked = available.results[Math.floor(Math.random() * available.results.length)]
    await c.env.DB.prepare(`
      UPDATE entries SET assigned_team_id = ?, spun_at = datetime('now') WHERE id = ?
    `).bind(picked.id, entryId).run()

    const team = await c.env.DB.prepare('SELECT id, name FROM teams WHERE id = ?').bind(picked.id).first()
    return c.json({ assignedTeam: team })
  }
})

// DELETE /competitions/:id/entries/:entryId — remove an unspun entry
data.delete('/competitions/:id/entries/:entryId', requireRole('manager'), async (c) => {
  const userId  = c.get('userId')
  const compId  = Number(c.req.param('id'))
  const entryId = Number(c.req.param('entryId'))

  const comp = await c.env.DB.prepare('SELECT manager_id FROM competitions WHERE id = ?').bind(compId).first<{ manager_id: number }>()
  if (!comp || comp.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const entry = await c.env.DB.prepare('SELECT spun_at FROM entries WHERE id = ? AND competition_id = ?').bind(entryId, compId).first<{ spun_at: string | null }>()
  if (!entry) return c.json({ error: 'Not found' }, 404)
  if (entry.spun_at) return c.json({ error: 'Cannot remove a spun entry' }, 409)

  await c.env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(entryId).run()
  return c.body(null, 204)
})

// ── Competition Results ───────────────────────────────────────────────────

// PUT /competitions/:id/results — set prize position winners
data.put('/competitions/:id/results', requireRole('manager'), async (c) => {
  const userId = c.get('userId')
  const compId = Number(c.req.param('id'))

  const comp = await c.env.DB.prepare('SELECT manager_id FROM competitions WHERE id = ?').bind(compId).first<{ manager_id: number }>()
  if (!comp || comp.manager_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ results: { prizePositionId: number; runnerId?: number; teamId?: number }[] }>()

  for (const r of body.results) {
    await c.env.DB.prepare(`
      INSERT INTO competition_results (competition_id, prize_position_id, runner_id, team_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (competition_id, prize_position_id)
      DO UPDATE SET runner_id = excluded.runner_id, team_id = excluded.team_id
    `).bind(compId, r.prizePositionId, r.runnerId ?? null, r.teamId ?? null).run()
  }

  return c.json({ ok: true })
})

// ── Managers (admin only) ─────────────────────────────────────────────────

data.get('/managers', requireRole('admin'), async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, name, is_active as isActive, created_at as createdAt
    FROM users WHERE role = 'manager' ORDER BY name
  `).all()
  return c.json(rows.results)
})

// ── Helpers ───────────────────────────────────────────────────────────────

async function recalcGroupStandings(db: D1Database, groupId: number) {
  // Reset all standings for the group
  await db.prepare('UPDATE group_memberships SET played=0, won=0, drawn=0, lost=0, gf=0, ga=0, points=0 WHERE group_id = ?').bind(groupId).run()

  const matches = await db.prepare(`
    SELECT home_team_id, away_team_id, home_score, away_score
    FROM group_matches WHERE group_id = ? AND status = 'complete'
  `).bind(groupId).all<{ home_team_id: number; away_team_id: number; home_score: number; away_score: number }>()

  for (const m of matches.results) {
    const homeWon  = m.home_score > m.away_score
    const awayWon  = m.away_score > m.home_score
    const drawn    = m.home_score === m.away_score
    const homePts  = homeWon ? 3 : drawn ? 1 : 0
    const awayPts  = awayWon ? 3 : drawn ? 1 : 0

    await db.prepare(`
      UPDATE group_memberships SET
        played = played + 1,
        won    = won    + ?,
        drawn  = drawn  + ?,
        lost   = lost   + ?,
        gf     = gf     + ?,
        ga     = ga     + ?,
        points = points + ?
      WHERE group_id = ? AND team_id = ?
    `).bind(homeWon ? 1 : 0, drawn ? 1 : 0, awayWon ? 1 : 0, m.home_score, m.away_score, homePts, groupId, m.home_team_id).run()

    await db.prepare(`
      UPDATE group_memberships SET
        played = played + 1,
        won    = won    + ?,
        drawn  = drawn  + ?,
        lost   = lost   + ?,
        gf     = gf     + ?,
        ga     = ga     + ?,
        points = points + ?
      WHERE group_id = ? AND team_id = ?
    `).bind(awayWon ? 1 : 0, drawn ? 1 : 0, homeWon ? 1 : 0, m.away_score, m.home_score, awayPts, groupId, m.away_team_id).run()
  }
}

async function advanceWinner(db: D1Database, _poolId: number, stageId: number, matchId: number, winnerId: number) {
  // Find the next stage (higher stage_order)
  const currentStage = await db.prepare('SELECT stage_order FROM knockout_stages WHERE id = ?').bind(stageId).first<{ stage_order: number }>()
  if (!currentStage) return

  const nextStage = await db.prepare(`
    SELECT ks.id FROM knockout_stages ks
    JOIN knockout_matches km ON km.stage_id = ks.id  -- only stages that have matches
    WHERE ks.pool_id = (SELECT pool_id FROM knockout_stages WHERE id = ?)
      AND ks.stage_order > ?
    ORDER BY ks.stage_order ASC LIMIT 1
  `).bind(stageId, currentStage.stage_order).first<{ id: number }>()

  if (!nextStage) return  // this was the final

  // Find the next pending slot (null home or away) in the next stage ordered by match_number
  const currentMatches = await db.prepare(`
    SELECT id, match_number FROM knockout_matches WHERE stage_id = ? ORDER BY match_number
  `).bind(stageId).all<{ id: number; match_number: number }>()

  const myIndex = currentMatches.results.findIndex(m => m.id === matchId)
  const targetMatchNumber = Math.floor(myIndex / 2) + 1

  const targetMatch = await db.prepare(`
    SELECT id, home_team_id, away_team_id FROM knockout_matches
    WHERE stage_id = ? AND match_number = ?
  `).bind(nextStage.id, targetMatchNumber).first<{ id: number; home_team_id: number | null; away_team_id: number | null }>()

  if (!targetMatch) return

  if (!targetMatch.home_team_id) {
    await db.prepare("UPDATE knockout_matches SET home_team_id = ?, status = 'scheduled' WHERE id = ?").bind(winnerId, targetMatch.id).run()
  } else if (!targetMatch.away_team_id) {
    await db.prepare("UPDATE knockout_matches SET away_team_id = ?, status = 'scheduled' WHERE id = ?").bind(winnerId, targetMatch.id).run()
  }
}

export default data
