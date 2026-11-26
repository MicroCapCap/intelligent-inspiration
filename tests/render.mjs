/**
 * DOM-free render check.
 *
 * Executes each registered fence component with a stand-in React that runs
 * hooks eagerly, then walks the returned element tree. A fence that puts a
 * plain object where React expects a child — the shape of the bug that sent
 * every sourced card back to its raw fence — fails here instead of in a chat.
 *
 * Usage: node tests/render.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const README = readFileSync(join(root, 'README.md'), 'utf8')

function example(lang) {
  const match = README.match(new RegExp('```' + lang + '\\n([\\s\\S]*?)```'))
  if (!match) throw new Error(`README has no ${lang} example`)
  return match[1]
}

function h(type, props, ...children) {
  const merged = Object.assign({}, props || {})
  // Like React: explicit children override config.children; absent ones leave it.
  if (children.length > 0) merged.children = children.length > 1 ? children : children[0]
  return { type, props: merged }
}

const fakeReact = {
  createElement: h,
  Component: class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }
    setState(patch) {
      Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch)
    }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useMemo(factory) {
    return factory()
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot()
  },
}

const registrations = new Map()
const sections = []
const fakeCtx = {
  slots: {
    inject(_name, callback) {
      return callback()
    },
    register(options, component) {
      if (options.name === 'settings.section') {
        sections.push({ options, component })
        return {}
      }
      registrations.set(options.key, component)
      return {}
    },
  },
}

const source = readFileSync(join(root, 'client.js'), 'utf8')
const start = source.indexOf('window.__ModuleLoader__.load')
if (start < 0) throw new Error('client.js does not register a module')
const body = source.slice(start)
  .replace(/window\.__ModuleLoader__\.load\(/, 'return ')
  .replace(/\);\s*$/, ';\n')

const plugin = new Function(body)()
const pluginExports = plugin.factory(spec => {
  if (spec === 'react') return fakeReact
  throw new Error(`unexpected require(${JSON.stringify(spec)})`)
})
pluginExports.apply(fakeCtx)

if (registrations.size !== 8) throw new Error(`expected 8 fence registrations, got ${registrations.size}`)
console.log('ok   eight fence registrations captured')

if (sections.length !== 1) throw new Error(`expected one settings section, got ${sections.length}`)
if (sections[0].options.id !== '@local/intelligent-inspiration/settings') {
  throw new Error('settings section id is ' + sections[0].options.id)
}
console.log('ok   settings section registered')

const LANGS = ['cards', 'actions', 'inspiration', 'quiz', 'sort', 'softmax', 'match', 'chart']

function walk(node, path) {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`))
    return
  }
  if (typeof node === 'object' && 'type' in node && 'props' in node) {
    const { type, props } = node
    if (typeof type === 'function') {
      if (type.prototype && typeof type.prototype.render === 'function') {
        walk(new type(props).render(), `${path}<${type.name || 'class'}>`)
      } else {
        walk(type(props), `${path}<${type.name || 'function'}>`)
      }
      return
    }
    walk(props.children, `${path}<${String(type)}>`)
    return
  }
  throw new Error(`${path}: plain object rendered as a child (keys: ${Object.keys(node).join(', ')})`)
}

function collectElements(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, out)
    return out
  }
  if ('type' in node && 'props' in node) {
    if (typeof node.type === 'function') {
      const rendered = node.type.prototype && typeof node.type.prototype.render === 'function'
        ? new node.type(node.props).render()
        : node.type(node.props)
      collectElements(rendered, predicate, out)
    } else {
      if (predicate(node)) out.push(node)
      collectElements(node.props.children, predicate, out)
    }
  }
  return out
}

for (const lang of LANGS) {
  const component = registrations.get(lang)
  if (typeof component !== 'function') throw new Error(`${lang}: registration is not a component`)

  const tree = component({
    code: example(lang),
    streaming: false,
    children: h('pre', null, 'FALLBACK'),
  })
  walk(tree, `${lang}:root`)
  console.log(`ok   ${lang} renders without a plain-object child`)
}

function collectText(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (typeof node === 'object' && 'type' in node && 'props' in node) {
    const { type, props } = node
    if (typeof type === 'function') {
      const rendered = type.prototype && typeof type.prototype.render === 'function'
        ? new type(props).render()
        : type(props)
      collectText(rendered, out)
    } else {
      collectText(props.children, out)
    }
  }
  return out
}

// The section headings live in the answer Markdown (## What to do,
// ## Recommendations), so a block that omits its title must not inject a second
// heading of its own.
for (const [lang, body] of [
  ['actions', '{"items":["Do one concrete thing"]}'],
  ['cards', '{"cards":[{"title":"One resource"}]}'],
]) {
  const component = registrations.get(lang)
  const text = collectText(component({ code: body, streaming: false, children: null })).join(' ')
  for (const heading of ['What to do', 'Recommendations']) {
    if (text.includes(heading)) throw new Error(`${lang}: injected an internal ${heading} heading`)
  }
  console.log(`ok   ${lang} renders no internal section heading`)
}

// Cards: a row without a usable thumbnail still gets a real image (the site's
// own icon), a placeholder thumbnail never becomes a request, and a valid
// thumbnail is used as given.
const cardSources = collectElements(
  registrations.get('cards')({
    code: JSON.stringify({
      cards: [
        { title: 'No thumb', href: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/' },
        { title: 'Placeholder thumb', href: 'https://github.com/karpathy/nanoGPT', thumb: 'https://example.com/logo.png' },
        { title: 'Elided thumb', href: 'https://pytorch.org/', thumb: 'https://…' },
        { title: 'Real thumb', href: 'https://cs336.stanford.edu/', thumb: 'https://avatars.githubusercontent.com/u/1?v=4' },
      ],
    }),
    streaming: false,
    children: null,
  }),
  (node) => node.type === 'img',
).map((node) => node.props.src)
const expectedSources = [
  'https://ocw.mit.edu/favicon.ico',
  'https://github.com/favicon.ico',
  'https://pytorch.org/favicon.ico',
  'https://avatars.githubusercontent.com/u/1?v=4',
]
if (cardSources.join('\n') !== expectedSources.join('\n')) {
  throw new Error(`cards: unexpected image sources ${JSON.stringify(cardSources)}`)
}
console.log('ok   cards fall back to the site icon and skip placeholder thumbnails')

// Settings: turning external icons off removes every image request from the
// cards without changing the rest of the block.
const settingsTree = sections[0].component({})
const checkbox = collectElements(settingsTree, (node) => node.type === 'input')[0]
if (!checkbox) throw new Error('settings: no checkbox')
if (checkbox.props.checked !== true) throw new Error('settings: external icons should default on')
const cardPayload = JSON.stringify({ cards: [{ title: 'One', href: 'https://ocw.mit.edu/courses/18-06/' }] })
const renderCards = () => registrations.get('cards')({ code: cardPayload, streaming: false, children: null })
checkbox.props.onChange({ target: { checked: false } })
if (collectElements(renderCards(), (node) => node.type === 'img').length !== 0) {
  throw new Error('settings: off still requests images')
}
checkbox.props.onChange({ target: { checked: true } })
if (collectElements(renderCards(), (node) => node.type === 'img').length !== 1) {
  throw new Error('settings: on lost the image')
}
console.log('ok   external icon setting gates card image requests')

// Inspiration: one full-width row per suggestion, and a click fills the draft
// through inputActions instead of sending.
const inspirationPayload = {
  kind: 'inspiration',
  items: [
    { text: 'Generate a toy transformer', why: 'turn the theory into code' },
    { text: 'Summarize the latest DeepMind work', why: 'see what frontier teams ship' },
    { text: 'Reproduce the training loop on a small dataset', why: 'verify you understood it' },
  ],
}
const drafts = []
const inspiration = registrations.get('inspiration')({
  code: JSON.stringify(inspirationPayload),
  streaming: false,
  children: null,
  inputActions: { setDraft: (text) => drafts.push(text) },
})
const inspirationButtons = collectElements(inspiration, (node) => node.type === 'button')
const stacked = collectElements(inspiration, (node) => {
  const style = node.props && node.props.style
  return style && style.flexDirection === 'column' && Array.isArray(node.props.children)
    && node.props.children.length === inspirationPayload.items.length
    && node.props.children.every((child) => child && child.type === 'button')
}).length > 0
if (inspirationButtons.length !== inspirationPayload.items.length) {
  throw new Error(`expected ${inspirationPayload.items.length} inspiration rows, got ${inspirationButtons.length}`)
}
if (!stacked) throw new Error('inspiration rows are not stacked in one column')
if (inspirationButtons.some((button) => button.props.style.width !== '100%')) {
  throw new Error('an inspiration row is not full width')
}
inspirationButtons[0].props.onClick()
if (drafts.length !== 1 || drafts[0] !== inspirationPayload.items[0].text) {
  throw new Error('click did not call setDraft with the suggestion text')
}
console.log('ok   inspiration rows are full-width and fill the draft on click')

const streamingInspiration = registrations.get('inspiration')({
  code: '{"items":[',
  streaming: true,
  children: h('pre', null, 'FALLBACK'),
})
if (collectText(streamingInspiration).length !== 0) {
  throw new Error('streaming inspiration rendered content')
}
console.log('ok   streaming inspiration renders nothing')

function contains(node, target) {
  if (node === target) return true
  if (node === null || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(child => contains(child, target))
  if ('type' in node && 'props' in node) {
    const { type, props } = node
    if (typeof type === 'function') {
      const out = type.prototype && typeof type.prototype.render === 'function'
        ? new type(props).render()
        : type(props)
      return contains(out, target)
    }
    return contains(props.children, target)
  }
  return false
}

// A malformed body must return the shipped children instead of throwing.
for (const lang of LANGS) {
  const component = registrations.get(lang)
  const fallback = h('pre', null, 'FALLBACK')
  const tree = component({ code: '{ not json', streaming: false, children: fallback })
  if (!contains(tree, fallback)) throw new Error(`${lang}: malformed body did not fall back to children`)
}
console.log('ok   malformed bodies fall back to children')

console.log('\nRENDER OK')
