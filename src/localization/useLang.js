// localization/useLang.js

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const translations = {};

/**
 * Carga recursivamente todos los archivos JSON de un directorio
 */
function loadDirectoryRecursive(dir, lang, basePath = '') {
  if (!existsSync(dir)) return;

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Si es carpeta, cargar recursivamente
      loadDirectoryRecursive(fullPath, lang, item);
    } else if (item.endsWith('.json')) {
      // Si es archivo JSON, cargarlo
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf-8"));
        const category = item.replace('.json', '');
        
        // Si está en subcarpeta (ej: music/), usar el nombre de la carpeta
        const key = basePath || category;
        
        // Merge con datos existentes
        if (!translations[lang][key]) {
          translations[lang][key] = {};
        }
        
        // Merge profundo
        Object.assign(translations[lang][key], data);
        
        console.log(`📁 Cargado: ${lang}/${basePath ? basePath + '/' : ''}${item}`);
      } catch (error) {
        console.warn(`⚠️ Error cargando ${fullPath}:`, error.message);
      }
    }
  }
}

/**
 * Cargar traducciones por idioma
 */
function loadTranslations(lang) {
  if (!translations[lang]) {
    translations[lang] = {};
    
    const langDir = join(__dirname, "..", "i18n", lang);
    
    console.log(`🌍 Cargando traducciones para: ${lang}`);
    console.log(`📂 Directorio: ${langDir}`);
    
    if (!existsSync(langDir)) {
      console.error(`❌ Directorio no existe: ${langDir}`);
      return translations[lang];
    }

    // ✅ Cargar TODO recursivamente
    loadDirectoryRecursive(langDir, lang);
    
    console.log(`✅ Traducciones cargadas para ${lang}:`, Object.keys(translations[lang]));
  }
  
  return translations[lang];
}

/**
 * ✅ Función para obtener traducción específica (usada por commandBuilder)
 */
export function getTranslation(lang, key) {
  const t = loadTranslations(lang);
  
  const parts = key.split(".");
  let value = t;

  for (const part of parts) {
    value = value?.[part];
    if (!value) break;
  }

  return value || key;
}

/**
 * ✅ Hook principal para obtener función de traducción
 */
export async function useLang(interaction) {
  const lang = interaction.locale?.startsWith("es") ? "es" : "en";
  const t = loadTranslations(lang);

  return (key, params = {}) => {
    // Separar categoría y clave: "music.errors.voice_required"
    const parts = key.split(".");
    let value = t;

    for (const part of parts) {
      value = value?.[part];
      if (!value) break;
    }

    if (!value) {
      console.warn(`⚠️ Translation missing: ${key} (${lang})`);
      return key;
    }

    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
      value
    );
  };
}