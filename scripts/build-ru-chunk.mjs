#!/usr/bin/env node
// Build a SELF-CONTAINED ru dictionary chunk for patching official builds.
//
// Since v2 the feature-module dictionaries (*.i18n.ts) are bundled into the
// shared main chunk, so the per-locale chunk Vite emits imports its module
// data from there and cannot be transplanted onto an official build. This
// script bundles the full ru dict (direct keys + settings + all module ru
// blocks) into one standalone ESM file exporting { dict }.
//
// Usage: node scripts/build-ru-chunk.mjs <upstream-checkout-with-ru> <outFile>
// Requires: bun (for `bun build`).
//
// The upstream checkout must already contain i18n/messages/ru.ts +
// ru.settings.ts and the patched module ru blocks (see
// scripts/patch-upstream-sources.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const [rootArg, outArg] = process.argv.slice(2);
if (!rootArg || !outArg) {
  console.error('usage: node scripts/build-ru-chunk.mjs <upstream-checkout> <outFile>');
  process.exit(2);
}
const root = path.resolve(rootArg);
const outFile = path.resolve(outArg);
const ruTs = path.join(root, 'packages', 'ui', 'src', 'lib', 'i18n', 'messages', 'ru.ts');
if (!fs.existsSync(ruTs)) {
  console.error(`[build-ru-chunk] ERROR: ru.ts not found: ${ruTs}`);
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'ru-chunk-'));
const entry = path.join(tmpDir, 'entry.ts');
fs.writeFileSync(entry, `import { dict } from ${JSON.stringify(ruTs)};\nexport { dict };\n`);

try {
  execFileSync('bun', ['build', entry, '--outfile', outFile, '--minify', '--format', 'esm'], { stdio: 'pipe' });
} catch (err) {
  console.error(`[build-ru-chunk] ERROR: bun build failed:\n${String(err.stderr || err).slice(0, 800)}`);
  process.exit(1);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const src = fs.readFileSync(outFile, 'utf8');
if (!/export\{[^}]*\bas dict\b/.test(src)) {
  console.error('[build-ru-chunk] ERROR: output does not export { dict }');
  process.exit(1);
}
const required = [
  'common.language.russian',
  'settings.routing.auto.title',
  'settings.webSearch.section.provider',
  'settings.extensions.section.installed',
  'settings.integrations.linear.title',
  'usageStats.metric.cost',
  'chat.messageBody.forkDialog.toast.forked',
  'desktopHostSwitcher.instance.localOpenChamber',
];
const missing = required.filter((k) => !src.includes(k));
if (missing.length) {
  console.error(`[build-ru-chunk] ERROR: chunk missing keys: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`[build-ru-chunk] wrote ${outFile} (${src.length} chars), all probe keys present`);
