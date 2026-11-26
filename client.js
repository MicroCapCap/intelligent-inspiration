/**
 * answer-cards — client half of the bundle.
 *
 * Claims six Markdown fence languages in the Chat flow and renders the fence
 * body as an interactive block instead of a code block:
 *
 *   cards    resource list: thumbnail, linked title, description, source chips
 *   quiz     multiple choice with instant grading, progress, and explanations
 *   sort     ordering exercise checked position by position
 *   softmax  temperature slider driving live probability bars and entropy
 *   match    pair the left column with the right one, then check
 *   chart    small bar or line chart drawn from plain numbers
 *
 * Every block degrades instead of failing: a still-streaming fence, invalid
 * JSON, an unknown `kind`, a mismatched answer key, or too few valid entries all
 * render the shipped code block by returning the fence's children. A render-time
 * exception is caught by the same fallback. Colors come from host theme tokens
 * with literal fallbacks, so a renamed token changes the shade and never breaks
 * the block.
 */
window.__ModuleLoader__.load({
  id: '@local/intelligent-inspiration',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useMemo = React.useMemo;
    const useEffect = React.useEffect;
    // React 18 has this; a host on an older renderer still gets the initial
    // value rather than a crash (the setting then applies on the next mount).
    const useSyncExternalStore = typeof React.useSyncExternalStore === 'function'
      ? React.useSyncExternalStore
      : (subscribe, getSnapshot) => getSnapshot();

    // Host theme tokens with literals as the fallback, so a renamed token
    // degrades the colors instead of breaking the widget. The two literals that
    // read poorly on a dark surface are routed through custom properties so a
    // dark color scheme can lighten them (see CSS below).
    const T = {
      text: 'var(--dsw-alias-label-primary, inherit)',
      dim: 'var(--dsw-alias-label-secondary, var(--ac-dim))',
      border: 'var(--dsw-alias-border-secondary, rgba(127,127,127,0.28))',
      chip: 'var(--dsw-alias-bg-tertiary, rgba(127,127,127,0.12))',
      link: 'var(--dsw-alias-accent-primary, var(--ac-link))',
      ok: 'var(--dsw-alias-status-success, #2f8f4e)',
      bad: 'var(--dsw-alias-status-danger, #c04141)',
    };

    // Interaction states that inline styles cannot express: hover, focus rings,
    // and reduced motion. Rendered as a React element inside each block, so the
    // stylesheet leaves with the block.
    const CSS = [
      ':root{--ac-dim:#6b7280;--ac-link:#2f6fd0}',
      '@media (prefers-color-scheme:dark){:root{--ac-dim:#9ca3af;--ac-link:#7aabe8}}',
      '.ac-row{transition:background-color 120ms ease}',
      '.ac-row:hover{background:var(--dsw-alias-bg-secondary,rgba(127,127,127,0.08))}',
      '.ac-btn{transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease}',
      // !important because every button carries an inline background, which the
      // inline style would otherwise win against.
      '.ac-btn:not(:disabled):not([aria-disabled="true"]):hover{background:var(--dsw-alias-bg-secondary,rgba(127,127,127,0.12))!important}',
      '.ac-btn:focus-visible,.ac-link:focus-visible,.ac-select:focus-visible{outline:2px solid var(--dsw-alias-accent-primary,#2f6fd0);outline-offset:2px}',
      '.ac-link:hover .ac-title,.ac-link:focus-visible .ac-title{text-decoration:underline;text-underline-offset:2px}',
      '.ac-link:hover .ac-arrow,.ac-link:focus-visible .ac-arrow{color:var(--dsw-alias-accent-primary,#2f6fd0)}',
      '.ac-bar{transition:width 140ms ease-out}',
      '.ii-chip{transition:background-color 120ms ease,border-color 120ms ease}',
      '.ii-chip:hover{background:var(--dsw-alias-bg-secondary,rgba(127,127,127,0.08))!important}',
      '.ii-chip:focus-visible{outline:2px solid var(--dsw-alias-accent-primary,#2f6fd0);outline-offset:2px}',
      '@media (prefers-reduced-motion:reduce){.ac-row,.ac-btn,.ac-bar,.ii-chip{transition:none!important}}',
    ].join('');

    const HTTP = /^https?:\/\//i;
    const SEPARATOR = '  \u00b7  ';
    // Hosts a model writes when it is filling in a shape rather than naming a
    // real resource. A thumbnail on one of these never resolves.
    const PLACEHOLDER_HOST = /^(www\.)?example\.(com|org|net)$|^(localhost|127\.0\.0\.1)$/i;

    /**
     * A thumbnail is only worth a request when it is an absolute http(s) URL
     * with a host that can resolve. Placeholder hosts and elided hosts
     * (`https://...`, `https://\u2026`) are what made some cards sit on a blank
     * square: the browser was asked to fetch a host that does not exist.
     */
    function imageUrl(value) {
      if (typeof value !== 'string') return '';
      const raw = value.trim();
      if (!HTTP.test(raw)) return '';
      try {
        const url = new URL(raw);
        const host = url.hostname;
        if (host === '' || host === '...' || host.indexOf('\u2026') >= 0) return '';
        if (!host.includes('.') || host.startsWith('.') || PLACEHOLDER_HOST.test(host)) return '';
        return raw;
      } catch (error) {
        return '';
      }
    }

    /** The site's own icon, used when the card has no usable thumbnail. */
    function siteIcon(href) {
      if (typeof href !== 'string' || !HTTP.test(href)) return '';
      try {
        return new URL(href).origin + '/favicon.ico';
      } catch (error) {
        return '';
      }
    }

    /** Last-resort icon lookup for sites that do not serve /favicon.ico. */
    function serviceIcon(href) {
      if (typeof href !== 'string' || !HTTP.test(href)) return '';
      try {
        return 'https://icons.duckduckgo.com/ip3/' + new URL(href).hostname + '.ico';
      } catch (error) {
        return '';
      }
    }

    /**
     * Whether cards may contact external hosts for thumbnails. The switch lives
     * in Settings → Intelligent Inspiration; localStorage keeps it across
     * restarts, and the module-level listeners re-render every mounted card
     * when it changes. Off means a monogram tile and no image request at all.
     */
    const ICONS_SETTING = 'intelligent-inspiration.external-icons';
    const iconListeners = new Set();
    let iconsInMemory = true;

    function iconsEnabled() {
      try {
        const stored = window.localStorage.getItem(ICONS_SETTING);
        if (stored === 'off') return false;
        if (stored === 'on') return true;
      } catch (error) {
        // A renderer without storage falls back to the in-memory value.
      }
      return iconsInMemory;
    }

    function subscribeIcons(listener) {
      iconListeners.add(listener);
      return () => {
        iconListeners.delete(listener);
      };
    }

    function setIconsEnabled(enabled) {
      iconsInMemory = Boolean(enabled);
      try {
        window.localStorage.setItem(ICONS_SETTING, iconsInMemory ? 'on' : 'off');
      } catch (error) {
        // In-memory is still correct for this run.
      }
      for (const listener of Array.from(iconListeners)) {
        try {
          listener();
        } catch (error) {
          // One bad subscriber must not stop the others.
        }
      }
    }

    // Text for assistive technology only.
    const srOnly = {
      position: 'absolute',
      width: 1,
      height: 1,
      padding: 0,
      margin: -1,
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
      border: 0,
    };

    function StyleTag() {
      return h('style', { key: 'ac-style' }, CSS);
    }

    function labels() {
      // The app's own language first: navigator.language is the OS locale, which
      // can differ from the language the interface is showing.
      const lang = (typeof document !== 'undefined' && document.documentElement
        && document.documentElement.getAttribute('lang'))
        || (typeof navigator !== 'undefined' && navigator.language)
        || '';
      if (/^zh\b/i.test(lang)) {
        return {
          fallback: '交互内容',
          kind: {
            cards: '资源卡片', quiz: '小测', sort: '排序练习',
            softmax: '温度调节', match: '配对练习', chart: '图表',
            actions: '要做的事', inspiration: '灵感',
          },
          iiHint: '点击填入输入框',
          iiFilled: '已填入输入框，按 Enter 发送',
          iiCopied: '已复制',
          iiUse: '使用建议：',
          score: (right, total) => '得分 ' + right + ' / ' + total,
          answered: (done, total) => '已答 ' + done + ' / ' + total,
          progress: (done, total) => '已完成 ' + done + ' / ' + total,
          steps: (total) => '共 ' + total + ' 步',
          more: (count) => '另有 ' + count + ' 张卡片未显示',
          reset: '重做', check: '检查', up: '上移', down: '下移',
          markDone: '标记完成', markUndone: '取消完成',
          temperature: '温度', perfect: '全部答对', pick: '请选择',
          correctIs: '正确答案', opensNewTab: '（在新标签页打开）',
          entropy: (value, effective) => '熵 ' + value + ' 纳特 · 约 ' + effective + ' 个有效选项',
          token: (index) => '选项 ' + index,
          correctOption: '正确答案', yourOption: '你的选择',
        };
      }
      return {
        fallback: 'Interactive block',
        kind: {
          cards: 'Resource cards', quiz: 'Quiz', sort: 'Ordering exercise',
          softmax: 'Temperature', match: 'Matching', chart: 'Chart',
          actions: 'What to do', inspiration: 'Inspiration',
        },
        iiHint: 'Click to put it in the composer',
        iiFilled: 'Filled into the composer — press Enter to send',
        iiCopied: 'Copied',
        iiUse: 'Use suggestion: ',
        score: (right, total) => 'Score ' + right + ' / ' + total,
        answered: (done, total) => done + ' of ' + total + ' answered',
        progress: (done, total) => done + ' of ' + total + ' done',
        steps: (total) => total + ' steps',
        more: (count) => '+' + count + ' more not shown',
        reset: 'Reset', check: 'Check', up: 'Move up', down: 'Move down',
        markDone: 'Mark done', markUndone: 'Mark not done',
        temperature: 'Temperature', perfect: 'All correct', pick: 'Choose one',
        correctIs: 'Correct', opensNewTab: '(opens in a new tab)',
        entropy: (value, effective) => 'H ' + value + ' nats' + SEPARATOR + effective + ' effective choices',
        token: (index) => 'token ' + index,
        correctOption: 'Correct answer', yourOption: 'Your answer',
      };
    }

    /**
     * Remove commas that sit between the last entry and a closer, outside
     * strings. A blunt regex would rewrite the inside of a string literal, and a
     * repaired payload must mean exactly what its author wrote.
     */
    function stripTrailingCommas(source) {
      let out = '';
      let inString = false;
      let escaped = false;
      for (let index = 0; index < source.length; index += 1) {
        const ch = source[index];
        if (inString) {
          out += ch;
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          out += ch;
          continue;
        }
        if (ch === ',') {
          let next = index + 1;
          while (next < source.length && /\s/.test(source[next])) next += 1;
          if (source[next] === '}' || source[next] === ']') continue;
        }
        out += ch;
      }
      return out;
    }

    function parsePayload(source) {
      if (typeof source !== 'string') return null;
      const trimmed = source.trim();
      if (!trimmed) return null;
      let value;
      try {
        value = JSON.parse(trimmed);
      } catch (first) {
        // A trailing comma is the one authoring slip worth forgiving: it costs
        // a whole block to lose interactivity over it.
        try {
          value = JSON.parse(stripTrailingCommas(trimmed));
        } catch (second) {
          return null;
        }
      }
      return value && typeof value === 'object' ? value : null;
    }

    /** Parse once per fence body, not once per keystroke or hover. */
    function usePayload(props) {
      return useMemo(
        () => (props.streaming ? null : parsePayload(props.code)),
        [props.code, props.streaming]
      );
    }

    /** Re-arm a block's local state when the model rewrites the fence body. */
    function useResetOnChange(code, reset) {
      const [seen, setSeen] = useState(code);
      if (seen !== code) {
        setSeen(code);
        reset();
      }
    }

    function text(value, limit) {
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (trimmed.length <= limit) return trimmed;
      return trimmed.slice(0, Math.max(0, limit - 1)).replace(/\s+$/, '') + '\u2026';
    }

    /** Single-line label: collapses newlines and repeated spaces. */
    function line(value, limit) {
      return text(value, limit).replace(/\s+/g, ' ');
    }

    function primaryButton(label, onClick, disabled, extra) {
      return h('button', {
        type: 'button',
        className: 'ac-btn',
        onClick,
        disabled: disabled || undefined,
        style: Object.assign({
          padding: '5px 12px',
          borderRadius: 8,
          border: '1px solid ' + T.border,
          background: T.chip,
          color: T.text,
          font: 'inherit',
          fontSize: 12,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }, extra || {}),
      }, label);
    }

    function toneButton(label, ariaLabel, onClick, disabled) {
      return h('button', {
        type: 'button',
        className: 'ac-btn',
        onClick,
        disabled: disabled || undefined,
        'aria-label': ariaLabel,
        title: ariaLabel,
        style: {
          width: 26,
          height: 26,
          lineHeight: '18px',
          padding: 0,
          borderRadius: 7,
          border: '1px solid ' + T.border,
          background: 'transparent',
          color: T.dim,
          fontSize: 13,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.35 : 1,
        },
      }, label);
    }

    /** Shared frame: border, optional heading, optional note, inner padding. */
    function Frame(props) {
      return h('div', {
        role: 'group',
        'aria-label': props.heading || props.fallback,
        style: {
          margin: '10px 0',
          border: '1px solid ' + T.border,
          borderRadius: 12,
          overflow: 'hidden',
        },
      },
        h(StyleTag),
        props.heading
          ? h('div', {
              style: {
                padding: '11px 14px 1px',
                color: T.text,
                fontSize: 13,
                fontWeight: 600,
              },
            }, props.heading)
          : null,
        props.children,
        props.note
          ? h('div', { style: { padding: '2px 14px 11px', color: T.dim, fontSize: 12, lineHeight: 1.5 } }, props.note)
          : null);
    }

    // ---------------------------------------------------------------- cards --

    function normalizeCard(entry) {
      if (!entry || typeof entry !== 'object') return null;
      const title = line(entry.title, 200);
      if (!title) return null;
      const href = typeof entry.href === 'string' && HTTP.test(entry.href.trim()) ? entry.href.trim() : '';
      const thumb = imageUrl(entry.thumb);
      const tags = Array.isArray(entry.tags)
        ? entry.tags.filter((tag) => typeof tag === 'string' && tag.trim()).slice(0, 4).map((tag) => line(tag, 24))
        : [];
      return {
        title,
        href,
        thumb,
        fallback: siteIcon(href),
        service: serviceIcon(href),
        tags,
        desc: text(entry.desc, 600),
        source: line(entry.source, 24),
      };
    }

    /**
     * The source is the trust signal, so it is outlined and the tags stay
     * filled: two chips that look identical say nothing about which one is the
     * publisher.
     */
    function pill(label, variant) {
      const base = {
        display: 'inline-block',
        maxWidth: '100%',
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: 11.5,
        lineHeight: '17px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        verticalAlign: 'bottom',
      };
      const style = variant === 'source'
        ? Object.assign(base, {
            border: '1px solid ' + T.border,
            background: 'transparent',
            color: T.text,
          })
        : Object.assign(base, { background: T.chip, color: T.dim });
      // A chip is an element, not a bag of styles: callers mount it directly as
      // a child. Returning the style object made React reject the whole card
      // row, which sent every sourced card back to its raw fence.
      return h('span', { className: 'ac-chip', style }, label);
    }

    function Thumb(props) {
      // A thumbnail can fail for reasons the answer cannot see: a hotlink
      // guard, a host this network cannot reach, or a URL the model filled in
      // from the shape of an example. Try the supplied image, then the site's
      // own /favicon.ico, then a public icon lookup. The monogram sits
      // underneath the whole time, so a slow request never leaves a hole.
      const allowExternal = useSyncExternalStore(subscribeIcons, iconsEnabled);
      const sources = useMemo(() => {
        if (!allowExternal) return [];
        const list = [props.src, props.fallback, props.service].filter(Boolean);
        return list.filter((url, index) => list.indexOf(url) === index);
      }, [allowExternal, props.src, props.fallback, props.service]);
      const [index, setIndex] = useState(0);
      const [loaded, setLoaded] = useState(false);
      useResetOnChange(sources.join('|'), () => {
        setIndex(0);
        setLoaded(false);
      });
      const box = {
        position: 'relative',
        flex: '0 0 72px',
        width: 72,
        height: 72,
        borderRadius: 10,
        overflow: 'hidden',
        background: T.chip,
        border: '1px solid ' + T.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      };
      const src = sources[index];
      return h('span', { style: box },
        // Monogram fallback: a missing or dead image must not leave a hole.
        h('span', {
          'aria-hidden': true,
          style: {
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.dim,
            fontSize: 24,
            fontWeight: 600,
            opacity: loaded ? 0 : 1,
            transition: 'opacity 120ms ease',
          },
        }, props.initial),
        src ? h('img', {
          key: src,
          src,
          alt: '',
          loading: 'lazy',
          decoding: 'async',
          referrerPolicy: 'no-referrer',
          onLoad: () => setLoaded(true),
          onError: () => {
            setLoaded(false);
            setIndex((value) => value + 1);
          },
          style: {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            // contain, not cover: course and repository logos are usually not
            // photographs, and cover crops the mark out of them.
            objectFit: 'contain',
            padding: 6,
            boxSizing: 'border-box',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 120ms ease',
          },
        }) : null);
    }

    function CardRow(props) {
      const card = props.card;

      const titleText = h('span', {
        className: 'ac-title',
        style: {
          color: T.text,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          overflowWrap: 'anywhere',
        },
      }, card.title);

      // The title is the link: the URL stays in the href and never appears in
      // the row, and hovering the title is what shows it is clickable.
      const heading = card.href
        ? h('a', {
            className: 'ac-link',
            href: card.href,
            target: '_blank',
            rel: 'noreferrer noopener',
            style: {
              color: 'inherit',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 6,
              borderRadius: 6,
            },
          },
            titleText,
            h('span', { className: 'ac-arrow', 'aria-hidden': true, style: { color: T.dim, fontSize: 13 } }, '\u2197'),
            h('span', { style: srOnly }, props.labels.opensNewTab))
        : titleText;

      // The description is never clamped: a hidden sentence needs an affordance
      // the reader has to hunt for, and a card the model wrote is short by
      // construction.
      const meta = [];
      if (card.desc) {
        meta.push(h('p', {
          key: 'desc',
          style: { margin: '3px 0 0', color: T.dim, fontSize: 14, lineHeight: 1.55, overflowWrap: 'anywhere' },
        }, card.desc));
      }
      if (card.source || card.tags.length) {
        meta.push(h('div', {
          key: 'chips',
          style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
        },
          card.source ? pill(card.source, 'source') : null,
          card.tags.map((tag, index) => h('span', { key: 'tag' + index }, pill(tag, 'tag')))));
      }

      return h('li', {
        className: 'ac-row',
        style: {
          display: 'flex',
          gap: 14,
          padding: '14px',
          borderRadius: 12,
          listStyle: 'none',
          borderTop: props.first ? 'none' : '1px solid ' + T.border,
        },
      },
        h(Thumb, {
          src: card.thumb,
          fallback: card.fallback,
          service: card.service,
          initial: card.title.slice(0, 1).toUpperCase(),
        }),
        h('div', { style: { minWidth: 0, flex: 1 } }, heading, meta));
    }

    function CardsFence(props) {
      const payload = usePayload(props);
      const all = payload
        && (payload.kind === undefined || payload.kind === 'cards')
        && Array.isArray(payload.cards)
        ? payload.cards.map(normalizeCard).filter(Boolean)
        : [];
      // Six is a screenful. A longer payload is truncated visibly instead of
      // becoming a wall the reader has to scroll past.
      const cards = all.slice(0, 6);
      if (!cards.length) return props.children || null;
      const locale = labels();
      const extra = all.length - cards.length;
      const note = [text(payload.note, 300), extra > 0 ? locale.more(extra) : '']
        .filter(Boolean).join(' ');

      return h(Frame, {
        // No heading by default: the three-part answer puts "Recommendations"
        // in the answer Markdown, above this block, not inside it.
        heading: line(payload.title, 160),
        note,
        fallback: locale.kind.cards,
      },
        h('ul', { style: { margin: 0, padding: 0 } },
          cards.map((card, index) => h(CardRow, {
            key: (card.href || card.title) + ':' + index,
            card,
            first: index === 0,
            labels: locale,
          }))));
    }

    // ------------------------------------------------------------- actions --

    /**
     * "What to do": a short checklist the reader can tick off. The tick is local
     * to the block; nothing is sent anywhere, and a rewritten body re-arms it.
     */
    function normalizeAction(entry) {
      if (typeof entry === 'string') {
        const label = text(entry, 240);
        return label ? { text: label, why: '', effort: '' } : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const label = text(entry.text || entry.title || entry.label, 240);
      if (!label) return null;
      return {
        text: label,
        why: text(entry.why || entry.note || entry.desc, 300),
        effort: line(entry.effort || entry.time, 24),
      };
    }

    function ActionsFence(props) {
      const payload = usePayload(props);
      const items = payload
        && (payload.kind === undefined || payload.kind === 'actions')
        && Array.isArray(payload.items)
        ? payload.items.map(normalizeAction).filter(Boolean).slice(0, 6)
        : [];

      const [done, setDone] = useState([]);
      useResetOnChange(props.code, () => setDone([]));

      if (!items.length) return props.children || null;

      const locale = labels();
      const toggle = (index) => {
        setDone((previous) => (previous.indexOf(index) >= 0
          ? previous.filter((value) => value !== index)
          : previous.concat(index)));
      };

      return h(Frame, {
        // No heading by default: the three-part answer puts "What to do" in the
        // answer Markdown, above this block, not inside it.
        heading: line(payload.title, 160),
        note: text(payload.note, 300),
        fallback: locale.kind.actions,
      },
        h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 14px 8px' },
        },
          h('span', { role: 'status', 'aria-live': 'polite', style: { color: T.dim, fontSize: 12 } },
            locale.progress(done.length, items.length)),
          primaryButton(locale.reset, () => setDone([]), done.length === 0)),
        h('ul', { style: { margin: 0, padding: 0 } },
          items.map((item, index) => {
            const isDone = done.indexOf(index) >= 0;
            return h('li', {
              key: index,
              className: 'ac-row',
              style: {
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '11px 14px',
                listStyle: 'none',
                borderTop: index === 0 ? 'none' : '1px solid ' + T.border,
              },
            },
              h('button', {
                type: 'button',
                className: 'ac-btn',
                'aria-pressed': isDone,
                'aria-label': (isDone ? locale.markUndone : locale.markDone) + ': ' + item.text,
                onClick: () => toggle(index),
                style: {
                  flex: '0 0 22px',
                  width: 22,
                  height: 22,
                  marginTop: 1,
                  padding: 0,
                  borderRadius: 6,
                  border: '1.5px solid ' + (isDone ? T.ok : T.border),
                  background: isDone ? T.ok : 'transparent',
                  color: '#fff',
                  fontSize: 13,
                  lineHeight: '18px',
                  cursor: 'pointer',
                },
              }, isDone ? '✓' : ''),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', {
                  style: {
                    color: isDone ? T.dim : T.text,
                    fontSize: 14,
                    lineHeight: 1.5,
                    overflowWrap: 'anywhere',
                    textDecoration: isDone ? 'line-through' : 'none',
                  },
                }, item.text),
                item.why
                  ? h('div', { style: { marginTop: 3, color: T.dim, fontSize: 12, lineHeight: 1.55, overflowWrap: 'anywhere' } }, item.why)
                  : null,
                item.effort
                  ? h('div', { style: { marginTop: 6 } }, pill(item.effort, 'tag'))
                  : null));
          })));
    }

    // ----------------------------------------------------------------- quiz --

    function normalizeQuestion(entry) {
      if (!entry || typeof entry !== 'object') return null;
      const q = text(entry.q, 400);
      if (!q) return null;
      const options = Array.isArray(entry.options)
        ? entry.options.filter((option) => typeof option === 'string' && option.trim()).slice(0, 6).map((option) => text(option, 200))
        : [];
      if (options.length < 2) return null;
      // An answer key that does not point at an option is an authoring bug: drop
      // the question rather than grade some other option as correct.
      const answer = Number.isInteger(entry.answer) ? entry.answer : -1;
      if (answer < 0 || answer >= options.length) return null;
      return { q, options, answer, why: text(entry.why, 500) };
    }

    function QuizFence(props) {
      const payload = usePayload(props);
      const questions = payload && payload.kind === 'quiz' && Array.isArray(payload.questions)
        ? payload.questions.map(normalizeQuestion).filter(Boolean)
        : [];

      const [picked, setPicked] = useState([]);
      useResetOnChange(props.code, () => setPicked([]));

      if (!questions.length) return props.children || null;

      const locale = labels();
      const answers = picked.length === questions.length ? picked : questions.map(() => -1);
      const done = answers.filter((value) => value >= 0).length;
      const right = answers.filter((value, index) => value === questions[index].answer).length;
      const total = questions.length;

      const choose = (questionIndex, optionIndex) => {
        if (answers[questionIndex] >= 0) return;
        const next = answers.slice();
        next[questionIndex] = optionIndex;
        setPicked(next);
      };

      return h(Frame, { heading: line(payload.title, 160), note: text(payload.note, 300), fallback: locale.kind.quiz },
        h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 14px 8px' },
        },
          h('span', { role: 'status', 'aria-live': 'polite', style: { color: T.dim, fontSize: 12 } },
            done === total && right === total
              ? '\u2713 ' + locale.perfect
              : locale.score(right, total) + SEPARATOR + locale.answered(done, total)),
          primaryButton(locale.reset, () => setPicked([]), done === 0)),
        h('div', { style: { padding: '0 14px 10px' } },
          h('div', {
            role: 'progressbar',
            'aria-label': locale.kind.quiz,
            'aria-valuemin': 0,
            'aria-valuemax': total,
            'aria-valuenow': done,
            style: { height: 6, borderRadius: 999, background: T.chip, overflow: 'hidden' },
          },
            h('div', {
              className: 'ac-bar',
              style: {
                height: '100%',
                width: (total ? (done / total) * 100 : 0).toFixed(1) + '%',
                background: done === total ? (right === total ? T.ok : T.bad) : T.link,
              },
            }))),
        h('ol', { style: { margin: 0, padding: '0 14px 8px 30px' } },
          questions.map((question, questionIndex) => {
            const answered = answers[questionIndex] >= 0;
            return h('li', { key: questionIndex, style: { marginBottom: 14, color: T.text } },
              h('div', { style: { fontSize: 14, lineHeight: 1.5, marginBottom: 8, overflowWrap: 'anywhere' } }, question.q),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                question.options.map((option, optionIndex) => {
                  const isAnswer = optionIndex === question.answer;
                  const isPicked = answers[questionIndex] === optionIndex;
                  let border = T.border;
                  let mark = '';
                  if (answered && isAnswer) { border = T.ok; mark = '\u2713'; }
                  else if (answered && isPicked) { border = T.bad; mark = '\u2717'; }
                  // A pressed button, not a radio: the group never promised
                  // arrow-key navigation, and aria-pressed is the honest shape.
                  // aria-disabled keeps answered options focusable and readable.
                  return h('button', {
                    key: optionIndex,
                    type: 'button',
                    className: 'ac-btn',
                    'aria-pressed': isPicked,
                    'aria-disabled': answered ? 'true' : undefined,
                    onClick: answered ? undefined : () => choose(questionIndex, optionIndex),
                    style: {
                      textAlign: 'left',
                      padding: '7px 10px',
                      borderRadius: 8,
                      font: 'inherit',
                      fontSize: 13,
                      lineHeight: 1.5,
                      border: '1px solid ' + border,
                      background: isPicked && answered ? T.chip : 'transparent',
                      color: T.text,
                      cursor: answered ? 'default' : 'pointer',
                    },
                  },
                    mark ? h('span', { 'aria-hidden': true, style: { marginRight: 6, color: isAnswer ? T.ok : T.bad } }, mark) : null,
                    h('span', { style: { overflowWrap: 'anywhere' } }, option),
                    answered
                      ? h('span', { style: srOnly }, isAnswer ? locale.correctOption : (isPicked ? locale.yourOption : ''))
                      : null);
                })),
              answered && question.why
                ? h('div', { style: { marginTop: 6, color: T.dim, fontSize: 12, lineHeight: 1.55, overflowWrap: 'anywhere' } }, question.why)
                : null);
          })));
    }

    // ----------------------------------------------------------------- sort --

    function shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = out[i];
        out[i] = out[j];
        out[j] = swap;
      }
      return out;
    }

    function SortFence(props) {
      const payload = usePayload(props);
      const items = payload && payload.kind === 'sort' && Array.isArray(payload.items)
        ? payload.items
            .filter((item) => typeof item === 'string' || (item && typeof item.text === 'string'))
            .map((item) => ({ text: text(typeof item === 'string' ? item : item.text, 300) }))
            .filter((item) => item.text)
            .slice(0, 10)
        : [];

      const [order, setOrder] = useState(() => shuffle(items.map((_, index) => index)));
      const [checked, setChecked] = useState(false);
      useResetOnChange(props.code, () => {
        setOrder(shuffle(items.map((_, index) => index)));
        setChecked(false);
      });

      if (!items.length) return props.children || null;

      const locale = labels();
      // A payload change can leave a stale permutation; Reset repairs it.
      const current = order.length === items.length && order.every((value) => value < items.length)
        ? order
        : items.map((_, index) => index);

      const move = (position, delta) => {
        const target = position + delta;
        if (target < 0 || target >= current.length) return;
        const next = current.slice();
        const swap = next[position];
        next[position] = next[target];
        next[target] = swap;
        setChecked(false);
        setOrder(next);
      };

      const correctCount = current.filter((value, position) => value === position).length;

      return h(Frame, { heading: line(payload.title, 160), note: text(payload.note, 300), fallback: locale.kind.sort },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 14px 8px' } },
          h('span', { role: 'status', 'aria-live': 'polite', style: { color: T.dim, fontSize: 12 } },
            checked ? locale.score(correctCount, items.length) : locale.steps(items.length)),
          h('div', { style: { display: 'flex', gap: 8 } },
            primaryButton(locale.check, () => setChecked(true), checked && correctCount === items.length),
            primaryButton(locale.reset, () => { setOrder(shuffle(items.map((_, index) => index))); setChecked(false); }, false))),
        h('ol', { style: { margin: 0, padding: '0 14px 8px 30px' } },
          current.map((value, position) => {
            const isRight = value === position;
            const mark = checked ? (isRight ? '\u2713' : '\u2717') : '';
            return h('li', {
              key: value,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                color: T.text,
                fontSize: 13,
                lineHeight: 1.45,
                padding: '2px 4px',
                borderRadius: 6,
                background: checked && !isRight ? T.chip : 'transparent',
              },
            },
              h('span', { style: { flex: 1, overflowWrap: 'anywhere' } }, items[value].text),
              mark ? h('span', { 'aria-hidden': true, style: { color: isRight ? T.ok : T.bad, fontSize: 12 } }, mark) : null,
              toneButton('\u2191', locale.up, () => move(position, -1), position === 0),
              toneButton('\u2193', locale.down, () => move(position, 1), position === current.length - 1));
          })));
    }

    // -------------------------------------------------------------- softmax --

    function softmax(logits, temperature) {
      const safe = Math.max(temperature, 0.01);
      const scaled = logits.map((value) => value / safe);
      const peak = Math.max.apply(null, scaled);
      const exps = scaled.map((value) => Math.exp(value - peak));
      const total = exps.reduce((sum, value) => sum + value, 0) || 1;
      return exps.map((value) => value / total);
    }

    function SoftmaxFence(props) {
      const payload = usePayload(props);
      const logits = payload && payload.kind === 'softmax' && Array.isArray(payload.logits)
        ? payload.logits
            .filter((value) => typeof value === 'number' && Number.isFinite(value))
            .slice(0, 8)
        : [];
      // The slider covers 0.2–3.0, so a payload outside that range is clamped
      // rather than pinning the thumb at an edge with an off-range readout.
      const raw = Number(payload && payload.temperature);
      const start = Number.isFinite(raw) && raw > 0 ? Math.min(3, Math.max(0.2, raw)) : 1;

      const [temperature, setTemperature] = useState(start);
      useResetOnChange(props.code, () => setTemperature(start));

      // Every Hook runs before the guard return, so the Hook order is identical
      // whether or not the block has been parsed yet.
      const probs = useMemo(
        () => (logits.length >= 2 ? softmax(logits, temperature) : []),
        [props.code, temperature]
      );
      if (logits.length < 2) return props.children || null;

      const locale = labels();
      const names = payload && Array.isArray(payload.labels) && payload.labels.length === logits.length
        ? payload.labels.map((label) => line(String(label), 24))
        : logits.map((_, index) => locale.token(index + 1));
      let topIndex = 0;
      for (let index = 1; index < probs.length; index += 1) {
        if (probs[index] > probs[topIndex]) topIndex = index;
      }
      const peak = probs[topIndex] || 1;
      const entropy = -probs.reduce((sum, value) => sum + (value > 0 ? value * Math.log(value) : 0), 0);

      return h(Frame, { heading: line(payload.title, 160), note: text(payload.note, 300), fallback: locale.kind.softmax },
        h('div', { style: { padding: '4px 14px 10px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
            h('span', { style: { color: T.dim, fontSize: 12, minWidth: 84 } }, locale.temperature),
            h('input', {
              type: 'range',
              min: 0.2,
              max: 3,
              step: 0.05,
              value: temperature,
              'aria-label': locale.temperature,
              'aria-valuetext': temperature.toFixed(2),
              onChange: (event) => setTemperature(Number(event.target.value)),
              style: { flex: 1, accentColor: T.link, cursor: 'pointer' },
            }),
            h('span', { style: { color: T.text, fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' } },
              temperature.toFixed(2))),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            probs.map((probability, index) => h('div', { key: index, style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', {
                title: names[index],
                style: { color: T.dim, fontSize: 12, width: 64, flex: '0 0 64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
              }, names[index]),
              h('span', {
                style: {
                  flex: 1,
                  height: 18,
                  borderRadius: 5,
                  background: T.chip,
                  boxShadow: 'inset 0 0 0 1px ' + T.border,
                  overflow: 'hidden',
                },
              },
                h('span', {
                  className: 'ac-bar',
                  style: {
                    display: 'block',
                    height: '100%',
                    width: Math.max((probability / peak) * 100, probability > 0 ? 1.5 : 0).toFixed(1) + '%',
                    background: index === topIndex ? T.link : T.dim,
                    opacity: index === topIndex ? 0.9 : 0.75,
                  },
                })),
              h('span', { style: { color: T.text, fontSize: 12, width: 46, flex: '0 0 46px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } },
                (probability * 100).toFixed(1) + '%'))))),
        h('div', { style: { padding: '0 14px 10px', color: T.dim, fontSize: 12 } },
          locale.entropy(entropy.toFixed(2), Math.exp(entropy).toFixed(2))));
    }

    // ---------------------------------------------------------------- match --

    function MatchFence(props) {
      const payload = usePayload(props);
      const pairs = payload && payload.kind === 'match' && Array.isArray(payload.pairs)
        ? payload.pairs
            .filter((pair) => Array.isArray(pair) && pair.length >= 2)
            .map((pair) => ({ left: text(pair[0], 120), right: text(pair[1], 200) }))
            .filter((pair) => pair.left && pair.right)
            .slice(0, 8)
        : [];

      const [choices, setChoices] = useState({});
      const [checked, setChecked] = useState(false);
      useResetOnChange(props.code, () => {
        setChoices({});
        setChecked(false);
      });

      // Stable right-hand order for the lifetime of this block.
      const rights = useMemo(() => shuffle(pairs.map((pair) => pair.right)), [props.code]);
      if (pairs.length < 2) return props.children || null;

      const locale = labels();
      const chosen = Object.keys(choices).filter((key) => choices[key]).length;
      const right = pairs.filter((pair, index) => choices[index] === pair.right).length;
      const complete = chosen === pairs.length;

      return h(Frame, { heading: line(payload.title, 160), note: text(payload.note, 300), fallback: locale.kind.match },
        h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 14px 8px' },
        },
          h('span', { role: 'status', 'aria-live': 'polite', style: { color: T.dim, fontSize: 12 } },
            checked ? locale.score(right, pairs.length) : locale.answered(chosen, pairs.length)),
          h('div', { style: { display: 'flex', gap: 8 } },
            primaryButton(locale.check, () => setChecked(true), !complete),
            primaryButton(locale.reset, () => { setChoices({}); setChecked(false); }, chosen === 0))),
        h('div', { style: { padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 } },
          pairs.map((pair, index) => {
            const isRight = choices[index] === pair.right;
            const mark = checked ? (isRight ? '\u2713' : '\u2717') : '';
            return h('div', { key: index, style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 } },
              h('span', { style: { flex: '0 0 42%', color: T.text, lineHeight: 1.4, overflowWrap: 'anywhere' } }, pair.left),
              h('select', {
                className: 'ac-select',
                value: choices[index] || '',
                disabled: checked,
                'aria-label': pair.left,
                onChange: (event) => {
                  const next = Object.assign({}, choices);
                  next[index] = event.target.value;
                  setChoices(next);
                  setChecked(false);
                },
                style: {
                  flex: 1,
                  minWidth: 0,
                  padding: '5px 8px',
                  borderRadius: 8,
                  font: 'inherit',
                  fontSize: 12,
                  border: '1px solid ' + (checked ? (isRight ? T.ok : T.bad) : T.border),
                  background: 'transparent',
                  color: T.text,
                  cursor: checked ? 'default' : 'pointer',
                },
              },
                h('option', { value: '' }, locale.pick),
                rights.map((option, optionIndex) => h('option', { key: optionIndex, value: option }, option))),
              h('span', { 'aria-hidden': true, style: { width: 14, flex: '0 0 14px', color: isRight ? T.ok : T.bad, fontSize: 12 } }, mark));
          }),
          checked && right < pairs.length
            ? h('div', { style: { color: T.dim, fontSize: 12, lineHeight: 1.6, overflowWrap: 'anywhere' } },
                pairs.map((pair, index) => (choices[index] === pair.right ? null
                  : h('div', { key: index }, pair.left + ' \u2192 ' + locale.correctIs + ': ' + pair.right))))
            : null));
    }

    // ---------------------------------------------------------------- chart --

    function ChartFence(props) {
      const payload = usePayload(props);
      const values = payload && payload.kind === 'chart' && Array.isArray(payload.values)
        ? payload.values
            .filter((value) => typeof value === 'number' && Number.isFinite(value))
            .slice(0, 16)
        : [];
      if (values.length < 2) return props.children || null;

      const locale = labels();
      const kind = payload.chart === 'line' ? 'line' : 'bar';
      const labelsX = Array.isArray(payload.labels) ? payload.labels.map((label) => line(String(label), 12)) : [];
      const unit = text(payload.unit, 8);
      const title = line(payload.title, 160);

      // 360 CSS units wide: at a 390 px chat column the SVG renders close to
      // 1:1, so 11–12 unit type stays 11–12 px instead of shrinking to 6 px.
      const W = 360;
      const H = 190;
      const L = 34;
      const R = 10;
      const TOP = 16;
      const BOTTOM = 26;
      const innerW = W - L - R;
      const innerH = H - TOP - BOTTOM;

      // Both ends include zero, so positive-only data sits on the axis and
      // all-negative data keeps its zero line inside the canvas.
      const peak = Math.max.apply(null, values.concat([0]));
      const low = Math.min.apply(null, values.concat([0]));
      const span = (peak - low) || 1;
      const yOf = (value) => TOP + innerH * (1 - (value - low) / span);
      const zero = yOf(0);
      const step = innerW / values.length;

      const parts = [];

      // Three faint gridlines with their values at the left edge: enough to read
      // a bar without turning a small chart into a plotting library.
      [peak, low + (peak - low) / 2, low].forEach((tick, index) => {
        const y = yOf(tick);
        parts.push(h('line', {
          key: 'grid' + index,
          x1: L, y1: y, x2: W - R, y2: y,
          stroke: index === 2 ? T.border : T.chip,
          strokeWidth: 1,
        }));
        parts.push(h('text', {
          key: 'tick' + index,
          x: L - 6, y: y + 4,
          fill: T.dim, fontSize: 11, textAnchor: 'end',
        }, (Math.round(tick * 100) / 100) + unit));
      });

      if (kind === 'bar') {
        values.forEach((value, index) => {
          const x = L + index * step + step * 0.2;
          const width = step * 0.6;
          const top = Math.min(yOf(value), zero);
          const height = Math.max(Math.abs(yOf(value) - zero), 1);
          parts.push(h('rect', {
            key: 'bar' + index,
            x, y: top, width, height, rx: 3,
            fill: value < 0 ? T.bad : T.link,
            opacity: 0.85,
          }));
          parts.push(h('text', {
            key: 'val' + index,
            x: x + width / 2,
            y: value < 0 ? top + height + 12 : top - 5,
            fill: T.dim, fontSize: 10, textAnchor: 'middle',
          }, (Math.round(value * 100) / 100) + unit));
        });
      } else {
        const points = values.map((value, index) => (L + index * step + step / 2) + ',' + yOf(value)).join(' ');
        parts.push(h('polyline', {
          key: 'line',
          points,
          fill: 'none',
          stroke: T.link,
          strokeWidth: 2,
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
        }));
        values.forEach((value, index) => {
          parts.push(h('circle', {
            key: 'dot' + index,
            cx: L + index * step + step / 2,
            cy: yOf(value),
            r: 3,
            fill: T.link,
          }));
        });
        // Label only the extremes: a line chart with a number on every point is
        // unreadable at this size. One extreme index when every value is equal.
        const highIndex = values.indexOf(peak);
        const lowIndex = values.indexOf(Math.min.apply(null, values));
        const marks = highIndex === lowIndex ? [highIndex] : [highIndex, lowIndex];
        marks.forEach((pointIndex) => {
          if (pointIndex < 0) return;
          parts.push(h('text', {
            key: 'pt' + pointIndex,
            x: L + pointIndex * step + step / 2,
            y: yOf(values[pointIndex]) - 8,
            fill: T.dim, fontSize: 10, textAnchor: 'middle',
          }, (Math.round(values[pointIndex] * 100) / 100) + unit));
        });
      }

      // Every label is one gesture away from overlap, so show at most six.
      const every = Math.ceil(values.length / 6);
      values.forEach((value, index) => {
        if (index % every !== 0) return;
        const label = labelsX[index] || String(index + 1);
        parts.push(h('text', {
          key: 'x' + index,
          x: L + index * step + step / 2,
          y: H - 9,
          fill: T.dim, fontSize: 11, textAnchor: 'middle',
        }, label));
      });

      const summary = (title ? locale.kind.chart + ': ' + title : locale.kind.chart)
        + (unit ? ' (' + unit + ')' : '');
      return h(Frame, { heading: title, note: text(payload.note, 300), fallback: locale.kind.chart },
        h('div', { style: { padding: '4px 14px 8px' } },
          h('svg', {
            viewBox: '0 0 ' + W + ' ' + H,
            role: 'img',
            'aria-label': summary,
            style: { width: '100%', height: 'auto', display: 'block' },
          }, h('title', { key: 't' }, summary), parts)));
    }

    // --------------------------------------------------------- inspiration --

    function normalizeInspiration(entry) {
      if (typeof entry === 'string') {
        const value = text(entry, 120);
        return value ? { text: value, why: '' } : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const value = text(entry.text || entry.prompt || entry.q, 120);
      if (!value) return null;
      return {
        text: value,
        why: text(entry.why || entry.desc || entry.note, 60),
      };
    }

    function focusComposer() {
      if (typeof document === 'undefined') return;
      const nodes = Array.prototype.slice.call(
        document.querySelectorAll('[data-lexical-editor="true"], [contenteditable="true"]'),
      );
      const target = nodes.filter((node) => node.offsetParent !== null)[0] || nodes[0];
      if (!target) return;
      target.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (error) {
        // Focus alone is still useful when selection APIs refuse.
      }
    }

    function scheduleFocus() {
      setTimeout(focusComposer, 0);
      setTimeout(focusComposer, 80);
    }

    /**
     * Suggestion chips after the Recommendations block. One chip per row; a
     * click fills the composer through the slot's inputActions and never sends.
     * Renders nothing while streaming, and falls back to the code block when the
     * payload is unusable.
     */
    function InspirationFence(props) {
      const payload = usePayload(props);
      const items = payload
        && (payload.kind === undefined || payload.kind === 'inspiration')
        && Array.isArray(payload.items)
        ? payload.items.map(normalizeInspiration).filter(Boolean).slice(0, 4)
        : [];

      const [picked, setPicked] = useState(-1);
      const [copied, setCopied] = useState(false);

      if (props.streaming) return null;
      if (!items.length) return props.children || null;

      const locale = labels();
      const status = copied ? locale.iiCopied : (picked >= 0 ? locale.iiFilled : locale.iiHint);

      const pick = (item, index) => {
        const actions = props.inputActions;
        if (actions && typeof actions.setDraft === 'function') {
          actions.setDraft(item.text);
          setPicked(index);
          setCopied(false);
          scheduleFocus();
          return;
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard
          && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(item.text).then(
            () => { setPicked(index); setCopied(true); },
            () => {},
          );
        }
      };

      return h('div', {
        role: 'group',
        'aria-label': locale.kind.inspiration,
        style: { margin: '12px 0 2px' },
      },
        h(StyleTag),
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 7,
          },
        },
          h('span', {
            style: {
              color: T.dim,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            },
          }, locale.kind.inspiration),
          h('span', {
            role: 'status',
            'aria-live': 'polite',
            style: { color: T.dim, fontSize: 11.5, textAlign: 'right' },
          }, status)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          items.map((item, index) => h('button', {
            key: index,
            type: 'button',
            className: 'ii-chip',
            'aria-label': locale.iiUse + item.text,
            onClick: () => pick(item, index),
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              width: '100%',
              boxSizing: 'border-box',
              minWidth: 0,
              padding: '9px 12px',
              borderRadius: 10,
              border: '1px solid ' + (index === picked ? T.link : T.border),
              background: index === picked ? T.chip : 'transparent',
              color: T.text,
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            },
          },
            h('span', {
              style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
            },
              h('span', {
                style: { fontSize: 13.5, lineHeight: 1.4, overflowWrap: 'anywhere' },
              }, item.text),
              item.why
                ? h('span', {
                    style: { color: T.dim, fontSize: 11.5, lineHeight: 1.4, overflowWrap: 'anywhere' },
                  }, item.why)
                : null),
            h('span', {
              'aria-hidden': true,
              style: {
                color: index === picked ? T.link : T.dim,
                fontSize: 13,
                lineHeight: '19px',
                flex: '0 0 auto',
              },
            }, '↗')))));
    }

    // ------------------------------------------------------------- settings --

    const SESSION_API = '/intelligent-inspiration/session';

    /**
     * The per-conversation switch in the composer dock. Off means the host does
     * not attach the answer-format section to this session's agent: the next
     * answer is plain, with no Claim/Quiz/Recommendations structure and no
     * inspiration chips. The chooser is stored by the host against the session.
     */
    function InspirationToggle(props) {
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
      const [enabled, setEnabled] = useState(true);
      const [busy, setBusy] = useState(false);

      useEffect(() => {
        if (!sessionId) return undefined;
        let cancelled = false;
        fetch(SESSION_API + '?sessionId=' + encodeURIComponent(sessionId), { credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            if (!cancelled && body && typeof body.enabled === 'boolean') setEnabled(body.enabled);
          })
          .catch(() => {});
        return () => {
          cancelled = true;
        };
      }, [sessionId]);

      if (!sessionId) return null;

      const toggle = () => {
        if (busy) return;
        const next = !enabled;
        setBusy(true);
        fetch(SESSION_API, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, enabled: next }),
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            setEnabled(body && typeof body.enabled === 'boolean' ? body.enabled : next);
          })
          .catch(() => {})
          .then(() => setBusy(false));
      };

      return h('button', {
        type: 'button',
        'aria-pressed': enabled,
        title: enabled
          ? 'Inspiration is on for this conversation. Click to use plain answers.'
          : 'Inspiration is off for this conversation. Click to turn the answer format back on.',
        onClick: toggle,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 10px',
          borderRadius: 999,
          border: '1px solid ' + T.border,
          background: T.chip,
          color: enabled ? T.text : T.dim,
          font: 'inherit',
          fontSize: 12,
          whiteSpace: 'nowrap',
          cursor: busy ? 'progress' : 'pointer',
          opacity: busy ? 0.6 : 1,
        },
      },
        h('span', {
          'aria-hidden': true,
          style: {
            width: 6,
            height: 6,
            borderRadius: 999,
            display: 'inline-block',
            background: enabled ? T.link : T.dim,
          },
        }),
        'Inspiration ' + (enabled ? 'on' : 'off'));
    }

    function SettingsPanel() {
      const enabled = useSyncExternalStore(subscribeIcons, iconsEnabled);
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('label', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            color: T.text,
            fontSize: 14,
          },
        },
          h('input', {
            type: 'checkbox',
            checked: enabled,
            onChange: (event) => setIconsEnabled(event.target.checked),
          }),
          h('span', null, 'Load external card icons'),
        ),
        h('p', {
          style: { margin: 0, color: T.dim, fontSize: 12.5, lineHeight: '18px' },
        }, 'Recommendation cards fetch the thumbnail, then the site favicon. Turn this off to show the monogram tile only — no image request leaves Harness.'));
    }

    // ---------------------------------------------------------------- guard --

    class Guard extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        if (this.state.failed) return this.props.fallback || null;
        return this.props.children;
      }
    }

    function guarded(Component) {
      return function Guarded(props) {
        // Keyed by the fence body: when the model rewrites the block, a boundary
        // that already failed is remounted instead of staying dead for the rest
        // of the session.
        return h(Guard, { key: props.code, fallback: props.children || null },
          h(Component, Object.assign({}, props)));
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const layers = [
          ['cards', guarded(CardsFence)],
          ['actions', guarded(ActionsFence)],
          ['quiz', guarded(QuizFence)],
          ['sort', guarded(SortFence)],
          ['softmax', guarded(SoftmaxFence)],
          ['match', guarded(MatchFence)],
          ['chart', guarded(ChartFence)],
          ['inspiration', guarded(InspirationFence)],
        ];
        for (let index = 0; index < layers.length; index += 1) {
          const key = layers[index][0];
          const component = layers[index][1];
          ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register({
            name: 'conversation.chat.markdown.fence',
            key,
            id: '@local/intelligent-inspiration/fence/' + key,
          }, component));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: '@local/intelligent-inspiration/settings',
          order: 332,
          label: () => 'Intelligent Inspiration',
        }, SettingsPanel));
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: '@local/intelligent-inspiration/session-toggle',
          order: 20,
        }, InspirationToggle));
      },
    };
  },
});
