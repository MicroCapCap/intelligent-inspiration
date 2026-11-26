# Intelligent Inspiration

Interactive blocks and next-question suggestions inside chat answers, built from
ordinary Markdown fences.

An answer model writes a fenced code block whose language is `cards`, `actions`,
`inspiration`, `quiz`, `sort`, `softmax`, `match`, or `chart`. The body is JSON.
This plugin claims those eight fence languages and renders the body as a block
instead of a wall of code: a resource list with linked titles and thumbnails, a
checklist of next steps, full-width suggested prompts that fill the composer, a
quiz that grades itself, an ordering exercise, a temperature slider over live
probability bars, a pairing exercise, or a small chart.

Every other fence, and every malformed body, still renders exactly as it did
before the plugin was installed.

## The four-part answer, plus inspiration

The host half injects the guidance for this format. The four titles are ordinary
Markdown H2 headings at the same level, written in the answer itself:

- `## Claim` — the normal answer, written normally.
- `## Quiz` — immediately followed by a `quiz` block that checks whether the
  reader understood the Claim, using the conversation and the user's memory.
- `## What to do` — immediately followed by an `actions` block.
- `## Recommendations` — immediately followed by a `cards` block.

After Recommendations, the answer ends with one `inspiration` block: three
suggested next prompts. The blocks carry no `title`: the heading above the block
is the section title, so the block itself renders headless. A payload may still
pass a `title` for a standalone block that is not part of this format.

## Install

The bundle has two halves: the host half injects the answer-format guidance, and
the client half renders the fences.

- **Web UI** — open **Plugins**, choose **Add plugin**, and pick this directory.
- **Tool** — `plugin_manager` with `action: install_bundle` and this directory as
  the absolute `target`.
- **Profile file** — add the directory to `dsh.profile.bundles` in the profile's
  `package.json` and install it there. Let the plugin manager write that file;
  hand-editing it is how a profile gets out of sync.

The renderer runs in the chat Markdown pipeline, so a new session is needed after
the first install. Turning the plugin off restores plain code blocks; the answer
text is untouched either way.

## The seven fences

### `cards` — a resource list

```cards
{
  "title": "Start here",
  "note": "Each row opens the source.",
  "cards": [
    {
      "title": "Stanford CS336",
      "href": "https://cs336.stanford.edu/",
      "thumb": "https://avatars.githubusercontent.com/u/160359985?v=4",
      "desc": "Language modeling from scratch: tokenizer, transformer, training loop, scaling, and alignment.",
      "source": "Stanford",
      "tags": ["12 weeks"]
    },
    {
      "title": "Understanding Deep Learning",
      "href": "https://udlbook.github.io/udlbook/",
      "desc": "A free textbook for the mathematics an interview will actually probe.",
      "source": "Simon Prince",
      "tags": ["book"]
    }
  ]
}
```

| field | required | notes |
| --- | --- | --- |
| `title` | yes | The click target. Long titles wrap; the row links to `href`. |
| `href` | no | `http(s)` only. Without it the title is plain text. |
| `thumb` | no | `http(s)` only. A missing, placeholder or failed image falls back to the site's own icon, then a public icon lookup, then a monogram. |
| `desc` | no | One sentence of value. It wraps freely and is never truncated, so keep it short. |
| `source` | no | Outlined chip, usually the organisation. |
| `tags` | no | Up to 4 filled chips, each 24 characters. |

Six cards are rendered; a longer list ends with a note counting the rest. At the
group level, `title` is optional: omit it in the three-part answer because the
heading is the Markdown heading above the block; `note` is one line under it.

Thumbnails are decorative: they are announced as an empty `alt`, so a row stays
meaningful to a screen reader with or without an image. The image chain is the
`thumb` when it is a real absolute URL (placeholder hosts such as `example.com`
and elided hosts such as `https://...` are ignored), then the card's own site at
`origin/favicon.ico`, then `icons.duckduckgo.com`, then a monogram. The monogram
stays visible underneath while a request is in flight, so a slow or blocked host
never leaves a blank square. Requests carry no referrer. A card with a `thumb`
first contacts that host; a card without one contacts its own site, and
DuckDuckGo only if that favicon is missing.

**Settings → Intelligent Inspiration → Load external card icons** turns the
whole chain off. Every card then renders its monogram tile and no image request
is made; the choice is stored in the renderer and survives a restart.

### `actions` — a checklist of next steps

```actions
{
  "kind": "actions",
  "note": "Tick them off; the state stays in this block.",
  "items": [
    {
      "text": "Run CS336 assignment 1 this week",
      "why": "It is the cheapest proof that you can build the training loop.",
      "effort": "1 evening"
    },
    {
      "text": "Open one PR against vLLM with a benchmark number",
      "why": "Merged work in the stack they run is the strongest referral signal.",
      "effort": "2 weeks"
    },
    {
      "text": "Write a one-page post-mortem of the run that broke",
      "why": "The interview is a deep-dive on your own failures."
    }
  ]
}
```

| field | required | notes |
| --- | --- | --- |
| `items` | yes | 1–6 entries. A bare string is accepted as `text`. |
| `text` | yes | One concrete action, up to 240 characters. |
| `why` | no | One sentence on why it matters, up to 300 characters. |
| `effort` | no | Short timing label, up to 24 characters. |
| `title` | no | Optional heading inside the block. Omit it in the three-part answer: the heading is the Markdown heading above. |
| `note` | no | One line under the rows. |

Each row is a real checkbox button (`aria-pressed`), the progress line is
`aria-live`, and **Reset** clears the ticks. Ticking is local to the block: no
message is sent and no state leaves the page. Up to six items are rendered.

### `inspiration` — suggested next prompts

```inspiration
{
  "kind": "inspiration",
  "items": [
    {
      "text": "为我生成一个 transformer 的玩具模型",
      "why": "把今天的理论变成可运行的代码"
    },
    {
      "text": "帮我整理 Google DeepMind 的最新进展",
      "why": "看看前沿团队在做什么"
    },
    {
      "text": "用一个小数据集复现今天讲的训练流程",
      "why": "验证你真的理解了流程"
    }
  ]
}
```

| field | required | notes |
| --- | --- | --- |
| `items` | yes | 1–4 entries. A bare string is accepted as `text`. |
| `text` | yes | A complete prompt the user could send as-is, up to 120 characters. |
| `why` | no | One short sentence naming what the user gets, up to 60 characters. |

Each suggestion is a full-width row. Clicking one calls the composer's
`inputActions.setDraft` with the prompt and focuses the editor; it never sends on
its own. Without that action face, the click copies the prompt instead. A header
line reports “filled into the composer” or “copied” through `aria-live`. While the
fence is still streaming it renders nothing, so a partial body never flashes.

### `quiz` — multiple choice, graded instantly

```quiz
{
  "kind": "quiz",
  "title": "Check yourself",
  "questions": [
    {
      "q": "Why does temperature change the output distribution?",
      "options": ["It rescales logits before softmax", "It removes low-probability tokens", "It updates the weights"],
      "answer": 0,
      "why": "Dividing logits by T sharpens the distribution as T falls and flattens it as T rises; nothing is removed."
    }
  ]
}
```

`answer` is the zero-based index of the correct option, capped at 6 options per
question. A question with a missing or out-of-range `answer` is dropped rather
than graded against the wrong option — if every question is dropped, the code
block comes back. A question is graded the moment it is answered and cannot be
changed; **Reset** clears the whole set. `why` appears after answering, so it
explains rather than spoils.

### `sort` — put the steps in order

```sort
{
  "kind": "sort",
  "title": "Order the forward pass",
  "items": ["Tokenize", "Embed", "Attention", "Softmax", "Sample"]
}
```

The list starts shuffled (up to 10 items). Move rows with the arrow buttons, then
press **Check**: correct positions are marked, wrong ones are tinted, and the
score counts positions, not items.

### `softmax` — a temperature slider

```softmax
{
  "kind": "softmax",
  "title": "Next-token distribution",
  "labels": ["cat", "dog", "car"],
  "logits": [3.2, 2.1, -0.5],
  "temperature": 1
}
```

Up to 8 logits. The slider runs 0.2–3.0 and `temperature` is clamped into that
range; bar widths are normalised to the largest probability, and the footer
reports entropy in nats plus effective choices.

### `match` — pair two columns

```match
{
  "kind": "match",
  "title": "Pair each term with its definition",
  "pairs": [
    ["LoRA", "A low-rank adapter trained beside frozen weights"],
    ["RoPE", "A rotary position encoding applied to attention"],
    ["KV cache", "Attention state reused across decoding steps"]
  ]
}
```

Up to 8 pairs. The right column is shuffled once per block. **Check** marks each
row and lists the corrections underneath.

### `chart` — numbers, drawn

```chart
{
  "kind": "chart",
  "title": "Decode throughput",
  "chart": "bar",
  "values": [12, 18, 15, 24],
  "labels": ["A100", "H100", "L40S", "TPU v5e"],
  "unit": " GB/s"
}
```

Up to 16 values, non-numeric entries dropped. `chart` is `bar` (default) or
`line`. Both handle negative values. Gridlines carry three labelled ticks; a line
chart labels only its extremes, and at most six x labels are drawn so they never
overlap. The drawing is 360 units wide, which renders at roughly 1:1 in a phone
width chat column instead of shrinking its type to nothing.

## Behaviour and limits

- **Fallback, never a blank.** A fence that is still streaming, whose body is not
  JSON, whose `kind` does not match, or that has too few valid entries renders the
  original code block. A render-time exception is caught by the same fallback.
- **Trailing commas** in the JSON are forgiven, except inside a string literal;
  other syntax errors fall back.
- **Local only.** No model request is added, no block state leaves the message,
  and each block owns its own component state, reset when the body changes. The
  only network reads are card thumbnails: the `thumb` host, then the card's own
  site for `/favicon.ico`, then `icons.duckduckgo.com` only if that fails — all
  with no referrer. A card without a `thumb` fetches only its own site's icon.
  Settings → Intelligent Inspiration can turn all of these off.
  Settings → Intelligent Inspiration can turn all of these off.
- **Selection.** Only the eight fence languages above are claimed. Adding a
  ninth would shadow a code block someone else may want.

## Theming and accessibility

Colors come from host theme tokens (`--dsw-alias-*`) with literal fallbacks, so
the blocks follow light and dark themes and survive a renamed token. Interaction
states that inline styles cannot express — hover, focus rings, reduced motion —
live in a small stylesheet rendered with the block.

- Every control is a real `button`, `select`, or `input`.
- Quiz options are toggle buttons with `aria-pressed`; answered options keep focus
  through `aria-disabled` instead of dropping out of the tab order, and the
  result is also announced in words, not only with a glyph.
- Scores announce through `aria-live`, progress exposes `role="progressbar"`, and
  charts carry `role="img"` plus a `<title>` naming the series.
- Motion is disabled under `prefers-reduced-motion`.

## Localisation

Block chrome is English or Chinese, chosen from the interface language
(`<html lang>`, falling back to `navigator.language`). The plugin's own title,
description, and detail page use `locale/en.json` and `locale/zh.json`.

## Development

Node 20.11 or newer.

```sh
# syntax
node --check index.js
node --check client.js

# host half: system-prompt section name, order, and rules
node tests/host.mjs

# module protocol, slot registration, fences, ids
node tests/smoke.mjs

# manifest, files list, locale, preview SVG, README examples
node tests/fixtures.mjs

# every fence against a stand-in React: no plain-object children, real fallback
node tests/render.mjs
```

The host test runs `apply()` against a stand-in context and asserts the guidance
section. The smoke test executes the browser module protocol with a stand-in
module table and asserts eight well-formed registrations. The fixtures test
checks what a shipped bundle must get right: every runtime file exists and is
listed in `files`, both locales carry a title, description, and detail page, the
preview SVG is the expected size and contains no text or script, and each example
in this README parses and respects its caps. The render test executes each
registered component with a stand-in React that runs hooks eagerly and walks the
element tree, so a component that mounts a style object or any other plain object
as a child fails here instead of degrading a real answer to its raw fence.

None of the four tests paints pixels. Appearance and the fence prop contract
(`code`, `streaming`, `children`, `inputActions`) are verified in the running app,
which is where the fallback path is exercised too.

Publishing note: `@local/intelligent-inspiration` is a workspace name. A rename
has five places to touch, and missing one leaves a bundle that installs but never
renders: `name` in `package.json`, the module `id` in `client.js`, the eight
registration ids below it, the bundle id in `cordis.patch.yml`, and the expected
id in `tests/smoke.mjs`.

Developed against DSH 0.2.2-rc.3.

## License

MIT.
