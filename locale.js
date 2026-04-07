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

export function getLocale(extensionPath, langSetting) {
  const lang = (!langSetting || langSetting === 'auto')
    ? _getSystemLanguage()
    : langSetting;

  const code = SUPPORTED_LANGS.includes(lang) ? lang : 'en';

  if (_cache[code]) {
    return _cache[code];
  }

  const filePath = GLib.build_filenamev([extensionPath, 'locales', `${code}.json`]);
  try {
    const file = Gio.File.new_for_path(filePath);
    const [ok, contents] = file.load_contents(null);
    if (ok) {
      const json = new TextDecoder().decode(contents);
      _cache[code] = JSON.parse(json);
      return _cache[code];
    }
  } catch (e) {
    // fallback
  }

  // Fallback to English
  if (code !== 'en') {
    return getLocale(extensionPath, 'en');
  }

  return {};
}

export function clearCache() {
  _cache = {};
}
