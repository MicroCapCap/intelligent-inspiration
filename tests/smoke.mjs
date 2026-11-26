/**
 * Load smoke test for client.js.
 *
 * Executes the browser module protocol (window.__ModuleLoader__.load), builds the
 * plugin with a stand-in module table, and asserts that apply() registers exactly
 * the seven expected fence keys with well-formed ids. It does not render React:
 * visual behaviour is verified in the running page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.dirname needs Node 20.11; this runs on older 20.x too.
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'client.js');
const source = fs.readFileSync(file, 'utf8');

let entry = null;
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      entry = spec;
    },
  },
};

// eslint-disable-next-line no-new-func
new Function(source)();

const fail = [];
const ok = [];

if (!entry) fail.push('module never called window.__ModuleLoader__.load');
else {
  if (entry.id !== '@local/intelligent-inspiration') fail.push('unexpected module id: ' + entry.id);
  else ok.push('module id ' + entry.id);
}

const mod = entry && entry.factory(() => ({
  createElement() {},
  useState() {},
  useMemo() {},
  useSyncExternalStore() {},
  Component: class Component {},
}));
if (!mod || typeof mod.apply !== 'function') fail.push('factory did not return an apply()');
else ok.push('factory returned apply()');

const registered = [];
const sections = [];
if (mod && typeof mod.apply === 'function') {
  const ctx = {
    slots: {
      inject(name, install) {
        if (name !== 'conversation.chat.markdown.fence' && name !== 'settings.section') {
          fail.push('wrong slot: ' + name);
        }
        const dispose = install();
        if (typeof dispose !== 'function') fail.push('register() must return a disposer');
      },
      register(options, component) {
        if (options.name === 'settings.section') sections.push({ options, component });
        else registered.push({ options, component });
        return () => {};
      },
    },
  };
  try {
    mod.apply(ctx);
  } catch (error) {
    fail.push('apply() threw: ' + error.message);
  }
}

const expected = ['cards', 'actions', 'inspiration', 'quiz', 'sort', 'softmax', 'match', 'chart'].sort();
const keys = registered.map((row) => row.options.key).sort();
if (keys.join(',') !== expected.join(',')) {
  fail.push('fence keys: expected ' + expected.join(',') + ' got ' + keys.join(','));
} else ok.push('registered fences: ' + keys.join(', '));

for (const row of registered) {
  const { options, component } = row;
  if (options.name !== 'conversation.chat.markdown.fence') fail.push('row name wrong for ' + options.key);
  if (typeof options.id !== 'string' || !options.id.startsWith('@local/intelligent-inspiration/fence/')) {
    fail.push('row id malformed for ' + options.key + ': ' + options.id);
  }
  if (typeof component !== 'function') fail.push('row ' + options.key + ' has a non-component');
}

if (sections.length !== 1) {
  fail.push('settings sections: expected 1 got ' + sections.length);
} else {
  const { options, component } = sections[0];
  if (options.id !== '@local/intelligent-inspiration/settings') {
    fail.push('settings id malformed: ' + options.id);
  }
  if (typeof options.label !== 'function' || options.label() !== 'Intelligent Inspiration') {
    fail.push('settings label malformed');
  }
  if (typeof component !== 'function') fail.push('settings section has a non-component');
  else ok.push('settings section registered');
}
if (!fail.length) ok.push('every registration well formed');

for (const line of ok) console.log('ok   ' + line);
for (const line of fail) console.log('FAIL ' + line);
console.log(fail.length ? 'SMOKE FAILED (' + fail.length + ')' : 'SMOKE OK');
process.exit(fail.length ? 1 : 0);
