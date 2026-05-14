#!/usr/bin/env node
'use strict'

/**
 * Seed the FIFA World Cup 2026 pool into Sweep.
 *
 * Creates:
 *  - 1 knockout pool (with group stage)
 *  - 48 teams
 *  - 12 groups (A–L) with team assignments
 *  - 72 group stage fixtures with dates/times (converted from ET → UTC)
 *  - 6 knockout stages with match slots and scheduled dates:
 *      Round of 32 (16), Round of 16 (8), Quarter-finals (4),
 *      Semi-finals (2), Final (1), Third-place play-off (1)
 *
 * Usage (via Docker, same as lms build commands):
 *
 *   docker run --rm -v "$(pwd)":/app -w /app \
 *     -e ADMIN_NAME=YourAdminName \
 *     -e ADMIN_PASSCODE=YourPasscode \
 *     node:20-alpine node scripts/seed-world-cup.js
 *
 * Optional env var:
 *   API_URL  — defaults to https://sweep-pwa-v1.pages.dev
 */

const fs   = require('fs')
const path = require('path')

const API_URL    = (process.env.API_URL || 'https://sweep-pwa-v1.pages.dev').replace(/\/$/, '')
const ADMIN_NAME = process.env.ADMIN_NAME
const ADMIN_PASS = process.env.ADMIN_PASSCODE

if (!ADMIN_NAME || !ADMIN_PASS) {
  console.error('Missing credentials.\n')
  console.error('Usage:')
  console.error('  docker run --rm -v "$(pwd)":/app -w /app \\')
  console.error('    -e ADMIN_NAME=xxx -e ADMIN_PASSCODE=xxx \\')
  console.error('    node:20-alpine node scripts/seed-world-cup.js')
  process.exit(1)
}

const schedule = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'world_cup_2026_schedule.json'), 'utf8')
)

// EDT = UTC-4. Convert "2026-06-11" + "15:00" → "2026-06-11T19:00"
function toUTC(date, time) {
  return new Date(`${date}T${time}:00-04:00`).toISOString().slice(0, 16)
}

let token = ''

async function req(method, urlPath, body) {
  const res = await fetch(`${API_URL}/api${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const get   = (p)    => req('GET',   p)
const post  = (p, b) => req('POST',  p, b)
const patch = (p, b) => req('PATCH', p, b)

async function main() {
  // ── Login ────────────────────────────────────────────────────────────────
  console.log(`Connecting to ${API_URL}`)
  console.log(`Logging in as "${ADMIN_NAME}"...`)
  const auth = await post('/auth/login', { name: ADMIN_NAME, passcode: ADMIN_PASS })
  token = auth.token
  console.log('✓ Logged in\n')

  // ── Pool ─────────────────────────────────────────────────────────────────
  process.stdout.write('Creating pool... ')
  const pool = await post('/pools', {
    name: 'FIFA World Cup 2026',
    type: 'knockout',
    hasGroupStage: true,
  })
  console.log(`✓  (id: ${pool.id})\n`)

  // ── Teams (48 unique) ────────────────────────────────────────────────────
  console.log('Creating 48 teams...')
  const teamId = {}
  for (const names of Object.values(schedule.groups)) {
    for (const name of names) {
      const t = await post(`/pools/${pool.id}/teams`, { name })
      teamId[name] = t.id
      process.stdout.write('.')
    }
  }
  console.log(`  ✓ ${Object.keys(teamId).length} teams\n`)

  // ── Groups + memberships ─────────────────────────────────────────────────
  console.log('Creating 12 groups and assigning teams...')
  const groupId = {}
  for (const [letter, names] of Object.entries(schedule.groups)) {
    const g = await post(`/pools/${pool.id}/groups`, { name: `Group ${letter}` })
    groupId[letter] = g.id
    for (const name of names) {
      await post(`/pools/${pool.id}/groups/${g.id}/members`, { teamId: teamId[name] })
    }
    process.stdout.write(letter)
  }
  console.log('  ✓\n')

  // ── Group stage fixtures (72) ────────────────────────────────────────────
  const gMatches = schedule.stages.group_stage.matches
  console.log(`Creating ${gMatches.length} group stage fixtures...`)
  for (const m of gMatches) {
    await post(`/pools/${pool.id}/group-matches`, {
      groupId:     groupId[m.group],
      homeTeamId:  teamId[m.home],
      awayTeamId:  teamId[m.away],
      scheduledAt: toUTC(m.date, m.time_et),
    })
    process.stdout.write('.')
  }
  console.log(`  ✓ ${gMatches.length} fixtures\n`)

  // ── Knockout stages ──────────────────────────────────────────────────────
  // Final at order 5 so semi-final winners auto-advance correctly.
  // Third-place at order 6 — bracket is set manually (semi losers).
  const knockoutStages = [
    { name: 'Round of 32',          order: 1, first: true,  src: schedule.stages.round_of_32 },
    { name: 'Round of 16',          order: 2, first: false, src: schedule.stages.round_of_16 },
    { name: 'Quarter-finals',       order: 3, first: false, src: schedule.stages.quarterfinals },
    { name: 'Semi-finals',          order: 4, first: false, src: schedule.stages.semifinals },
    { name: 'Final',                order: 5, first: false, src: schedule.stages.final },
    { name: 'Third-place play-off', order: 6, first: false, src: schedule.stages.third_place_playoff },
  ]

  console.log('Creating knockout stages...')
  for (const s of knockoutStages) {
    const created = await post(`/pools/${pool.id}/knockout-stages`, {
      name:         s.name,
      stageOrder:   s.order,
      isFirstStage: s.first,
      matchCount:   s.src.matches.length,
    })
    s.dbId = created.id
    console.log(`  ✓ ${s.name.padEnd(24)} ${s.src.matches.length} matches  (id: ${created.id})`)
  }

  // ── Set scheduled dates on knockout match slots ──────────────────────────
  console.log('\nSetting match dates on knockout slots...')
  const detail = await get(`/pools/${pool.id}`)

  for (const km of detail.knockoutMatches) {
    const stage = detail.knockoutStages.find(s => s.id === km.stageId)
    if (!stage) continue
    const def   = knockoutStages.find(s => s.name === stage.name)
    if (!def) continue
    const sched = def.src.matches[km.matchNumber - 1]
    if (!sched) continue
    await patch(`/pools/${pool.id}/knockout-matches/${km.id}`, {
      scheduledAt: toUTC(sched.date, sched.time_et),
    })
    process.stdout.write('.')
  }
  console.log('  ✓\n')

  // ── Summary ──────────────────────────────────────────────────────────────
  const totalKO = knockoutStages.reduce((n, s) => n + s.src.matches.length, 0)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✓  FIFA World Cup 2026 pool seeded successfully!')
  console.log(`   Pool ID  : ${pool.id}`)
  console.log(`   Teams    : ${Object.keys(teamId).length}  (Groups A–L, 4 per group)`)
  console.log(`   Fixtures : ${gMatches.length} group stage + ${totalKO} knockout = ${gMatches.length + totalKO} total`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log()
  console.log('Next steps:')
  console.log('  1. Log in to Sweep as a manager and copy this pool')
  console.log('  2. Create a competition (sweep) on the copied pool')
  console.log('  3. After group stage: manually set the Round of 32 bracket')
  console.log('  4. From Quarter-finals onwards, winners auto-advance')
  console.log('  5. Third-place teams must be set manually after semi-finals')
}

main().catch(err => {
  console.error('\n✗ Seed failed:', err.message)
  process.exit(1)
})
