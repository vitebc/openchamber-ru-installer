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

// ---- runtime.ts ----
patchFile('runtime.ts', (src, onFail) => {
  src = replaceIfMissing(
    src,
    "export type Locale = 'en' | 'fr' | 'zh-CN' | 'zh-TW' | 'uk' | 'es' | 'pt-BR' | 'ko' | 'pl' | 'ja';",
    "export type Locale = 'en' | 'fr' | 'zh-CN' | 'zh-TW' | 'uk' | 'es' | 'pt-BR' | 'ko' | 'pl' | 'ja' | 'ru';",
    'Locale union',
    onFail,
  );
  src = replaceIfMissing(
    src,
    "['en', 'fr', 'zh-CN', 'zh-TW', 'uk', 'es', 'pt-BR', 'ko', 'pl', 'ja']",
    "['en', 'fr', 'zh-CN', 'zh-TW', 'uk', 'es', 'pt-BR', 'ko', 'pl', 'ja', 'ru']",
    'LOCALES array',
    onFail,
  );
  const labelUnion = "Record<Locale, 'common.language.english' | 'common.language.french' | 'common.language.simplifiedChinese' | 'common.language.traditionalChinese' | 'common.language.ukrainian' | 'common.language.spanish' | 'common.language.brazilianPortuguese' | 'common.language.korean' | 'common.language.polish' | 'common.language.japanese'>";
  const labelUnionRu = labelUnion.replace(
    "| 'common.language.japanese'>",
    "| 'common.language.japanese' | 'common.language.russian'>",
  );
  src = replaceIfMissing(src, labelUnion, labelUnionRu, 'LOCALE_LABEL_KEYS type union', onFail);
  src = replaceIfMissing(
    src,
    "  ja: 'common.language.japanese',\n};",
    "  ja: 'common.language.japanese',\n  ru: 'common.language.russian',\n};",
    'LOCALE_LABEL_KEYS entry',
    onFail,
  );
  const plNorm = "  if (normalized === 'pl' || normalized.startsWith('pl-')) {\n    return 'pl';\n  }\n  return DEFAULT_LOCALE;";
  const ruNorm = "  if (normalized === 'pl' || normalized.startsWith('pl-')) {\n    return 'pl';\n  }\n  if (normalized === 'ru' || normalized.startsWith('ru-')) {\n    return 'ru';\n  }\n  return DEFAULT_LOCALE;";
  src = replaceIfMissing(src, plNorm, ruNorm, 'normalizeLocale', onFail);
  return src;
}, 'runtime.ts');

// ---- store.ts (dictionary loader chain) ----
patchFile('store.ts', (src, onFail) => {
  const marker = "                : locale === 'ja'\n                  ? await import('./messages/ja') as { dict: I18nDictionary }\n                  : { dict: enDict };";
  const replacement = "                : locale === 'ja'\n                  ? await import('./messages/ja') as { dict: I18nDictionary }\n                  : locale === 'ru'\n                    ? await import('./messages/ru') as { dict: I18nDictionary }\n                    : { dict: enDict };";
  return replaceIfMissing(src, marker, replacement, 'loadDictionary ru branch', onFail);
}, 'store.ts');

// ---- intl.ts ----
patchFile('intl.ts', (src, onFail) => {
  return replaceIfMissing(
    src,
    "  pl: 'pl-PL',\n  ja: 'ja-JP',\n};",
    "  pl: 'pl-PL',\n  ja: 'ja-JP',\n  ru: 'ru-RU',\n};",
    'intl locale map',
    onFail,
  );
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
  src = replaceIfMissing(
    src,
    '  pl: PL_MESSAGES,\n  ja: JA_MESSAGES,\n};',
    '  pl: PL_MESSAGES,\n  ja: JA_MESSAGES,\n  ru: RU_MESSAGES,\n};',
    'BOOTSTRAP_MESSAGES entry',
    onFail,
  );
  return src;
}, 'bootstrap.ts');

// ---- en.ts (language label key) ----
patchFile('messages/en.ts', (src, onFail) => {
  return replaceIfMissing(
    src,
    "  'common.language.japanese': 'Japanese',",
    "  'common.language.japanese': 'Japanese',\n  'common.language.russian': 'Russian',",
    'en.ts common.language.russian',
    onFail,
  );
}, 'en.ts');

console.log('[patch-upstream] done');
