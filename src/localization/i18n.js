// src/localization/i18n.js
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cache = new Map();

/**
 * Carga recursivamente todos los archivos JSON de un directorio
 * Ahora soporta carpetas anidadas: mod/, utility/musica/, utility/Rule34/
 */
function loadDirectoryRecursive(dir, result = {}, pathParts = []) {
  if (!existsSync(dir)) return result;

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Si es carpeta, cargar recursivamente agregando el nombre a la ruta
      loadDirectoryRecursive(fullPath, result, [...pathParts, item]);
    } else if (item.endsWith('.json')) {
      // Si es archivo JSON, cargarlo
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf-8"));
        const filename = item.replace('.json', '');
        
        // Construir la clave completa basada en la ruta
        // Ejemplo: ["utility", "musica"] + "reproducir.json" = utility.musica.reproducir
        const keyPath = [...pathParts, filename];
        
        // Navegar/crear la estructura anidada
        let current = result;
        for (let i = 0; i < keyPath.length - 1; i++) {
          const part = keyPath[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        
        // Asignar los datos al último nivel
        const lastKey = keyPath[keyPath.length - 1];
        current[lastKey] = data;
        
        console.log(`📄 Cargado: ${keyPath.join('/')} (${Object.keys(data).length} claves)`);
        
      } catch (error) {
        console.warn(`⚠️ Error cargando ${fullPath}:`, error.message);
      }
    }
  }

  return result;
}

/**
 * Carga todas las traducciones de un idioma
 */
export function loadLang(lang = "en") {
  if (cache.has(lang)) return cache.get(lang);

  const langDir = join(__dirname, "..", "i18n", lang);
  
  if (!existsSync(langDir)) {
    console.error(`❌ Directorio de idioma no existe: ${langDir}`);
    return {};
  }

  const data = loadDirectoryRecursive(langDir);
  
  cache.set(lang, data);
  console.log(`✅ Traducciones cargadas para ${lang}:`, Object.keys(data));
  
  return data;
}

/**
 * Obtiene una traducción por clave con interpolación de variables
 * Ahora soporta rutas profundas: "utility.musica.reproducir.title"
 */
export function t(lang, key, vars = {}) {
  const dict = loadLang(lang);
  
  // Separar por puntos: "utility.musica.reproducir.title"
  const parts = key.split(".");
  let text = dict;

  for (const part of parts) {
    text = text?.[part];
    if (!text) break;
  }

  // Si no se encontró, devolver la clave
  if (!text || typeof text !== "string") {
    console.warn(`⚠️ Translation missing: ${key} (${lang})`);
    return key;
  }

  // Interpolar variables
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }

  return text;
}