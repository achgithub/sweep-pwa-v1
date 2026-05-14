import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { HonoEnv } from './lib/types'
import { authMiddleware } from './middleware/auth'
import authRoutes from './routes/auth'
import dataRoutes from './routes/data'

const app = new Hono<HonoEnv>().basePath('/api')

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message, stack: err.stack }, 500)
})

app.route('/auth', authRoutes)

app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next()
  return authMiddleware(c, next)
})

app.route('/', dataRoutes)

export const onRequest = handle(app)
