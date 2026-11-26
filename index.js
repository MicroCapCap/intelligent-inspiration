/**
 * Host half of the Intelligent Inspiration bundle.
 *
 * Registers the answer-format guidance on each agent — not globally — so a
 * per-conversation switch can leave it out. It teaches the model to structure a
 * substantive answer as Claim → Quiz → What to do → Recommendations, and to
 * close with an `inspiration` fence: three concrete prompts the user could
 * send next. The client half renders those fences and owns the switch in the
 * composer.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'intelligent-inspiration'
export const inject = ['systemPrompt', 'webServer']

const API = '/intelligent-inspiration'
const SECTION_ORDER = 3300
const SECTION_NAME = 'intelligent-inspiration:guidance'

const GUIDANCE = [
  '# Intelligent inspiration',
  '',
  'Close every substantive answer with this structure:',
  '',
  '    ## Claim',
  '    ## Quiz',
  '    ## What to do',
  '    ## Recommendations',
  '',
  'then one final `inspiration` fence.',
  '',
  'All four titles are ordinary Markdown H2 headings written in the answer at',
  'the same level. The Quiz sits between Claim and What to do and checks',
  'whether the user actually understood the Claim.',
  '',
  '## Quiz rules',
  '',
  '- Write the heading `## Quiz`, then a `quiz` fence directly below it. Do not',
  '  pass a `title`: the heading above the block is the title.',
  '- One to three questions about the Claim’s core idea, mechanism, or a',
  '  consequence; two is the norm.',
  '- Each question has `q`, three or four `options`, a zero-based `answer`, and',
  '  `why`. Exactly one option is correct.',
  '- Derive the questions from the Claim you just wrote, this conversation, the',
  '  user’s earlier questions, and what you remember about them. Test',
  '  understanding, not recall of wording: ask why something happens, what',
  '  changes if a condition changes, or which statement is true.',
  '- Distractors must be plausible misconceptions, never joke options or',
  '  obviously wrong statements.',
  '- `why` explains the answer in one or two sentences and appears after the',
  '  user answers, so it does not spoil the question.',
  '- Omit the Quiz for greetings, acknowledgements, yes/no answers, a single',
  '  fact, and explicit text-only requests. Never emit an empty `questions`',
  '  list.',
  '- Write questions and options in the user’s language.',
  '',
  'Quiz example:',
  '```quiz',
  '{"kind":"quiz","questions":[{"q":"Why does a lower temperature make the output more predictable?","options":["It divides logits before softmax, sharpening the distribution","It removes the low-probability tokens","It updates the model weights"],"answer":0,"why":"Lower T scales the logits up before softmax, so the largest probability gains share; nothing is removed."}]}',
  '```',
  '',
  '## Inspiration rules',
  '',
  'End every substantive answer with one `inspiration` fence, after the Claim,',
  'Quiz, What to do, and Recommendations sections. It is the last element of the',
  'answer. It offers the user three next prompts they could send, so the',
  'conversation can continue without them inventing the next question.',
  '',
  'Choose suggestions from what this conversation actually contains: the answer',
  'you just wrote, the user’s earlier questions and goals, the workspace',
  'AGENTS.md, and the user’s ongoing projects. A suggestion must be a concrete',
  'next step, not a restatement of the answer.',
  '',
  'Rules:',
  '- Exactly 3 items.',
  '- Each `text` is a complete prompt the user could send as-is, in the user’s',
  '  language, at most 80 characters. Never use “that”, “it”, or “this” without',
  '  its noun.',
  '- Cover three different directions when possible: one hands-on artifact to',
  '  build or run today, one deeper exploration of the current topic, one',
  '  adjacent topic the user’s goals make useful.',
  '- `why` is one short sentence (max 40 characters) naming what the user gets.',
  '- Never suggest what the answer already covered, never a generic “tell me',
  '  more”, and never a question that needs the user to fill in a blank.',
  '- Omit the fence for greetings, acknowledgements, yes/no answers, a single',
  '  fact, and explicit text-only requests.',
  '',
  'Example:',
  '```inspiration',
  '{"kind":"inspiration","items":[{"text":"为我生成一个 transformer 的玩具模型","why":"把今天的理论变成可运行的代码"},{"text":"帮我整理 Google DeepMind 的最新进展","why":"看看前沿团队在做什么"},{"text":"用一个小数据集复现今天讲的训练流程","why":"验证你真的理解了流程"}]}',
  '```',
].join('\n')

function stateFile() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'intelligent-inspiration', 'sessions.json')
}

function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    return {}
  }
}

function saveState(state) {
  try {
    const file = stateFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state))
  } catch (error) {
    // A read-only home still works for this run; the switch is best-effort.
  }
}

/**
 * Older DSH releases expose `connection.requestRejection`; newer ones gate the
 * route through `auth: 'required'` before the handler runs. Use the old fence
 * when it exists and fall back to the loopback check otherwise.
 */
function trustRefusal(ctx, request) {
  let connection
  try {
    connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
  } catch {
    connection = undefined
  }
  if (typeof connection?.requestRejection !== 'function') return undefined
  try {
    const rejection = connection.requestRejection(request)
    return rejection === undefined ? undefined : rejection
  } catch {
    return undefined
  }
}

function isLoopbackRequest(request) {
  const address = request.socket?.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) return undefined
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch (error) {
    return undefined
  }
}

export function apply(ctx) {
  const state = loadState()
  /** sessionId -> { agentCtx, dispose } for every live agent. */
  const live = new Map()
  const enabledFor = (sessionId) => state[sessionId] !== false

  const promptService = (agentCtx) => {
    if (!agentCtx) return undefined
    try {
      if (typeof agentCtx.get === 'function') {
        const found = agentCtx.get('systemPrompt')
        if (found !== undefined) return found
      }
    } catch (error) {
      // Fall through to the property face.
    }
    try {
      return agentCtx.systemPrompt
    } catch (error) {
      return undefined
    }
  }

  const attach = (entry) => {
    if (entry.dispose) return
    const prompt = promptService(entry.agentCtx)
    if (!prompt || typeof prompt.section !== 'function') return
    entry.dispose = prompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: GUIDANCE,
    })
  }
  const detach = (entry) => {
    if (!entry.dispose) return
    try {
      entry.dispose()
    } catch (error) {
      // The agent may already be gone; dropping the handle is enough.
    }
    entry.dispose = null
  }
  const install = (agent) => {
    if (!agent || typeof agent.id !== 'string' || live.has(agent.id)) return
    const entry = { agentCtx: agent.ctx, dispose: null }
    live.set(agent.id, entry)
    if (enabledFor(agent.id)) attach(entry)
  }
  const uninstall = (agent) => {
    if (!agent || typeof agent.id !== 'string') return
    const entry = live.get(agent.id)
    if (!entry) return
    detach(entry)
    live.delete(agent.id)
  }

  const stops = []
  if (typeof ctx.on === 'function') {
    const stopCreated = ctx.on('agent/created', ({ agent } = {}) => install(agent))
    const stopDisposed = ctx.on('agent/disposed', ({ agent } = {}) => uninstall(agent))
    if (typeof stopCreated === 'function') stops.push(stopCreated)
    if (typeof stopDisposed === 'function') stops.push(stopDisposed)
  }
  const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  if (agents && typeof agents.list === 'function') {
    for (const agent of agents.list()) install(agent)
  }

  if (ctx.webServer !== undefined && typeof ctx.webServer.register === 'function') {
    const guard = (req, res, methods) => {
      const refusal = trustRefusal(ctx, req)
      if (refusal !== undefined) {
        writeJson(res, refusal, { error: refusal === 401 ? 'unauthorized' : 'forbidden' })
        return false
      }
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' })
        return false
      }
      if (!methods.includes(req.method)) {
        writeJson(res, 405, { error: `method not allowed: ${req.method}` })
        return false
      }
      return true
    }
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: `${API}/session`,
      auth: 'required',
      handler: async (req, res) => {
        if (!guard(req, res, ['GET', 'POST'])) return
        if (req.method === 'GET') {
          const sessionId = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('sessionId') ?? ''
          writeJson(res, 200, { enabled: sessionId === '' ? true : enabledFor(sessionId) })
          return
        }
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
        if (sessionId === '') {
          writeJson(res, 400, { error: 'sessionId is required' })
          return
        }
        const enabled = body.enabled !== false
        state[sessionId] = enabled
        saveState(state)
        const entry = live.get(sessionId)
        if (entry) {
          if (enabled) attach(entry)
          else detach(entry)
        }
        writeJson(res, 200, { enabled })
      },
    }), 'intelligent-inspiration: session switch route')
  }

  ctx.effect(() => () => {
    for (const stop of stops) {
      try {
        stop()
      } catch (error) {
        // Already released.
      }
    }
    for (const entry of live.values()) detach(entry)
    live.clear()
  }, 'intelligent-inspiration: per-agent guidance')
}
