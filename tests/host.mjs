/**
 * Host half: per-agent guidance and the per-session switch route.
 *
 * Sets DSH_HOME to a temporary directory before apply() so the switch state
 * never touches the real harness home.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ii-home-'))
process.env.DSH_HOME = tempHome

const fail = []
const ok = []
const check = (condition, message) => { if (condition) ok.push(message); else fail.push(message) }

const sections = []
const liveAgents = new Map()
const handlers = new Map()
const disposers = []
let route = null

function agentFor(sessionId) {
  return {
    id: sessionId,
    ctx: {
      systemPrompt: {
        section(options) {
          const record = { sessionId, options, disposed: false }
          sections.push(record)
          return () => { record.disposed = true }
        },
      },
    },
  }
}

const connection = { requestRejection: () => undefined }
const ctx = {
  on(event, handler) {
    handlers.set(event, handler)
    return () => {}
  },
  get(name) {
    if (name === 'connection') return connection
    if (name === 'agents') return { list: () => [...liveAgents.values()] }
    return undefined
  },
  webServer: {
    register(candidate) { route = candidate; return () => {} },
  },
  effect(factory) {
    const dispose = factory()
    if (typeof dispose === 'function') disposers.push(dispose)
    return dispose
  },
}

const first = agentFor('session-a')
liveAgents.set(first.id, first)

const mod = await import(pathToFileURL(path.join(here, '..', 'index.js')).href + '?v=' + Date.now())
mod.apply(ctx)

check(typeof mod.apply === 'function', 'module exports apply()')
check(route !== null, 'switch route registered')
check(route && route.path === '/intelligent-inspiration/session', 'route path')
check(route && route.auth === 'required', 'route requires host authentication')

check(sections.length === 1 && sections[0].sessionId === 'session-a', 'existing agent gets the guidance')
check(sections[0] && sections[0].options.name === 'intelligent-inspiration:guidance', 'section name')
check(sections[0] && sections[0].options.order === 3300, 'section order 3300')

const second = agentFor('session-b')
liveAgents.set(second.id, second)
handlers.get('agent/created')({ agent: second })
check(sections.some((row) => row.sessionId === 'session-b' && !row.disposed), 'new agent gets the guidance')

function fakeReq({ method = 'GET', url = '/', headers = { host: '127.0.0.1:4695' }, address = '127.0.0.1', body = '' }) {
  const chunks = body === '' ? [] : [Buffer.from(body)]
  return {
    method,
    url,
    headers,
    socket: { remoteAddress: address },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}
function fakeRes() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status },
    end(body) { this.body = body ?? '' },
  }
}
async function call(options) {
  const res = fakeRes()
  await route.handler(fakeReq(options), res)
  return { status: res.status, body: res.body === '' ? null : JSON.parse(res.body) }
}

if (route && typeof route.handler === 'function') {
  const read = await call({ url: '/intelligent-inspiration/session?sessionId=session-a' })
  check(read.status === 200 && read.body.enabled === true, 'GET reports on by default')

  const off = await call({
    method: 'POST',
    url: '/intelligent-inspiration/session',
    headers: { host: '127.0.0.1:4695', 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-a', enabled: false }),
  })
  check(off.status === 200 && off.body.enabled === false, 'POST turns the session off')
  const firstSection = sections.find((row) => row.sessionId === 'session-a')
  check(firstSection && firstSection.disposed === true, 'turning off disposes the live guidance')

  const readOff = await call({ url: '/intelligent-inspiration/session?sessionId=session-a' })
  check(readOff.body.enabled === false, 'GET reports off after the switch')

  const on = await call({
    method: 'POST',
    url: '/intelligent-inspiration/session',
    headers: { host: '127.0.0.1:4695', 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-a', enabled: true }),
  })
  check(on.status === 200 && on.body.enabled === true, 'POST turns the session back on')
  const live = sections.filter((row) => row.sessionId === 'session-a' && !row.disposed)
  check(live.length === 1, 'turning on re-registers exactly one guidance section')

  const third = agentFor('session-c')
  liveAgents.set(third.id, third)
  await call({
    method: 'POST',
    url: '/intelligent-inspiration/session',
    headers: { host: '127.0.0.1:4695', 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-c', enabled: false }),
  })
  handlers.get('agent/created')({ agent: third })
  check(!sections.some((row) => row.sessionId === 'session-c' && !row.disposed), 'off session gets no guidance')

  const stateFile = path.join(tempHome, 'intelligent-inspiration', 'sessions.json')
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  check(saved['session-a'] === true && saved['session-c'] === false, 'switch state is persisted')

  const foreign = await call({ url: '/intelligent-inspiration/session?sessionId=session-a', address: '10.0.0.9' })
  check(foreign.status === 403, 'non-loopback request is refused')

  const missing = await call({
    method: 'POST',
    url: '/intelligent-inspiration/session',
    headers: { host: '127.0.0.1:4695', 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  })
  check(missing.status === 400, 'POST without sessionId is rejected')
}

handlers.get('agent/disposed')({ agent: first })
for (const dispose of disposers) {
  try { dispose() } catch (error) { /* already released */ }
}
const stillLive = sections.filter((row) => !row.disposed && row.sessionId === 'session-b')
check(stillLive.length === 0, 'cleanup disposes the remaining guidance')

fs.rmSync(tempHome, { recursive: true, force: true })

for (const line of ok) console.log('ok   ' + line)
for (const line of fail) console.log('FAIL ' + line)
console.log(fail.length ? 'HOST FAILED (' + fail.length + ')' : 'HOST OK')
process.exit(fail.length ? 1 : 0)
