# OpenChamber RU Installer

Установщик русского перевода для **OpenChamber Desktop** без пересборки проекта.
Патчит уже установленное приложение: добавляет русский словарь в веб-UI (`resources/web-dist/assets`) и включает его в систему локалей.

> Неофициальный инструмент. Работает с OpenChamber Desktop **1.17.x** (Electron). После автообновления приложения перевод нужно ставить заново.

## Требования

- Установленный OpenChamber Desktop ([releases](https://github.com/openchamber/openchamber/releases))
- **Node.js** (или bun) для патчера. На Windows можно через [nodejs.org](https://nodejs.org/); для AppImage на Linux понадобятся ещё `curl` и `appimagetool`.

## Установка (Windows)

1. Скачай/клонируй этот репозиторий.
2. Закрой OpenChamber полностью (трей → Quit).
3. Запусти `install-desktop-ru.cmd` (или `install-desktop-ru.ps1`).
   - Путь к установке ищется автоматически (`%LOCALAPPDATA%\Programs\@openchamberelectron\resources\web-dist\assets`).
   - Если не нашлось — передай путь аргументом:
     ```
     install-desktop-ru.cmd "C:\Users\Имя\AppData\Local\Programs\@openchamberelectron\resources\web-dist\assets"
     ```
4. Запусти OpenChamber, открой **Settings → Appearance → Language → Russian**.

## Установка (Linux, AppImage)

```
./install-desktop-ru.sh ./OpenChamber-1.17.1-linux-x86_64.AppImage
```

Скрипт распакует AppImage, пропатчит `resources/web-dist/assets`, пересоберёт новый AppImage (нужны `curl` + `appimagetool`, скачивается автоматически). Готовый файл будет в `/tmp/.../OpenChamber-ru.AppImage`.

Если AppImage уже распакован (`--appimage-extract`), можно патчить каталог напрямую:

```
./install-desktop-ru.sh /путь/к/squashfs-root/resources/web-dist/assets
```

## Удаление

Запусти `uninstall-desktop-ru.cmd` / `uninstall-desktop-ru.ps1` / `uninstall-desktop-ru.sh <assets>` — оригинальные файлы восстановятся из резервных копий (`.bak`), `ru-ruinstaller.js` удалится.

## Что делает патчер

В `resources/web-dist/assets/`:

- **`useAppFontEffects-*.js`** — i18n runtime. Добавляет:
  - `'ru'` в массив `LOCALES`;
  - `ru: 'common.language.russian'` в `LOCALE_LABEL_KEYS`;
  - ветку `ru` / `ru-*` в `normalizeLocale`;
  - динамический `import("./ru-ruinstaller.js")` в загрузчик словарей.
- **Локали-чанки** (`en|fr|es|ja|ko|pl|pt-BR|uk|zh-CN|zh-TW`): добавляется ключ `common.language.russian` с названием языка на языке словаря (Ruso, Russe, ロシア語 и т.д.).
- **`ru-ruinstaller.js`** — готовый русский словарь (полный перевод, 2852 ключа), копируется из `patch/`.

Все изменённые файлы бэкапятся в `.bak`. Патчер идемпотентен — повторный запуск ничего не портит.

## Ограничения

- Перевод собран из версии 1.17.1; если в новой версии изменятся имена чанков или минифицированный код — патчер предупредит об отсутствии маркеров и оставит `.bak`.
- Bootstrap-надписи при запуске («Connecting…», «Connected!») встроены в другой бандл и остаются на английском (видны кратко при старте).
- После официального обновления OpenChamber перевод нужно установить заново.
- `app.asar` не трогается — веб-UI лежит отдельно в `resources/web-dist/`.

## Состав

- `install-desktop-ru.cmd` / `.ps1` / `.sh` — установка
- `uninstall-desktop-ru.cmd` / `.ps1` / `.sh` — удаление
- `patch/openchamber-ru-patch.mjs` — основной патчер (кроссплатформенный, Node.js)
- `patch/ru-ruinstaller.js` — пресобранный русский словарь
- `i18n/messages/ru.ts`, `ru.settings.ts` — исходники перевода (для регенерации)
