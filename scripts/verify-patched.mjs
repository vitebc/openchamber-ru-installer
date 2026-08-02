#!/usr/bin/env node
// CI smoke-test: verify that an assets dir patched by openchamber-ru-patch.mjs
// contains a complete, syntactically valid Russian locale wiring.
//
// Usage: node scripts/verify-patched.mjs <assetsDir>

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const [dirArg] = process.argv.slice(2);
if (!dirArg) {
  console.error('usage: node scripts/verify-patched.mjs <assetsDir>');
  process.exit(2);
}
const dir = path.resolve(dirArg);
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error(`not a directory: ${dir}`);
  process.exit(2);
}

function fail(msg) {
  console.error(`[verify] ERROR: ${msg}`);
  process.exit(1);
}
function checkSyntax(file) {
  const tmp = path.join(tmpdir(), `oc-check-${process.pid}-${path.basename(file)}.mjs`);
  fs.copyFileSync(file, tmp);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (err) {
    fail(`${path.basename(file)}: syntax check failed:\n${String(err.stderr || err).slice(0, 500)}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const main = fs.readdirSync(dir).filter((f) => /^useAppFontEffects-[^/]+\.js$/.test(f));
if (main.length !== 1) fail(`expected one useAppFontEffects chunk, found ${main.length}`);
const mainSrc = fs.readFileSync(path.join(dir, main[0]), 'utf8');
checkSyntax(path.join(dir, main[0]));

const checks = [
  ['LOCALES contains ru', /"pl","ja","ru"\]/.test(mainSrc)],
  ['LOCALE_LABEL_KEYS has ru', /ru:"common\.language\.russian"/.test(mainSrc)],
  ['normalizeLocale has ru branch', /startsWith\("ru-"\)\?"ru"/.test(mainSrc)],
  ['loader imports ru chunk', /import\("\.\/ru-ruinstaller\.js"\)/.test(mainSrc)],
];
for (const [name, ok] of checks) {
  if (!ok) fail(`runtime chunk missing: ${name}`);
  console.log(`[verify] ok: ${name}`);
}

const ruChunk = path.join(dir, 'ru-ruinstaller.js');
if (!fs.existsSync(ruChunk)) fail('ru-ruinstaller.js not present');
checkSyntax(ruChunk);
const ruSrc = fs.readFileSync(ruChunk, 'utf8');
if (!ruSrc.includes('common.language.russian":"Русский')) {
  fail('ru-ruinstaller.js missing common.language.russian label');
}
console.log(`[verify] ok: ru-ruinstaller.js (${ruSrc.length} chars)`);

const localeRe = /^(en|es|fr|ja|ko|pl|pt-BR|uk|zh-CN|zh-TW)-[^/]+\.js$/;
let locales = 0;
for (const f of fs.readdirSync(dir)) {
  if (!localeRe.test(f)) continue;
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  if (!c.includes('"common.language.russian"')) {
    fail(`${f}: missing common.language.russian`);
  }
  locales += 1;
}
if (locales === 0) fail('no locale chunks found to verify');
console.log(`[verify] ok: common.language.russian present in ${locales} locale chunks`);
console.log('[verify] PASS');
