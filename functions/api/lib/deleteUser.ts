// Hard-delete a manager and all their data in dependency order.
// Competitions and pools each cascade to their children, but the FK
// from those tables to users has no CASCADE, so we delete explicitly.
export async function deleteUserAndData(db: D1Database, userId: number) {
  await db.batch([
    // Competition children
    db.prepare(`DELETE FROM competition_results WHERE competition_id IN (SELECT id FROM competitions WHERE manager_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM entries          WHERE competition_id IN (SELECT id FROM competitions WHERE manager_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM prize_positions  WHERE competition_id IN (SELECT id FROM competitions WHERE manager_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM competitions WHERE manager_id = ?`).bind(userId),

    // Pool children (deep)
    db.prepare(`DELETE FROM knockout_matches WHERE stage_id IN (SELECT id FROM knockout_stages WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?))`).bind(userId),
    db.prepare(`DELETE FROM knockout_stages  WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM group_matches    WHERE group_id IN (SELECT id FROM tournament_groups WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?))`).bind(userId),
    db.prepare(`DELETE FROM group_memberships WHERE group_id IN (SELECT id FROM tournament_groups WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?))`).bind(userId),
    db.prepare(`DELETE FROM tournament_groups WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM runner_results WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM runners WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM teams   WHERE pool_id IN (SELECT id FROM pools WHERE owner_id = ?)`).bind(userId),
    db.prepare(`DELETE FROM pools WHERE owner_id = ?`).bind(userId),

    // Players and user
    db.prepare(`DELETE FROM players WHERE manager_id = ?`).bind(userId),
    db.prepare(`DELETE FROM users   WHERE id = ?`).bind(userId),
  ])
}
