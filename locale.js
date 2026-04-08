import Gio from "gi://Gio";
import GLib from "gi://GLib";

const SUPPORTED_LANGS = ['en', 'tr', 'ru', 'de', 'it', 'ja', 'fr', 'es'];

let _cache = {};

function _getSystemLanguage() {
  const langs = GLib.get_language_names();
  for (const lang of langs) {
    const code = lang.split('_')[0].split('.')[0].toLowerCase();
    if (SUPPORTED_LANGS.includes(code)) {
      return code;
    }
  }
  return 'en';
}

function _resolveCode(langSetting) {
  const lang = (!langSetting || langSetting === 'auto')
    ? _getSystemLanguage()
    : langSetting;
  return SUPPORTED_LANGS.includes(lang) ? lang : 'en';
}

export function preloadLocale(extensionPath, langSetting) {
  return new Promise((resolve) => {
    const code = _resolveCode(langSetting);
    if (_cache[code]) {
      resolve(_cache[code]);
      return;
    }

    const filePath = GLib.build_filenamev([extensionPath, 'locales', `${code}.json`]);
    const file = Gio.File.new_for_path(filePath);

    file.load_contents_async(null, (sourceObject, result) => {
      try {
        const [ok, contents] = sourceObject.load_contents_finish(result);
        if (ok) {
          _cache[code] = JSON.parse(new TextDecoder().decode(contents));
          resolve(_cache[code]);
          return;
        }
      } catch (e) {
        // fallback
      }

      if (code !== 'en') {
        preloadLocale(extensionPath, 'en').then(resolve);
      } else {
        resolve({});
      }
    });
  });
}

export function getLocale(extensionPath, langSetting) {
  const code = _resolveCode(langSetting);
  if (_cache[code]) return _cache[code];
  if (code !== 'en' && _cache['en']) return _cache['en'];
  return {};
}

export function clearCache() {
  _cache = {};
}
