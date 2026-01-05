// localization/useLang.js - OPTIMIZADO PARA PRODUCCIÓN

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache de traducciones por idioma
const translations = {};

// Cache de rutas de búsqueda para evitar re-calcular
const searchCache = new Map();

/**
 * Carga recursivamente con estructura jerárquica
 * Mantiene organización por carpetas para mejor gestión de memoria
 */
function loadDirectoryRecursive(dir, lang, pathParts = []) {
  if (!existsSync(dir)) return;

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      loadDirectoryRecursive(fullPath, lang, [...pathParts, item]);
    } else if (item.endsWith('.json')) {
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf-8"));
        const filename = item.replace('.json', '');
        
        // Detectar si usar solo carpeta o agregar nombre de archivo
        const shouldUseFolder = pathParts.length > 0 && pathParts[pathParts.length - 1] === filename;
        
        let current = translations[lang];
        for (const part of pathParts) {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
        
        if (shouldUseFolder) {
          Object.assign(current, data);
        } else {
          if (!current[filename]) current[filename] = {};
          Object.assign(current[filename], data);
        }
        
      } catch (error) {
        console.warn(`⚠️ Error cargando ${fullPath}:`, error.message);
      }
    }
  }
}

/**
 * Busca una traducción con fallback inteligente
 * 1. Busca con estructura completa (utility.music.embed.title)
 * 2. Si falla, busca sin prefijo (music.embed.title)
 * 3. Cache de rutas exitosas para próximas búsquedas
 */
function findTranslation(obj, key, lang) {
  // Verificar cache primero
  const cacheKey = `${lang}:${key}`;
  if (searchCache.has(cacheKey)) {
    const cachedPath = searchCache.get(cacheKey);
    let value = obj;
    for (const part of cachedPath) {
      value = value?.[part];
      if (!value) break;
    }
    if (value) return value;
    // Cache invalidado, eliminar
    searchCache.delete(cacheKey);
  }

  const parts = key.split(".");
  
  // Estrategia 1: Búsqueda directa con path completo
  let value = obj;
  for (const part of parts) {
    value = value?.[part];
    if (!value) break;
  }
  
  if (value && typeof value === 'string') {
    searchCache.set(cacheKey, parts);
    return value;
  }

  // Estrategia 2: Búsqueda recursiva en todas las ramas
  // Útil cuando la clave no incluye el prefijo correcto
  const found = deepSearch(obj, parts);
  
  if (found) {
    searchCache.set(cacheKey, found.path);
    return found.value;
  }

  return null;
}

/**
 * Búsqueda profunda recursiva en el árbol de traducciones
 * Solo se ejecuta en cache miss para mantener performance
 */
function deepSearch(obj, targetParts, currentPath = []) {
  // Si llegamos al final del path, verificar si es string
  if (targetParts.length === 0) {
    return typeof obj === 'string' ? { value: obj, path: currentPath } : null;
  }

  const [first, ...rest] = targetParts;

  // Intentar búsqueda directa
  if (obj[first]) {
    const result = deepSearch(obj[first], rest, [...currentPath, first]);
    if (result) return result;
  }

  // Búsqueda recursiva en sub-objetos
  for (const key in obj) {
    if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      const result = deepSearch(obj[key], targetParts, [...currentPath, key]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Cargar traducciones por idioma con lazy loading
 */
function loadTranslations(lang) {
  if (!translations[lang]) {
    translations[lang] = {};
    
    const langDir = join(__dirname, "..", "i18n", lang);
    
    if (!existsSync(langDir)) {
      console.error(`❌ Directorio no existe: ${langDir}`);
      return translations[lang];
    }

    console.log(`🌍 Cargando traducciones: ${lang}`);
    loadDirectoryRecursive(langDir, lang);
    console.log(`✅ ${lang} cargado (${Object.keys(translations[lang]).length} módulos)`);
  }
  
  return translations[lang];
}

/**
 * Hook principal optimizado
 */
export async function useLang(interaction) {
  const lang = interaction.locale?.startsWith("es") ? "es" : "en";
  const t = loadTranslations(lang);

  return (key, params = {}) => {
    const value = findTranslation(t, key, lang);

    if (!value || typeof value !== 'string') {
      console.warn(`⚠️ Translation missing: ${key} (${lang})`);
      return key;
    }

    // Interpolación optimizada
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      value
    );
  };
}

/**
 * Función de traducción directa (para commandBuilder)
 */
export function getTranslation(lang, key) {
  const t = loadTranslations(lang);
  return findTranslation(t, key, lang) || key;
}

/**
 * Limpiar cache (útil en hot-reload development)
 */
export function clearCache() {
  searchCache.clear();
  for (const lang in translations) {
    delete translations[lang];
  }
  console.log("🧹 Cache de traducciones limpiado");
}