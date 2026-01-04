// localization/useLang.js

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const translations = {};

// Cargar traducciones por categoría
function loadTranslations(lang) {
  if (!translations[lang]) {
    translations[lang] = {};
    
    const langDir = join(__dirname, "..", "i18n", lang);
    
    // ✅ 1. Cargar archivos raíz (common, settings, etc.)
    const rootCategories = ['common', 'settings'];
    
    for (const category of rootCategories) {
      try {
        const filePath = join(langDir, `${category}.json`);
        if (existsSync(filePath)) {
          const data = JSON.parse(readFileSync(filePath, "utf-8"));
          translations[lang][category] = data;
        }
      } catch (error) {
        console.warn(`⚠️ No se pudo cargar ${category}.json para ${lang}`);
      }
    }
    
    // ✅ 2. Cargar archivos en /commands/ (music, moderation, etc.)
    const commandsDir = join(langDir, "commands");
    
    if (existsSync(commandsDir)) {
      try {
        const commandFiles = readdirSync(commandsDir).filter(f => f.endsWith('.json'));
        
        for (const file of commandFiles) {
          const category = file.replace('.json', '');
          const filePath = join(commandsDir, file);
          const data = JSON.parse(readFileSync(filePath, "utf-8"));
          translations[lang][category] = data;
        }
      } catch (error) {
        console.warn(`⚠️ Error cargando commands/ para ${lang}:`, error);
      }
    }
  }
  
  return translations[lang];
}

/**
 * ✅ NUEVA: Función para obtener traducción específica (usada por commandBuilder)
 * @param {string} lang - Código de idioma ("en", "es", "pt")
 * @param {string} key - Clave con notación de punto (ej: "music.commands.play.name")
 * @returns {string} - Traducción o la clave si no existe
 */
export function getTranslation(lang, key) {
  const t = loadTranslations(lang);
  
  // Separar categoría y clave: "music.commands.play.name"
  const parts = key.split(".");
  let value = t;

  for (const part of parts) {
    value = value?.[part];
    if (!value) break;
  }

  // Si no existe, retornar la clave original
  return value || key;
}

/**
 * ✅ Hook principal para obtener función de traducción (SIN CAMBIOS)
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
      (str, [k, v]) => str.replace(`{${k}}`, v),
      value
    );
  };
}