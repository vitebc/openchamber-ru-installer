#!/usr/bin/env node
// Patch upstream OpenChamber sources so the web bundle is built WITH the
// Russian locale, mirroring the ru wiring that lives in the vitebc fork.
// Run BEFORE building the upstream web bundle; the ru dictionaries must
// already be copied into packages/ui/src/lib/i18n/messages/.
//
// Usage: node scripts/patch-upstream-sources.mjs <path-to-upstream-checkout>
//
// Idempotent: skips any file that already contains the ru markers.

import fs from 'node:fs';
import path from 'node:path';

const [rootArg] = process.argv.slice(2);
if (!rootArg) {
  console.error('usage: node scripts/patch-upstream-sources.mjs <upstream-checkout>');
  process.exit(2);
}
const root = path.resolve(rootArg);
const I18N = path.join(root, 'packages', 'ui', 'src', 'lib', 'i18n');

function read(rel) {
  return fs.readFileSync(path.join(I18N, rel), 'utf8');
}
function write(rel, content) {
  fs.writeFileSync(path.join(I18N, rel), content);
}
function fail(msg) {
  console.error(`[patch-upstream] ERROR: ${msg}`);
  process.exit(1);
}
function patchFile(rel, apply, logName) {
  const file = path.join(I18N, rel);
  if (!fs.existsSync(file)) fail(`${rel}: file not found`);
  const before = fs.readFileSync(file, 'utf8');
  const after = apply(before, fail);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[patch-upstream] patched ${rel} (${logName})`);
  } else {
    console.log(`[patch-upstream] ${rel}: already patched`);
  }
}
function replaceIfMissing(src, marker, replacement, desc, onFail) {
  if (src.includes(replacement)) return src;
  if (!src.includes(marker)) onFail(`marker not found (${desc}): ${marker.slice(0, 80)}`);
  return src.replace(marker, replacement);
}

function patchFunctionEnd(src, fnMarker, onFail, makeInsertion) {
  const fnStart = src.indexOf(fnMarker);
  if (fnStart < 0) onFail(`function not found: ${fnMarker}`);
  const openIndex = src.indexOf('{', fnStart);
  if (openIndex < 0) onFail('function body not found');
  let depth = 0;
  let inString = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  let closeIndex = -1;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
    } else if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
    } else if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
    } else if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
    } else if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        closeIndex = i;
        break;
      }
    }
  }
  if (closeIndex < 0) onFail('function body end not found');
  const body = src.slice(openIndex + 1, closeIndex);
  const returns = [...body.matchAll(/\n([ \t]*)return\s+DEFAULT_LOCALE;/g)];
  if (returns.length === 0) onFail('function fallback not found');
  const target = returns[returns.length - 1];
  const insertion = makeInsertion(target[1]);
  return src.slice(0, openIndex + 1 + target.index) + insertion + src.slice(openIndex + 1 + target.index);
}

// ---- runtime.ts ----
patchFile('runtime.ts', (src, onFail) => {
  // Generic: ru is always the last locale, inserted before the closing token so
  // the patch survives whatever locale upstream added after 'ja'.
  if (!src.includes(" | 'ru'")) {
    const typeRe = /export type Locale = [^;]+;/;
    const m = src.match(typeRe);
    if (!m) onFail('Locale union not found');
    if (!m[0].includes("'ru'")) {
      src = src.replace(typeRe, (whole) => whole.replace(/;$/, " | 'ru';"));
    }
  }
  if (!src.includes("'ru'] as const")) {
    src = src.replace(/(\] as const)/, ", 'ru'] as const");
    if (!src.includes("'ru'] as const")) onFail('LOCALES array not patched');
  }
  if (!src.includes("'common.language.russian'")) {
    src = src.replace(/'common\.language\.[^']*'>/, (m) => m.replace(/'>$/, "' | 'common.language.russian'>"));
    if (!src.includes("'common.language.russian'")) onFail('LOCALE_LABEL_KEYS type union not patched');
  }
  if (!src.includes("ru: 'common.language.russian'")) {
    src = src.replace(
      /(export const LOCALE_LABEL_KEYS[^{]*\{[^}]*?)(\n\};)/,
      (all, head, tail) => head + "\n  ru: 'common.language.russian'," + tail,
    );
    if (!src.includes("ru: 'common.language.russian'")) onFail('LOCALE_LABEL_KEYS entry not inserted');
  }
  if (!src.includes("normalized === 'ru'")) {
    src = patchFunctionEnd(src, 'export function normalizeLocale(', onFail, (bodyIndent) => (
      `\n${bodyIndent}if (normalized === 'ru' || normalized.startsWith('ru-')) {\n` +
      `${bodyIndent}  return 'ru';\n` +
      `${bodyIndent}}`
    ));
  }
  return src;
}, 'runtime.ts');

// ---- store.ts (dictionary loader chain) ----
patchFile('store.ts', (src, onFail) => {
  if (src.includes("locale === 'ru'")) return src;
  // Append ru as the last branch before the enDict fallback.
  const re = /(\s*): \{ dict: enDict \};/;
  const m = src.match(re);
  if (!m) onFail('store.ts: enDict fallback not found');
  const indent = m[1];
  const ruBranch = `${indent}: locale === 'ru'\n${indent}  ? await import('./messages/ru') as { dict: I18nDictionary }\n${indent}: { dict: enDict };`;
  return src.replace(re, ruBranch);
}, 'store.ts');

// ---- intl.ts ----
patchFile('intl.ts', (src, onFail) => {
  if (src.includes("ru: 'ru-RU'")) return src;
  const m = src.match(/(const INTL_LOCALE_BY_LOCALE[^{]*\{[\s\S]*?)(?:\n\};)/);
  if (!m) onFail('intl locale map: INTL_LOCALE_BY_LOCALE block not found');
  return src.replace(m[0], m[1] + "\n  ru: 'ru-RU'," + m[0].slice(m[1].length));
}, 'intl.ts');

// ---- bootstrap.ts ----
patchFile('bootstrap.ts', (src, onFail) => {
  const ruBlock = `const RU_MESSAGES: BootstrapMessages = {
  startingApi: 'Запуск OpenCode API…',
  initializing: 'Инициализация…',
  connecting: 'Подключение…',
  connected: 'Подключено!',
  connectionError: 'Ошибка подключения',
  disconnected: 'Отключено',
  reconnecting: 'Повторное подключение…',
  initialDataLoadFailed: 'OpenCode подключен, но не удалось загрузить начальные данные.',
  cliNotFound: 'OpenCode CLI не найден. Пожалуйста, установите его.',
  providersReady: '✓ Провайдеры',
  providersLoading: '… Провайдеры',
  agentsReady: '✓ Агенты',
  agentsLoading: '… Агенты',
  startingDevServer: (hostLabel) => \`Запуск dev-сервера webview (\${hostLabel})...\`,
  waitingDevServer: (hostLabel, attempt) => \`Ожидание dev-сервера webview (\${hostLabel})... попытка \${attempt}\`,
  loadingData: (providersText, agentsText) => \`Загрузка данных (\${providersText}, \${agentsText})…\`,
};

export const getBootstrapMessages = (locale: Locale): BootstrapMessages => {`;
  const marker = 'export const getBootstrapMessages = (locale: Locale): BootstrapMessages => {';
  src = replaceIfMissing(src, marker, ruBlock, 'RU_MESSAGES block', onFail);
  // BOOTSTRAP_MESSAGES: insert ru as the last entry before closing \n};.
  if (!src.includes('ru: RU_MESSAGES')) {
    const re = /(const BOOTSTRAP_MESSAGES[\s\S]*?)(\n\};)/;
    if (!re.test(src)) onFail('BOOTSTRAP_MESSAGES block not found');
    src = src.replace(re, (all, head, tail) => head + '\n  ru: RU_MESSAGES,' + tail);
  }
  return src;
}, 'bootstrap.ts');

// ---- en.ts (language label key) ----
patchFile('messages/en.ts', (src, onFail) => {
  if (src.includes("'common.language.russian'")) return src;
  // Insert as the last common.language entry (right before common.revealPath).
  const re = /(^\s*'common\.language\.[^']+':\s*'[^']+',\s*\n)(?=^\s*'common\.revealPath)/m;
  // Fallback: if the language block directly precedes common.revealPath, the above captures its last entry's newline.
  // Insert the ru entry via replace on the boundary.
  if (re.test(src)) {
    return src.replace(re, (m) => m + "  'common.language.russian': 'Russian',\n");
  }
  // Fallback for compact formatting (no revealPath marker found) — use turkish then japanese as last guess.
  if (src.includes("'common.language.turkish'")) {
    return replaceIfMissing(
      src,
      "  'common.language.turkish': 'Turkish',",
      "  'common.language.turkish': 'Turkish',\n  'common.language.russian': 'Russian',",
      'en.ts common.language.russian (after turkish)',
      onFail,
    );
  }
  return replaceIfMissing(
    src,
    "  'common.language.japanese': 'Japanese',",
    "  'common.language.japanese': 'Japanese',\n  'common.language.russian': 'Russian',",
    'en.ts common.language.russian',
    onFail,
  );
}, 'en.ts');

console.log('[patch-upstream] done');
