-- ── Auth ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'manager',
  passcode_hash TEXT    NOT NULL,
  passcode_salt TEXT    NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,
  role       TEXT    NOT NULL DEFAULT 'manager',
  created_by INTEGER NOT NULL REFERENCES users(id),
  used_at    TEXT,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Pools (reusable event templates) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS pools (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        INTEGER NOT NULL REFERENCES users(id),
  copied_from_id  INTEGER REFERENCES pools(id),
  name            TEXT    NOT NULL,
  type            TEXT    NOT NULL,  -- 'racing' | 'knockout'
  has_group_stage INTEGER NOT NULL DEFAULT 1,  -- knockout only: 0 = straight bracket
  status          TEXT    NOT NULL DEFAULT 'setup',  -- 'setup' | 'active' | 'complete'
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Type A: Racing ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id    INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runner_results (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id            INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  runner_id          INTEGER NOT NULL REFERENCES runners(id) ON DELETE CASCADE,
  finishing_position INTEGER NOT NULL,  -- 1, 2, 3 etc.
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pool_id, runner_id)
);

-- ── Type B: Knockout — Teams ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id    INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Type B: Knockout — Group stage ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id    INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,  -- 'Group A', 'Group B' etc.
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_memberships (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  played   INTEGER NOT NULL DEFAULT 0,
  won      INTEGER NOT NULL DEFAULT 0,
  drawn    INTEGER NOT NULL DEFAULT 0,
  lost     INTEGER NOT NULL DEFAULT 0,
  gf       INTEGER NOT NULL DEFAULT 0,
  ga       INTEGER NOT NULL DEFAULT 0,
  points   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (group_id, team_id)
);

CREATE TABLE IF NOT EXISTS group_matches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id     INTEGER NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  scheduled_at TEXT,
  home_score   INTEGER,
  away_score   INTEGER,
  status       TEXT    NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'complete'
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Type B: Knockout — Bracket ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knockout_stages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id        INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,  -- 'Quarter-finals', 'Semi-finals', 'Final' etc.
  stage_order    INTEGER NOT NULL,  -- 1 = earliest, higher = later
  is_first_stage INTEGER NOT NULL DEFAULT 0,  -- 1 = bracket set manually
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knockout_matches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id     INTEGER NOT NULL REFERENCES knockout_stages(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,  -- for bracket slot ordering
  home_team_id INTEGER REFERENCES teams(id),  -- NULL until bracket is set
  away_team_id INTEGER REFERENCES teams(id),
  scheduled_at TEXT,
  home_score   INTEGER,
  away_score   INTEGER,
  winner_team_id INTEGER REFERENCES teams(id),
  status       TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'scheduled' | 'complete'
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Competitions (sweeps) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL REFERENCES users(id),
  pool_id    INTEGER NOT NULL REFERENCES pools(id),
  name       TEXT    NOT NULL,  -- free text: 'Grand National 50p'
  status     TEXT    NOT NULL DEFAULT 'setup',  -- 'setup' | 'active' | 'complete'
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prize_positions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  label          TEXT    NOT NULL,  -- '1st', '2nd', 'Last', 'First to Fall'
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Players (manager-scoped) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL REFERENCES users(id),
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (manager_id, name)
);

-- ── Entries — one row per spin purchased ─────────────────────────────────
CREATE TABLE IF NOT EXISTS entries (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id      INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  player_id           INTEGER NOT NULL REFERENCES players(id),
  assigned_runner_id  INTEGER REFERENCES runners(id),  -- NULL until spun (racing)
  assigned_team_id    INTEGER REFERENCES teams(id),    -- NULL until spun (knockout)
  spun_at             TEXT,   -- NULL until spin happens
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Competition results ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competition_results (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id    INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  prize_position_id INTEGER NOT NULL REFERENCES prize_positions(id),
  runner_id         INTEGER REFERENCES runners(id),  -- racing
  team_id           INTEGER REFERENCES teams(id),    -- knockout
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (competition_id, prize_position_id)
);
