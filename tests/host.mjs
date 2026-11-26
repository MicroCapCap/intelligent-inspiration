/**
 * Host-half contract check.
 *
 * Runs apply() against a stand-in context and asserts the system-prompt section
 * that carries the four-part answer format (Claim → Quiz → What to do →
 * Recommendations) and the inspiration rules. It also asserts the disposer is
 * handed to ctx.effect.
 */
import { inject, apply, name } from '../index.js'

const fail = []
const ok = []

if (name !== 'intelligent-inspiration') fail.push('unexpected plugin name: ' + name)
else ok.push('plugin name')
if (!Array.isArray(inject) || !inject.includes('systemPrompt')) fail.push('inject must include systemPrompt')
else ok.push('injects systemPrompt')

let section = null
let effectLabel = ''
const ctx = {
  systemPrompt: {
    section(options) {
      section = options
      return () => {}
    },
  },
  effect(factory, label) {
    effectLabel = label
    const dispose = factory()
    if (typeof dispose !== 'function') fail.push('effect factory did not return a disposer')
  },
}

try {
  apply(ctx)
} catch (error) {
  fail.push('apply() threw: ' + error.message)
}

if (!section) fail.push('no system-prompt section registered')
else {
  if (section.name !== 'intelligent-inspiration:guidance') fail.push('section name: ' + section.name)
  if (typeof section.order !== 'number') fail.push('section order must be numeric')
  const text = String(section.text || '')
  for (const needle of ['inspiration', 'Exactly 3 items', 'Claim', 'Quiz', 'questions', 'answer', 'Recommendations', 'why']) {
    if (!text.includes(needle)) fail.push('guidance is missing: ' + needle)
  }
  if (text.length < 400) fail.push('guidance is too short to carry the rules')
  ok.push('section ' + section.name + ' order ' + section.order + ' (' + text.length + ' chars)')
}

if (!effectLabel.includes('intelligent-inspiration')) fail.push('effect label: ' + effectLabel)
else ok.push('disposer registered through ctx.effect')

for (const line of ok) console.log('ok   ' + line)
for (const line of fail) console.log('FAIL ' + line)
console.log(fail.length ? 'HOST FAILED (' + fail.length + ')' : 'HOST OK')
process.exit(fail.length ? 1 : 0)
