/**
 * Manifest, locale, detail-page, and fixture validation.
 *
 * Checks the parts of the bundle that can be verified without a browser: package
 * metadata, declared files, locale documents and their paths, the detail
 * illustration's constraints, and that every fence example in the README is JSON
 * the renderer would accept.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const parse = (name) => JSON.parse(read(name));
const fail = [];
const ok = [];
const check = (condition, message) => (condition ? ok.push(message) : fail.push(message));

// ---- manifest ---------------------------------------------------------------

const pkg = parse('package.json');
check(pkg.name === '@local/intelligent-inspiration', 'package name ' + pkg.name);
check(/^\d+\.\d+\.\d+$/.test(pkg.version), 'version ' + pkg.version);
check(pkg.license === 'MIT' && fs.existsSync(path.join(root, 'LICENSE')), 'license MIT with LICENSE file');
check(pkg.exports && pkg.exports['./client'] === './client.js', 'exports ./client');
check(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web', 'dsh.client.platform web');
check(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml', 'bundle patch declared');

// `files` entries may be globs or directories, so a literal-name check would
// reject a correct manifest.
const listed = (name) => pkg.files.some((entry) => {
  if (entry === name) return true;
  if (!entry.includes('*')) {
    // A directory entry ships everything under it.
    return name.startsWith(entry.replace(/\/$/, '') + '/');
  }
  const pattern = new RegExp('^' + entry.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  return pattern.test(name);
});

for (const required of ['index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'icon.svg', 'docs/preview.svg', 'locale/en.json', 'locale/zh.json', 'docs/DETAIL.md', 'docs/DETAIL.zh.md']) {
  check(fs.existsSync(path.join(root, required)), 'file exists: ' + required);
  check(listed(required), 'listed in files: ' + required);
}

// ---- locales and detail pages ----------------------------------------------

for (const locale of ['en', 'zh']) {
  const meta = parse('locale/' + locale + '.json').meta;
  check(Boolean(meta && meta.title && meta.description), 'locale ' + locale + ': title and description');
  const detail = meta && meta.detail;
  check(typeof detail === 'string' && detail.endsWith('.md'), 'locale ' + locale + ': detail path');
  if (typeof detail === 'string') {
    const detailPath = path.join(root, detail);
    check(fs.existsSync(detailPath), 'locale ' + locale + ': detail file ' + detail);
    const lines = fs.readFileSync(detailPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    check(lines.length === 1 && /^!\[[^\]]+\]\([^)]+\.svg\)$/.test(lines[0]), 'locale ' + locale + ': detail is one image line');
    const image = lines.length === 1 ? lines[0].match(/\(([^)]+)\)/) : null;
    if (image) {
      const imagePath = path.join(path.dirname(detailPath), image[1]);
      check(fs.existsSync(imagePath), 'locale ' + locale + ': image ' + image[1]);
    }
  }
}

// ---- illustration -----------------------------------------------------------

const svg = read('docs/preview.svg');
check(/^<svg[\s>]/.test(svg.trim()), 'preview.svg is a root svg');
check(/width="640"\s+height="300"\s+viewBox="0 0 640 300"/.test(svg), 'preview.svg is 640x300');
check(svg.length < 200 * 1024, 'preview.svg size ' + svg.length + ' bytes');
for (const forbidden of ['<text', '<script', '<style', 'foreignObject', '<animate', 'onload=', 'xlink:href']) {
  check(!svg.includes(forbidden), 'preview.svg free of ' + forbidden);
}

// ---- README fixtures --------------------------------------------------------

const readme = read('README.md');
const fences = [];
const pattern = /```(cards|actions|inspiration|quiz|sort|softmax|match|chart)\r?\n([\s\S]*?)```/g;
let match;
while ((match = pattern.exec(readme)) !== null) fences.push({ lang: match[1], body: match[2] });
check(fences.length === 8, 'README documents eight fences (found ' + fences.length + ')');

for (const fence of fences) {
  let payload;
  try {
    payload = JSON.parse(fence.body);
  } catch (error) {
    fail.push('README ' + fence.lang + ' example is not JSON: ' + error.message);
    continue;
  }
  ok.push('README ' + fence.lang + ' example parses');
  if (fence.lang === 'cards') {
    check(Array.isArray(payload.cards) && payload.cards.length > 0, 'cards: non-empty list');
    for (const card of payload.cards) {
      check(typeof card.title === 'string' && card.title.trim(), 'cards: title present');
      check(!card.href || /^https?:\/\//.test(card.href), 'cards: href is http(s)');
      check(!card.thumb || /^https?:\/\//.test(card.thumb), 'cards: thumb is http(s)');
      check(!card.tags || card.tags.length <= 4, 'cards: at most four tags');
    }
  } else {
    check(payload.kind === fence.lang, fence.lang + ': kind matches the fence language');
  }
  if (fence.lang === 'actions') {
    check(Array.isArray(payload.items) && payload.items.length >= 1 && payload.items.length <= 6, 'actions: 1-6 items');
    for (const item of payload.items) {
      const label = typeof item === 'string' ? item : item && item.text;
      check(typeof label === 'string' && label.trim(), 'actions: text present');
    }
  }
  if (fence.lang === 'quiz') {
    check(payload.questions.length > 0, 'quiz: has questions');
    for (const question of payload.questions) {
      check(Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 6, 'quiz: 2-6 options');
      check(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length, 'quiz: answer index in range');
    }
  }
  if (fence.lang === 'sort') check(payload.items.length >= 2 && payload.items.length <= 10, 'sort: 2-10 items');
  if (fence.lang === 'softmax') check(payload.logits.length >= 2 && payload.logits.length <= 8, 'softmax: 2-8 logits');
  if (fence.lang === 'match') check(payload.pairs.length >= 2 && payload.pairs.length <= 8, 'match: 2-8 pairs');
  if (fence.lang === 'chart') check(payload.values.length >= 2 && payload.values.length <= 16, 'chart: 2-16 values');
}

// ---- report ----------------------------------------------------------------

for (const line of ok) console.log('ok   ' + line);
for (const line of fail) console.log('FAIL ' + line);
console.log(fail.length ? 'FIXTURES FAILED (' + fail.length + ')' : 'FIXTURES OK (' + ok.length + ' checks)');
process.exit(fail.length ? 1 : 0);
