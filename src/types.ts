export type Role = 'admin' | 'manager'

export interface AuthUser {
  id: number
  name: string
  role: Role
}

// ── Pools ─────────────────────────────────────────────────────────────────

export type PoolType = 'racing' | 'knockout'
export type PoolStatus = 'setup' | 'active' | 'complete'

export interface Pool {
  id: number
  ownerId: number
  ownerName: string
  copiedFromId?: number
  name: string
  type: PoolType
  hasGroupStage: boolean  // knockout only
  status: PoolStatus
  createdAt: string
}

// ── Type A: Racing ────────────────────────────────────────────────────────

export interface Runner {
  id: number
  poolId: number
  name: string
  createdAt: string
}

export interface RunnerResult {
  id: number
  poolId: number
  runnerId: number
  runnerName: string
  finishingPosition: number
  createdAt: string
}

// ── Type B: Knockout ──────────────────────────────────────────────────────

export interface Team {
  id: number
  poolId: number
  name: string
  createdAt: string
}

export interface TournamentGroup {
  id: number
  poolId: number
  name: string
  createdAt: string
}

export interface GroupMembership {
  id: number
  groupId: number
  teamId: number
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

export type MatchStatus = 'scheduled' | 'complete'

export interface GroupMatch {
  id: number
  groupId: number
  homeTeamId: number
  homeTeamName: string
  awayTeamId: number
  awayTeamName: string
  scheduledAt?: string
  homeScore?: number
  awayScore?: number
  status: MatchStatus
  createdAt: string
}

export interface KnockoutStage {
  id: number
  poolId: number
  name: string
  stageOrder: number
  isFirstStage: boolean
  createdAt: string
}

export type KnockoutMatchStatus = 'pending' | 'scheduled' | 'complete'

export interface KnockoutMatch {
  id: number
  stageId: number
  matchNumber: number
  homeTeamId?: number
  homeTeamName?: string
  awayTeamId?: number
  awayTeamName?: string
  scheduledAt?: string
  homeScore?: number
  awayScore?: number
  winnerTeamId?: number
  winnerTeamName?: string
  status: KnockoutMatchStatus
  createdAt: string
}

// ── Competitions ──────────────────────────────────────────────────────────

export type CompetitionStatus = 'setup' | 'active' | 'complete'

export interface Competition {
  id: number
  managerId: number
  managerName: string
  poolId: number
  poolName: string
  poolType: PoolType
  name: string
  status: CompetitionStatus
  entryCount: number
  spunCount: number
  createdAt: string
}

export interface PrizePosition {
  id: number
  competitionId: number
  label: string
  sortOrder: number
  createdAt: string
}

// ── Players ───────────────────────────────────────────────────────────────

export interface Player {
  id: number
  managerId: number
  managerName?: string  // populated in admin views
  name: string
  createdAt: string
}

// ── Entries ───────────────────────────────────────────────────────────────

export interface Entry {
  id: number
  competitionId: number
  playerId: number
  playerName: string
  assignedRunnerId?: number
  assignedRunnerName?: string
  assignedTeamId?: number
  assignedTeamName?: string
  spunAt?: string
  createdAt: string
}

// ── Competition results ───────────────────────────────────────────────────

export interface CompetitionResult {
  id: number
  competitionId: number
  prizePositionId: number
  prizePositionLabel: string
  runnerId?: number
  runnerName?: string
  teamId?: number
  teamName?: string
  // derived winners from entries cross-reference
  winners?: { entryId: number; playerName: string }[]
  createdAt: string
}

// ── Sync / detail types ───────────────────────────────────────────────────

export interface SyncData {
  pools: Pool[]
  competitions: Competition[]
  players: Player[]
}

export interface PoolDetail {
  pool: Pool
  runners?: Runner[]
  runnerResults?: RunnerResult[]
  teams?: Team[]
  groups?: TournamentGroup[]
  groupMemberships?: GroupMembership[]
  groupMatches?: GroupMatch[]
  knockoutStages?: KnockoutStage[]
  knockoutMatches?: KnockoutMatch[]
}

export interface CompetitionDetail {
  competition: Competition
  prizePositions: PrizePosition[]
  entries: Entry[]
  results: CompetitionResult[]
  poolOptions: { id: number; name: string }[]
}
