// src/utils/TranslatorHelper.js

import { createLogger } from "./Logger.js";

const logger = createLogger("translator");

/**
 * Detectar idioma basado en el contexto del usuario/servidor
 * Prioridad: 
 * 1. Base de datos (si está disponible)
 * 2. Locale del usuario (interacciones)
 * 3. Locale del servidor
 * 4. Inglés por defecto
 */
export async function detectLanguage(context) {
  try {
    // Importar db
    const { db } = await import("../database/manager.js");
    
    // ✅ OPTIMIZADO: Verificar disponibilidad antes de intentar query
    if (db.available && context.guild?.id) {
      try {
        // Timeout de 500ms para evitar bloqueos
        const lang = await Promise.race([
          db.pg.getGuildLang(context.guild.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), 500)
          )
        ]);
        
        logger.debug(`Idioma desde DB: ${lang} (${context.guild.name})`);
        return lang;
      } catch (error) {
        // Timeout o error, usar detección automática
        logger.debug(`DB query falló, usando detección automática: ${error.message}`);
      }
    } else {
      logger.debug("DB no disponible, usando detección automática");
    }
  } catch (error) {
    logger.debug("Error importando DB, usando detección automática");
  }
  
  // Fallback: detección automática por locale
  return detectLanguageFromLocale(context);
}

/**
 * Detectar idioma desde el locale del usuario/servidor
 */
export function detectLanguageFromLocale(context) {
  // 1. Prioridad: Locale del usuario (más específico)
  if (context.locale) {
    const detected = mapLocaleToLanguage(context.locale);
    if (detected) {
      logger.debug(`Idioma detectado desde user locale: ${detected} (${context.locale})`);
      return detected;
    }
  }
  
  // 2. Fallback: Locale del servidor
  if (context.guild?.preferredLocale) {
    const detected = mapLocaleToLanguage(context.guild.preferredLocale);
    if (detected) {
      logger.debug(`Idioma detectado desde server locale: ${detected} (${context.guild.preferredLocale})`);
      return detected;
    }
  }
  
  // 3. Default: inglés
  logger.debug("Usando idioma por defecto: en");
  return "en";
}

/**
 * Mapear locale de Discord a código de idioma
 */
function mapLocaleToLanguage(locale) {
  const languageMap = {
    // Español
    "es-ES": "es",
    "es-419": "es",
    "es-MX": "es",
    "es-AR": "es",
    
    // Portugués
    "pt-BR": "pt",
    "pt-PT": "pt",
    
    // Francés
    "fr": "fr",
    "fr-FR": "fr",
    "fr-CA": "fr",
    
    // Alemán
    "de": "de",
    "de-DE": "de",
    "de-AT": "de",
    "de-CH": "de",
    
    // Italiano
    "it": "it",
    "it-IT": "it",
    
    // Japonés
    "ja": "ja",
    "ja-JP": "ja",
    
    // Coreano
    "ko": "ko",
    "ko-KR": "ko",
    
    // Chino
    "zh-CN": "zh",
    "zh-TW": "zh-TW",
    
    // Ruso
    "ru": "ru",
    "ru-RU": "ru",
    
    // Inglés (default)
    "en-US": "en",
    "en-GB": "en",
  };
  
  return languageMap[locale] || (locale.startsWith("es") ? "es" : null);
}

/**
 * Crear función de traducción para un comando
 * @param {Object} commandData - data del comando (buildCommand)
 * @param {Object} context - Contexto del comando
 * @returns {Function} Función de traducción
 */
export async function createTranslator(commandData, context) {
  const lang = await detectLanguage(context);
  
  return (key, vars = {}) => {
    // Buscar traducción en el idioma detectado, fallback a inglés
    let text = commandData.responses?.[lang]?.[key] || 
               commandData.responses?.en?.[key] || 
               key;
    
    // Interpolación de variables
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    
    return text;
  };
}

/**
 * Obtener idiomas disponibles para un comando
 */
export function getAvailableLanguages(commandData) {
  if (!commandData.responses) return ["en"];
  return Object.keys(commandData.responses);
}

/**
 * Verificar si un idioma está disponible para un comando
 */
export function isLanguageAvailable(commandData, lang) {
  return commandData.responses?.[lang] !== undefined;
}