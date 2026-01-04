import fs from "fs";

const cache = new Map();

export function loadLang(lang = "en") {
  if (cache.has(lang)) return cache.get(lang);

  const file = new URL(`../i18n/${lang}.json`, import.meta.url);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));

  cache.set(lang, data);
  return data;
}

export function t(lang, key, vars = {}) {
  const dict = loadLang(lang);
  let text = dict[key] ?? key;

  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }

  return text;
}
