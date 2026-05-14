#!/usr/bin/env node
'use strict'

/**
 * Patches scheduled dates onto existing knockout match slots.
 * Run this after fixing the knockout_matches table schema.
 *
 * Usage:
 *   docker run --rm -v "$(pwd)":/app -w /app \
 *     -e ADMIN_NAME=xxx -e ADMIN_PASSCODE=xxx \
 *     node:20-alpine node scripts/patch-knockout-dates.js
 *
 * Optional: POOL_ID=1 (defaults to 1)
 */

const fs   = require('fs')
const path = require('path')

const API_URL    = (process.env.API_URL || 'https://sweep-pwa-v1.pages.dev').replace(/\/$/, '')
const ADMIN_NAME = process.env.ADMIN_NAME
const ADMIN_PASS = process.env.ADMIN_PASSCODE
const POOL_ID    = Number(process.env.POOL_ID || 1)

if (!ADMIN_NAME || !ADMIN_PASS) {
  console.error('Usage: ADMIN_NAME=xxx ADMIN_PASSCODE=xxx node scripts/patch-knockout-dates.js')
  process.exit(1)
}

const schedule = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'world_cup_2026_schedule.json'), 'utf8')
)

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

async function main() {
  console.log(`Logging in as "${ADMIN_NAME}"...`)
  const auth = await req('POST', '/auth/login', { name: ADMIN_NAME, passcode: ADMIN_PASS })
  token = auth.token
  console.log('✓ Logged in\n')

  console.log(`Fetching pool ${POOL_ID}...`)
  const detail = await req('GET', `/pools/${POOL_ID}`)
  console.log(`✓ Pool: ${detail.pool.name}`)
  console.log(`  Stages: ${detail.knockoutStages.length}, Matches: ${detail.knockoutMatches.length}\n`)

  const stageDefs = [
    { name: 'Round of 32',          src: schedule.stages.round_of_32 },
    { name: 'Round of 16',          src: schedule.stages.round_of_16 },
    { name: 'Quarter-finals',       src: schedule.stages.quarterfinals },
    { name: 'Semi-finals',          src: schedule.stages.semifinals },
    { name: 'Final',                src: schedule.stages.final },
    { name: 'Third-place play-off', src: schedule.stages.third_place_playoff },
  ]

  console.log('Patching match dates...')
  let count = 0
  for (const km of detail.knockoutMatches) {
    const stage = detail.knockoutStages.find(s => s.id === km.stageId)
    if (!stage) continue
    const def   = stageDefs.find(s => s.name === stage.name)
    if (!def) continue
    const sched = def.src.matches[km.matchNumber - 1]
    if (!sched) continue
    await req('PATCH', `/pools/${POOL_ID}/knockout-matches/${km.id}`, {
      scheduledAt: toUTC(sched.date, sched.time_et),
    })
    process.stdout.write('.')
    count++
  }

  console.log(`\n✓ ${count} match dates patched\n`)
  console.log('Done — knockout match slots now have their scheduled dates.')
}

main().catch(err => {
  console.error('\n✗ Error:', err.message)
  process.exit(1)
})
