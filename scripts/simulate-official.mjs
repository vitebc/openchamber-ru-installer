#!/usr/bin/env node
// Simulate an official (non-ru) web UI build for the CI smoke test.
//
// Given an assets dir that was built WITH the Russian locale bundled, this
// script strips every ru marker so the result looks like a fresh upstream
// release. It is the exact mirror of what patch/openchamber-ru-patch.mjs adds,
// using regexes that tolerate different minified variable names.
//
// Usage: node scripts/simulate-official.mjs <assets-with-ru> [outDir]
// Output: <outDir>/assets  (default: scripts/.simulate-official/assets)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const [srcArg, outArg] = process.argv.slice(2);
if (!srcArg) {
  console.error('usage: node scripts/simulate-official.mjs <assets-with-ru> [outDir]');
  process.exit(2);
}
const SRC = path.resolve(srcArg);
const OUT = path.resolve(outArg ?? path.join(ROOT, 'scripts', '.simulate-official'));
const DST = path.join(OUT, 'assets');

if (!fs.existsSync(SRC) || !fs.statSync(SRC).isDirectory()) {
  console.error(`not a directory: ${SRC}`);
  process.exit(2);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
for (const f of fs.readdirSync(SRC)) {
  fs.copyFileSync(path.join(SRC, f), path.join(DST, f));
}

function fail(msg) {
  console.error(`[simulate] ERROR: ${msg}`);
  process.exit(1);
}

function stripAll(name, src, frag) {
  if (!src.includes(frag)) {
    fail(`${name}: strip fragment not found: ${frag.slice(0, 70)}`);
  }
  return src.split(frag).join('');
}

// 1. Remove bundled ru dictionary chunks.
for (const f of fs.readdirSync(DST)) {
  if (/^ru-[^/]+\.js$/.test(f)) fs.rmSync(path.join(DST, f));
}

// 2. Strip ru from the i18n runtime chunk.
const main = fs.readdirSync(DST).filter((f) => /^useAppFontEffects-[^/]+\.js$/.test(f));
if (main.length !== 1) fail(`expected one useAppFontEffects chunk, found ${main.length}`);
const mainPath = path.join(DST, main[0]);
let src = fs.readFileSync(mainPath, 'utf8');

// LOCALES tail: '…,"pl","ja","ru"]' -> '…,"pl","ja"]' (keep the closing bracket)
if (!/,"ru"\]/.test(src)) fail('LOCALES strip regex not found');
src = src.replace(/,"ru"\]/, ']');

// LOCALE_LABEL_KEYS entry: ',ru:"common.language.russian"}' -> '}'
const labelRe = /,ru:"common\.language\.russian"\}/;
if (!labelRe.test(src)) fail('LOCALE_LABEL_KEYS strip regex not found');
src = src.replace(labelRe, '}');

// normalizeLocale branch: '<var>==="ru"||<var>.startsWith("ru-")?"ru":' removed
const normRe = /(\w+)==="ru"\|\|\1\.startsWith\("ru-"\)\?"ru":/;
if (!normRe.test(src)) fail('normalizeLocale strip regex not found');
src = src.replace(normRe, '');

// Dictionary loader branch: '<var>==="ru"?await <fn>(()=>import("./ru-*.js"),[]):' removed
const loaderRe = /(\w+)==="ru"\?await (\w+)\(\(\)=>import\("\.\/ru-[^"]+"\),\[\]\):/;
if (!loaderRe.test(src)) fail('dictionary loader strip regex not found');
src = src.replace(loaderRe, '');

fs.writeFileSync(mainPath, src);

// 3. Strip common.language.russian from every locale dictionary chunk.
const localeRe = /^(en|es|fr|ja|ko|pl|pt-BR|uk|zh-CN|zh-TW)-[^/]+\.js$/;
let strippedLocales = 0;
for (const f of fs.readdirSync(DST)) {
  if (!localeRe.test(f)) continue;
  const p = path.join(DST, f);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('common.language.russian')) {
    const re = /,"common\.language\.russian":"[^"]*"/g;
    if (!re.test(c)) fail(`${f}: cannot strip common.language.russian`);
    c = c.replace(re, '');
    fs.writeFileSync(p, c);
    strippedLocales += 1;
  }
}

console.log(
  `[simulate] official-like build written to ${DST} ` +
    `(main: ${main[0]}, locales stripped: ${strippedLocales})`,
);
