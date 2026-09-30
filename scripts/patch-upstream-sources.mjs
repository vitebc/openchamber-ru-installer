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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [rootArg] = process.argv.slice(2);
if (!rootArg) {
  console.error('usage: node scripts/patch-upstream-sources.mjs <upstream-checkout>');
  process.exit(2);
}
const root = path.resolve(rootArg);
const I18N = path.join(root, 'packages', 'ui', 'src', 'lib', 'i18n');
const INSTALLER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

console.log('[patch-upstream] done (base registration)');

// ---------------------------------------------------------------------------
// v2 additions below: component hardcode fixes (unified diff), all-locale
// russian labels, feature-module ru blocks, and shared toast/label keys.
// ---------------------------------------------------------------------------

// ---- component fixes: exact fork diff, applied with git (fails loud on drift) ----
{
  const diff = path.join(INSTALLER_ROOT, 'upstream-patches', 'ru-v2-component-fixes.diff');
  if (!fs.existsSync(diff)) fail(`component fixes diff not found: ${diff}`);
  try {
    execFileSync('git', ['apply', diff], { cwd: root, stdio: 'pipe' });
    console.log('[patch-upstream] patched component fixes (ru-v2-component-fixes.diff)');
  } catch {
    try {
      execFileSync('git', ['apply', '--reverse', '--check', diff], { cwd: root, stdio: 'pipe' });
      console.log('[patch-upstream] component fixes: already applied');
    } catch {
      fail('component fixes diff does not apply (upstream drifted?)');
    }
  }
}

function emitTs(raw) {
  return `'${raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}'`;
}

function flatKeys(src) {
  const keys = new Set();
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*['"]([^'"]+)['"]\s*:/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function moduleBlockKeys(src, locale) {
  const lines = src.split('\n');
  const open = locale.includes('-') ? `  '${locale}': {` : `  ${locale}: {`;
  const s = lines.findIndex((l) => l === open);
  if (s < 0) return null;
  const keys = [];
  for (let i = s + 1; i < lines.length; i++) {
    if (/^  \},?\s*$/.test(lines[i])) break;
    const m = lines[i].match(/^\s*['"]([^'"]+)['"]\s*:/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// ---- pre-patch audit: fail once with the COMPLETE list of untranslated keys ----
{
  const MESSAGES = path.join(I18N, 'messages');
  const gaps = [];
  const enKeys = new Set([
    ...flatKeys(fs.readFileSync(path.join(MESSAGES, 'en.ts'), 'utf8')),
    ...flatKeys(fs.readFileSync(path.join(MESSAGES, 'en.settings.ts'), 'utf8')),
  ]);
  const ruKeys = new Set([
    ...flatKeys(fs.readFileSync(path.join(MESSAGES, 'ru.ts'), 'utf8')),
    ...flatKeys(fs.readFileSync(path.join(MESSAGES, 'ru.settings.ts'), 'utf8')),
  ]);
  for (const k of enKeys) {
    if (!ruKeys.has(k)) gaps.push(`dict: ${k}`);
  }
  const MODULE_FILES = ['linear-issue-picker', 'linear-panel', 'routing', 'plugin-panel', 'surface-panel', 'file-artifacts', 'usage-stats', 'websearch', 'linear-integration', 'guest-integrations', 'extensions.settings', 'isolated-spaces', 'providers', 'mcp-grid', 'plugins-grid', 'third-party-integrations', 'extension-catalog'];
  for (const mod of MODULE_FILES) {
    const dataFile = path.join(INSTALLER_ROOT, 'i18n', 'modules', `${mod}.ru.json`);
    if (!fs.existsSync(dataFile)) {
      gaps.push(`module ${mod}: missing data file`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const src = fs.readFileSync(path.join(MESSAGES, `${mod}.i18n.ts`), 'utf8');
    const enBlock = moduleBlockKeys(src, 'en');
    if (!enBlock) {
      gaps.push(`module ${mod}: en block not found`);
      continue;
    }
    for (const k of enBlock) {
      if (data[k] === undefined) gaps.push(`module ${mod}: ${k}`);
    }
  }
  if (gaps.length) {
    fail(`untranslated keys (${gaps.length}):\n${gaps.join('\n')}`);
  }
  console.log('[patch-upstream] audit: no untranslated keys');
}

function insertAfterAnchor(file, anchor, linesToAdd, onFail) {
  let src = fs.readFileSync(file, 'utf8');
  const idx = src.split('\n').findIndex((l) => l.includes(`'${anchor}'`) || l.includes(`"${anchor}"`));
  if (idx < 0) onFail(`anchor not found: ${anchor} in ${path.basename(file)}`);
  const arr = src.split('\n');
  const indent = arr[idx].match(/^\s*/)[0];
  const q = arr[idx].trimStart().startsWith('"') ? '"' : "'";
  const add = linesToAdd.map(([k, v]) => {
    const val = q === '"' ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"` : emitTs(v);
    return `${indent}${q}${k}${q}: ${val},`;
  });
  arr.splice(idx + 1, 0, ...add);
  fs.writeFileSync(file, arr.join('\n'));
}

// ---- common.language.russian in every locale dictionary ----
const RUSSIAN_PER_LOCALE = {
  en: 'Russian', de: 'Russisch', es: 'Ruso', fr: 'Russe', ja: 'ロシア語',
  ko: '러시아어', pl: 'Rosyjski', 'pt-BR': 'Russo', tr: 'Rusça',
  uk: 'Російська', 'zh-CN': '俄语', 'zh-TW': '俄語', nl: 'Russisch',
};
{
  const MESSAGES = path.join(I18N, 'messages');
  for (const [loc, word] of Object.entries(RUSSIAN_PER_LOCALE)) {
    const file = path.join(MESSAGES, `${loc}.ts`);
    if (!fs.existsSync(file)) fail(`locale file not found: ${loc}.ts`);
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes('common.language.russian')) {
      console.log(`[patch-upstream] ${loc}.ts: russian label already present`);
      continue;
    }
    insertAfterAnchor(file, 'common.language.turkish', [['common.language.russian', word]], fail);
    console.log(`[patch-upstream] patched ${loc}.ts (russian label)`);
  }
}

// ---- feature-module ru blocks + test locale arrays ----
{
  const MODULES = {
    'linear-issue-picker': 'linearIssuePickerI18n', 'linear-panel': 'linearPanelI18n',
    routing: 'routingI18n', 'plugin-panel': 'pluginPanelI18n',
    'surface-panel': 'surfacePanelI18n', 'file-artifacts': 'fileArtifactsI18n',
    'usage-stats': 'usageStatsI18n', websearch: 'webSearchI18n',
    'linear-integration': 'linearIntegrationI18n', 'guest-integrations': 'guestIntegrationsI18n',
    'extensions.settings': 'extensionsSettingsI18n', 'isolated-spaces': 'isolatedSpacesI18n',
    providers: 'providersI18n', 'mcp-grid': 'mcpGridI18n', 'plugins-grid': 'pluginsGridI18n',
    'third-party-integrations': 'thirdPartyIntegrationI18n', 'extension-catalog': 'extensionCatalogI18n',
  };
  const MESSAGES = path.join(I18N, 'messages');
  for (const mod of Object.keys(MODULES)) {
    const dataFile = path.join(INSTALLER_ROOT, 'i18n', 'modules', `${mod}.ru.json`);
    if (!fs.existsSync(dataFile)) fail(`module ru data not found: ${dataFile}`);
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const file = path.join(MESSAGES, `${mod}.i18n.ts`);
    let src = fs.readFileSync(file, 'utf8');
    if (!/^\s*ru: \{$/m.test(src)) {
      // Key order follows the en block so diffs stay reviewable.
      const enBlock = src.match(/^  en: \{$([\s\S]*?)^  \},?$/m);
      if (!enBlock) fail(`${mod}: en block not found`);
      const order = [...enBlock[1].matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((m) => m[1]);
      const lines = ['  ru: {'];
      for (const key of order) {
        if (data[key] === undefined) fail(`${mod}: missing ru translation for ${key}`);
        lines.push(`    '${key}': ${emitTs(data[key])},`);
      }
      lines.push('  },');
      const tail = '} as const;';
      const idx = src.lastIndexOf(tail);
      if (idx < 0) fail(`${mod}: module tail not found`);
      src = `${src.slice(0, idx).replace(/\s+$/, '\n') + lines.join('\n')}\n${src.slice(idx)}`;
      fs.writeFileSync(file, src);
      console.log(`[patch-upstream] patched ${mod}.i18n.ts (ru block, ${order.length} keys)`);
    } else {
      console.log(`[patch-upstream] ${mod}.i18n.ts: ru block already present`);
    }
    const testFile = path.join(MESSAGES, `${mod}.i18n.test.ts`);
    if (fs.existsSync(testFile)) {
      let t = fs.readFileSync(testFile, 'utf8');
      if (!t.includes("'ru'")) {
        if (!t.includes("'zh-TW', 'tr'] as const")) fail(`${mod} test: locales array marker not found`);
        t = t.replace("'zh-TW', 'tr'] as const", "'zh-TW', 'tr', 'ru'] as const");
        fs.writeFileSync(testFile, t);
        console.log(`[patch-upstream] patched ${mod}.i18n.test.ts (ru locale)`);
      } else {
        console.log(`[patch-upstream] ${mod}.i18n.test.ts: ru already present`);
      }
    }
  }
}

// ---- shared toast/label keys in every locale (anchors + per-locale values) ----
{
  const GROUPS = [
    { anchor: 'chat.messageBody.forkDialog.createWorktree', keys: {
      'chat.messageBody.forkDialog.toast.forked': { en: 'Forked from {title}', de: 'Abgezweigt von {title}', es: 'Ramificación creada a partir de {title}', fr: 'Fourche créée à partir de {title}', ja: '「{title}」からフォークしました', ko: '{title}에서 분기를 만들었습니다', pl: 'Utworzono odgałęzienie z {title}', 'pt-BR': 'Ramificação criada a partir de {title}', uk: 'Створено відгалуження від {title}', 'zh-CN': '已从“{title}”创建分支', 'zh-TW': '已從「{title}」建立分支', tr: '{title}’den fork oluşturuldu', ru: 'Создано ответвление от {title}', nl: 'Geforkt van {title}' },
      'chat.messageBody.forkDialog.toast.forkFailed': { en: 'Failed to fork session', de: 'Fehler beim Abzweigen der Sitzung', es: 'No se pudo ramificar la sesión', fr: 'Échec de la création de la fourche', ja: 'セッションのフォークに失敗しました', ko: '세션 분기에 실패했습니다', pl: 'Nie udało się utworzyć odgałęzienia sesji', 'pt-BR': 'Falha ao ramificar a sessão', uk: 'Не вдалося створити відгалуження сесії', 'zh-CN': '创建会话分支失败', 'zh-TW': '建立工作階段分支失敗', tr: 'Oturum fork’lanamadı', ru: 'Не удалось создать ответвление сессии', nl: 'Sessie forken mislukt' } } },
    { anchor: 'chat.permissionToast.permissionFallback', keys: {
      'chat.permissionToast.respondFailed': { en: 'Failed to respond to permission request', de: 'Antwort auf die Berechtigungsanfrage fehlgeschlagen', es: 'No se pudo responder a la solicitud de permiso', fr: 'Échec de la réponse à la demande d’autorisation', ja: '権限リクエストへの応答に失敗しました', ko: '권한 요청에 응답하지 못했습니다', pl: 'Nie udało się odpowiedzieć na żądanie uprawnień', 'pt-BR': 'Falha ao responder à solicitação de permissão', uk: 'Не вдалося відповісти на запит дозволу', 'zh-CN': '未能响应权限请求', 'zh-TW': '未能回應權限請求', tr: 'İzin isteğine yanıt verilemedi', ru: 'Не удалось ответить на запрос разрешения', nl: 'Reageren op toestemmingsverzoek mislukt' } } },
    { anchor: 'openCodeStatusDialog.toast.copyFailed', keys: {
      'openCodeStatusDialog.toast.collectFailed': { en: 'Failed to collect OpenCode status', de: 'Fehler beim Erfassen des OpenCode-Status', es: 'No se pudo recopilar el estado de OpenCode', fr: 'Échec de la collecte du statut OpenCode', ja: 'OpenCodeのステータスの取得に失敗しました', ko: 'OpenCode 상태를 수집하지 못했습니다', pl: 'Nie udało się pobrać statusu OpenCode', 'pt-BR': 'Falha ao coletar o status do OpenCode', uk: 'Не вдалося отримати статус OpenCode', 'zh-CN': '未能收集OpenCode状态', 'zh-TW': '未能收集OpenCode狀態', tr: 'OpenCode durumu alınamadı', ru: 'Не удалось получить статус OpenCode', nl: 'OpenCode-status ophalen mislukt' } } },
    { anchor: 'desktopHostSwitcher.instance.local', keys: {
      'desktopHostSwitcher.instance.localOpenChamber': { en: 'Local OpenChamber', de: 'Lokales OpenChamber', es: 'OpenChamber local', fr: 'OpenChamber local', ja: 'ローカル OpenChamber', ko: '로컬 OpenChamber', pl: 'Lokalny OpenChamber', 'pt-BR': 'OpenChamber local', uk: 'Локальний OpenChamber', 'zh-CN': '本地 OpenChamber', 'zh-TW': '本機 OpenChamber', tr: 'Yerel OpenChamber', ru: 'Локальный OpenChamber', nl: 'Lokale OpenChamber' } } },
    { anchor: 'session.newWorktree.error.worktreeDirectoryRequired', keys: {
      'session.newWorktree.error.projectNotRegistered': { en: 'Project is not registered in OpenChamber', de: 'Projekt ist nicht in OpenChamber registriert', es: 'El proyecto no está registrado en OpenChamber', fr: 'Le projet n’est pas enregistré dans OpenChamber', ja: 'プロジェクトはOpenChamberに登録されていません', ko: '프로젝트가 OpenChamber에 등록되어 있지 않습니다', pl: 'Projekt nie jest zarejestrowany w OpenChamber', 'pt-BR': 'O projeto não está registrado no OpenChamber', uk: 'Проєкт не зареєстровано в OpenChamber', 'zh-CN': '项目尚未在OpenChamber中注册', 'zh-TW': '專案尚未在OpenChamber中註冊', tr: 'Proje OpenChamber’a kayıtlı değil', ru: 'Проект не зарегистрирован в OpenChamber', nl: 'Project is niet geregistreerd in OpenChamber' },
      'session.newWorktree.error.sessionCreateFailed': { en: 'Could not create a session for the worktree', de: 'Sitzung für den Worktree konnte nicht erstellt werden', es: 'No se pudo crear una sesión para el worktree', fr: 'Impossible de créer une session pour le worktree', ja: 'ワークツリー用のセッションを作成できませんでした', ko: '워크트리에 대한 세션을 만들 수 없습니다', pl: 'Nie można utworzyć sesji dla drzewa pracy', 'pt-BR': 'Não foi possível criar uma sessão para o worktree', uk: 'Не вдалося створити сесію для worktree', 'zh-CN': '无法为工作树创建会话', 'zh-TW': '無法為 worktree 建立工作階段', tr: 'Worktree için oturum oluşturulamadı', ru: 'Не удалось создать сессию для ворктрейя', nl: 'Kon geen sessie aanmaken voor de worktree' } } },
  ];
  const SETTINGS_GROUPS = [
    { anchor: 'settings.voice.page.field.apiKey', keys: {
      'settings.voice.page.field.apiKeyOptional': { en: 'Optional', de: 'Optional', es: 'Opcional', fr: 'Facultatif', ja: '任意', ko: '선택 사항', pl: 'Opcjonalne', 'pt-BR': 'Opcional', uk: 'Додатково', 'zh-CN': '可选', 'zh-TW': '可選', tr: 'İsteğe bağlı', ru: 'Необязательно', nl: 'Optioneel' } } },
  ];
  const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW', 'tr', 'ru', 'nl'];
  const MESSAGES = path.join(I18N, 'messages');
  for (const loc of LOCALES) {
    const mainFile = path.join(MESSAGES, `${loc}.ts`);
    const setFile = path.join(MESSAGES, `${loc}.settings.ts`);
    for (const g of GROUPS) {
      const missing = Object.entries(g.keys).filter(([k]) => !fs.readFileSync(mainFile, 'utf8').includes(`'${k}'`) && !fs.readFileSync(mainFile, 'utf8').includes(`"${k}"`));
      if (missing.length) {
        insertAfterAnchor(mainFile, g.anchor, missing.map(([k, vals]) => {
          if (vals[loc] === undefined) fail(`no ${loc} value for ${k}`);
          return [k, vals[loc]];
        }), fail);
        console.log(`[patch-upstream] patched ${loc}.ts (${missing.map(([k]) => k).join(', ')})`);
      }
    }
    for (const g of SETTINGS_GROUPS) {
      const missing = Object.entries(g.keys).filter(([k]) => !fs.readFileSync(setFile, 'utf8').includes(`'${k}'`) && !fs.readFileSync(setFile, 'utf8').includes(`"${k}"`));
      if (missing.length) {
        insertAfterAnchor(setFile, g.anchor, missing.map(([k, vals]) => {
          if (vals[loc] === undefined) fail(`no ${loc} value for ${k}`);
          return [k, vals[loc]];
        }), fail);
        console.log(`[patch-upstream] patched ${loc}.settings.ts (${missing.map(([k]) => k).join(', ')})`);
      }
    }
  }
}

console.log('[patch-upstream] done (v2 additions)');
