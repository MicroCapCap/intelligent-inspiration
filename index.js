/**
 * Host half of the Intelligent Inspiration bundle.
 *
 * Registers one system-prompt section. It teaches the model to structure a
 * substantive answer as Claim → Quiz → What to do → Recommendations, and to
 * close with an `inspiration` fence: three concrete prompts the user could
 * send next. The client half renders those fences.
 */

export const name = 'intelligent-inspiration'
export const inject = ['systemPrompt']

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

export function apply(ctx) {
  const dispose = ctx.systemPrompt.section({
    name: 'intelligent-inspiration:guidance',
    order: 3300,
    text: GUIDANCE,
  })
  ctx.effect(() => dispose, 'intelligent-inspiration: guidance')
}
