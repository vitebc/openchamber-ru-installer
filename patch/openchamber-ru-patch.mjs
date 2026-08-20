#!/usr/bin/env node
// OpenChamber RU installer — core patcher (Node.js, cross-platform).
//
// Usage:
//   node patch/openchamber-ru-patch.mjs install <assetsDir>
//   node patch/openchamber-ru-patch.mjs uninstall <assetsDir>
//
// <assetsDir> is the directory that contains the web UI JS chunks, e.g.
//   Windows: <install>\resources\web-dist\assets
//   Linux:   <unpacked AppImage>\squashfs-root\resources\web-dist\assets
//
// The patcher works on the minified bundles produced by vite:
//   - useAppFontEffects-*.js  -> i18n runtime (LOCALES, LOCALE_LABEL_KEYS,
//                                normalizeLocale, dictionary loader chain)
//   - <locale>-*.js           -> per-locale dictionaries (without ru by default)
//   - ru-ruinstaller.js       -> bundled here, copied into assets by install

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RUSSIAN_NAME = 'ru-ruinstaller.js';
const RUSSIAN_LABEL_KEY = 'common.language.russian';

// Native name of "Russian" as shown inside each locale's language picker.
const RUSSIAN_PER_LOCALE = {
  en: 'Russian',
  de: 'Russisch',
  es: 'Ruso',
  fr: 'Russe',
  ja: 'ロシア語',
  ko: '러시아어',
  pl: 'Rosyjski',
  'pt-BR': 'Russo',
  uk: 'Російська',
  'zh-CN': '俄语',
  'zh-TW': '俄語',
};

function log(msg) {
  console.log(`[ru-installer] ${msg}`);
}
function fail(msg) {
  console.error(`[ru-installer] ERROR: ${msg}`);
  process.exitCode = 1;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMainChunk(assetsDir) {
  const names = fs.readdirSync(assetsDir).filter((n) => /^useAppFontEffects-[^/]+\.js$/.test(n));
  if (names.length !== 1) {
    throw new Error(`expected exactly one useAppFontEffects chunk, found ${names.length}`);
  }
  return path.join(assetsDir, names[0]);
}

function backup(file) {
  const bak = `${file}.bak`;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    log(`backup created: ${path.basename(bak)}`);
  }
}

function restore(file) {
  const bak = `${file}.bak`;
  if (!fs.existsSync(bak)) return false;
  fs.copyFileSync(bak, file);
  fs.rmSync(bak);
  log(`restored: ${path.basename(file)}`);
  return true;
}

function patchRuntime(runtimePath, ruChunkName) {
  const name = path.basename(runtimePath);
  let src = fs.readFileSync(runtimePath, 'utf8');

  // 1. LOCALES array: add 'ru'.
  const localesMark = '"pl","ja"]';
  const localesAfter = '"pl","ja","ru"]';
  if (!src.includes(localesMark)) throw new Error(`${name}: LOCALES marker not found`);
  if (!src.includes(localesAfter)) {
    src = src.replace(localesMark, localesAfter);
    log(`${name}: patched LOCALES`);
  } else {
    log(`${name}: LOCALES already patched`);
  }

  // 2. LOCALE_LABEL_KEYS: add ru -> common.language.russian.
  const labelMark = 'ja:"common.language.japanese"}';
  if (!src.includes(labelMark)) throw new Error(`${name}: LOCALE_LABEL_KEYS marker not found`);
  const labelAfter = `ja:"common.language.japanese",ru:"${RUSSIAN_LABEL_KEY}"}`;
  if (!src.includes(labelAfter)) {
    src = src.replace(labelMark, labelAfter);
    log(`${name}: patched LOCALE_LABEL_KEYS`);
  } else {
    log(`${name}: LOCALE_LABEL_KEYS already patched`);
  }

  // 3. normalizeLocale: add the ru / ru-* branch.
  const normRe = /(\w+)\.startsWith\("pl-"\)\?"pl":(\w+)\}/;
  const normM = src.match(normRe);
  if (!normM) throw new Error(`${name}: normalizeLocale marker not found`);
  const normAfter =
    `${normM[1]}.startsWith("pl-")?"pl":` +
    `${normM[1]}==="ru"||${normM[1]}.startsWith("ru-")?"ru":${normM[2]}}`;
  if (!src.includes(normAfter)) {
    src = src.replace(normRe, normAfter);
    log(`${name}: patched normalizeLocale`);
  } else {
    log(`${name}: normalizeLocale already patched`);
  }

  // 4. Dictionary loader chain: add the ru dynamic import after the ja branch.
  // The second import() argument may be `[]` or vite's `__vite__mapDeps([...])`.
  const loaderRe =
    /(\w+)==="ja"\?await (\w+)\(\(\)=>import\("\.\/ja-([^"]+)"\),((?:__vite__mapDeps\(\[[0-9,]*\]\)|\[\]))\):(\{dict:[\w$]+\})/;
  const loaderM = src.match(loaderRe);
  if (!loaderM) throw new Error(`${name}: dictionary loader marker not found`);
  const loaderAfter =
    `${loaderM[1]}==="ja"?await ${loaderM[2]}(()=>import("./${loaderM[3]}"),${loaderM[4]}):` +
    `${loaderM[1]}==="ru"?await ${loaderM[2]}(()=>import("./${ruChunkName}"),[]):${loaderM[5]}`;
  if (!src.includes(loaderAfter)) {
    src = src.replace(loaderRe, loaderAfter);
    log(`${name}: patched dictionary loader`);
  } else {
    log(`${name}: dictionary loader already patched`);
  }

  fs.writeFileSync(runtimePath, src);
}

function patchLocales(assetsDir) {
  const localeRe = /^(en|de|es|fr|ja|ko|pl|pt-BR|uk|zh-CN|zh-TW)-[^/]+\.js$/;
  const names = fs.readdirSync(assetsDir).filter((n) => localeRe.test(n));
  for (const name of names) {
    const locale = name.replace(/^([a-z]{2}(-[A-Z]{2})?)-.*\.js$/, '$1');
    const file = path.join(assetsDir, name);
    let src = fs.readFileSync(file, 'utf8');
    if (src.includes(`"${RUSSIAN_LABEL_KEY}"`)) {
      log(`${name}: already patched`);
      continue;
    }
    const re = /("common\.language\.japanese":\s*"[^"]*")/;
    if (!re.test(src)) {
      log(`${name}: no common.language.japanese marker, skipping`);
      continue;
    }
    const val = RUSSIAN_PER_LOCALE[locale] ?? 'Russian';
    const next = src.replace(re, `$1,"${RUSSIAN_LABEL_KEY}":"${val}"`);
    backup(file);
    fs.writeFileSync(file, next);
    log(`patched locale: ${name} (russian: ${val})`);
  }
}

function copyRuChunk(assetsDir) {
  const srcFile = path.join(__dirname, RUSSIAN_NAME);
  if (!fs.existsSync(srcFile)) {
    throw new Error(`bundled ${RUSSIAN_NAME} is missing next to the patcher`);
  }
  const destFile = path.join(assetsDir, RUSSIAN_NAME);
  if (fs.existsSync(destFile)) {
    log(`${RUSSIAN_NAME}: already present`);
    return;
  }
  fs.copyFileSync(srcFile, destFile);
  log(`copied: ${RUSSIAN_NAME}`);
}

function cmdInstall(assetsDir) {
  copyRuChunk(assetsDir);
  const runtime = findMainChunk(assetsDir);
  backup(runtime);
  patchRuntime(runtime, RUSSIAN_NAME);
  patchLocales(assetsDir);
  log('DONE — restart OpenChamber, then Settings -> Appearance -> Language -> Russian.');
}

function cmdUninstall(assetsDir) {
  const runtime = findMainChunk(assetsDir);
  if (restore(runtime)) {
    const names = fs.readdirSync(assetsDir).filter((n) => /^[a-z]{2}(-[A-Z]{2})?-[^/]+\.js$/.test(n));
    for (const name of names) {
      const file = path.join(assetsDir, name);
      if (fs.existsSync(`${file}.bak`)) restore(file);
    }
  }
  const ruChunk = path.join(assetsDir, RUSSIAN_NAME);
  if (fs.existsSync(ruChunk)) {
    fs.rmSync(ruChunk);
    log(`removed: ${RUSSIAN_NAME}`);
  }
  log('DONE — original files restored.');
}

const [, , cmd, assetsArg] = process.argv;
if (!assetsArg) {
  console.error('usage: node openchamber-ru-patch.mjs <install|uninstall> <assetsDir>');
  process.exit(2);
}
const assetsDir = path.resolve(assetsArg);
if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
  console.error(`[ru-installer] ERROR: not a directory: ${assetsDir}`);
  process.exit(2);
}
try {
  if (cmd === 'install') cmdInstall(assetsDir);
  else if (cmd === 'uninstall') cmdUninstall(assetsDir);
  else throw new Error(`unknown command: ${cmd}`);
} catch (err) {
  fail(err.message);
}
