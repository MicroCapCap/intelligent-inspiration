# Changelog

## 2.1.1

- Card thumbnails now try the site's own icon before falling back to a monogram:
  when `thumb` is missing, uses a placeholder host (`example.com`) or an elided
  host (`https://...`), the row loads `origin/favicon.ico`, then
  `icons.duckduckgo.com/ip3/<host>.ico`. This is what left rows without a
  thumbnail sitting on a letter block even though the site had a real icon.
- The monogram stays visible underneath the image while it loads, so a slow or
  blocked host shows the letter instead of a blank square.
- Placeholder and unresolvable thumbnail URLs are rejected before a request is
  made, and a failed image advances to the next source instead of giving up.

## 2.1.0

- Added a **Quiz** section between Claim and What to do. The host guidance now
  tells the model to write `## Quiz` followed by a `quiz` fence with one to three
  questions that check whether the reader understood the Claim, generated from
  the conversation, the workspace, and the user's memory.
- The quiz fence already graded itself; the new guidance positions it and sets
  the rules (3-4 options, one correct answer, a post-answer explanation,
  plausible distractors, skip trivial replies).

## 2.0.0

- Merged the standalone intelligent-inspiration bundle into this one and renamed
  it **Intelligent Inspiration** (`@local/intelligent-inspiration`). The host
  half now injects the Claim / What to do / Recommendations format and the
  inspiration rules; the client half claims an eighth fence, `inspiration`.
- `inspiration` renders one full-width row per suggestion. A click fills the
  composer through `inputActions.setDraft` and never sends; without that action
  face it copies the prompt. It is the last element of the answer, after
  Recommendations.
- The plugin icon is the sparkle mark; both locales and the README describe the
  merged plugin.

## 1.1.2

- Section headings now live in the answer Markdown — `## Claim`,
  `## What to do`, `## Recommendations` — not inside the block. `actions` and
  `cards` render headless when the payload omits `title`, so the three-part
  answer has three same-level headings followed by two headless blocks.
- The render test asserts that neither block injects its own section heading.

## 1.1.1

- The three-part answer headings are now defaults: `actions` renders **What to
  do** and `cards` renders **Recommendations** when the payload omits `title`.
  The headings stay English in every interface language, so the structure is
  recognizable; an explicit title still replaces them.
- The render test asserts both default headings, so a future change cannot drop
  them silently.

## 1.1.0

- Added the `actions` fence: a checkable list of next steps with a progress line,
  a Reset control, and optional `why` / `effort` per row. Ticks are local to the
  block and are re-armed when the model rewrites the body. It is meant for the
  second part of the three-part answer format — answer, **What to do**,
  **Recommendations** — while `cards` carries the third.
- Registry, README, locales, fixtures, and the render suite now cover seven fence
  languages.

## 1.0.1

- Fixed: a card with a `source` or any `tags` rendered the chip's style object as
  a React child, so React rejected the whole card row and the fence fell back to
  its raw JSON. `pill()` now returns a `span` element. This affected every real
  resource card, which almost always carries a source.
- Added `tests/render.mjs`: runs each registered fence against a stand-in React
  and fails on a plain object rendered as a child, or a malformed body that does
  not fall back to the shipped code block. The suite fails on 1.0.0's chip bug.

## 1.0.0

First release meant for other people's profiles.

- Six fence languages: `cards`, `quiz`, `sort`, `softmax`, `match`, `chart`.
- Payloads are parsed once per fence body instead of once per interaction, and a
  block re-arms its own state when the model rewrites the body.
- A trailing comma is repaired by a scanner that skips string literals, so a
  repaired payload means exactly what its author wrote.
- Hover, focus rings, and reduced-motion behaviour moved into a small stylesheet
  rendered with the block, because inline styles cannot express them.
- Accessibility: quiz options are `aria-pressed` toggle buttons that stay
  focusable after answering and announce their state in words, `aria-live` score
  lines, `role="progressbar"` progress, `role="img"` plus `<title>` charts,
  labelled move buttons, per-block group names, and `overflow-wrap` on every
  string a model can make long.
- Cards: the title is the link and underlines on hover, a dead or missing
  thumbnail falls back to a monogram, thumbnails load lazily, decode
  asynchronously, use `contain` so logos are not cropped, the source chip is
  outlined while tags stay filled, the description is never clamped, the list is
  capped at six cards with a note counting the rest, and the block rejects a
  payload whose `kind` is not `cards`.
- Quiz: a question whose `answer` is missing or out of range is dropped instead
  of graded against the wrong option; one status line instead of a duplicated
  score.
- Sort: rows in the wrong position are tinted after a check, the arrow buttons
  announce "Move up" / "Move down" instead of the glyph, and the counter says
  "3 steps" rather than "3 answered".
- Match: a wrong row now lists the correct pairing underneath.
- Chart: drawn at 360 units so type stays readable in a narrow column, three
  labelled gridlines with values at the left edge, both ends including zero,
  at most six x labels, deduplicated extreme labels, non-numeric entries dropped.
- Softmax: the top bar is chosen by index rather than by value lookup, so ties no
  longer highlight the wrong row; `temperature` is clamped to the slider range;
  bars stay visible in dark mode.
- Fallback: a render-error boundary is keyed by the fence body, so a block that
  failed once is not dead for the rest of the session.
- Packaging: MIT license, changelog, a detail page with one text-free
  illustration, localised plugin metadata, a load smoke test, and a fixtures test
  covering the manifest, locale, illustration, and every README example.

## 0.3.0

- Added `match` and `chart`.
- Quiz gained a progress bar and a completion state.

## 0.2.0

- Added `quiz`, `sort`, and `softmax`.

## 0.1.0

- Added `cards`.
