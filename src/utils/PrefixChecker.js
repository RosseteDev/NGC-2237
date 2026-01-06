// src/utils/PrefixChecker.js

/**
 * Verificador ultrarrápido de prefixes sin DB
 * Usa regex simple para detectar patrones comunes
 */
export class PrefixChecker {
  constructor(defaultPrefix = "r!") {
    this.defaultPrefix = defaultPrefix;
    
    // Regex optimizada: detecta prefijos comunes al inicio del mensaje
    // Ejemplos: r!, !, ?, ., >, <, ~, $, %, &, #, +, -, =, etc.
    this.quickPrefixRegex = /^[!?.>,<~$%&#+=\-*/\\|]{1,3}/;
    
    // Menciones del bot
    this.mentionRegex = null;
  }
  
  /**
   * Inicializar con el ID del bot (para detectar menciones)
   */
  setBotId(botId) {
    this.mentionRegex = new RegExp(`^<@!?${botId}>`);
  }
  
  /**
   * Verificación rápida: ¿Este mensaje podría ser un comando?
   * Retorna false inmediatamente si no tiene ningún prefix conocido
   */
  couldBeCommand(content) {
    if (!content || content.length === 0) return false;
    
    // 1. ¿Empieza con el prefix por defecto?
    if (content.startsWith(this.defaultPrefix)) return true;
    
    // 2. ¿Empieza con algún prefix común?
    if (this.quickPrefixRegex.test(content)) return true;
    
    // 3. ¿Es una mención al bot?
    if (this.mentionRegex && this.mentionRegex.test(content)) return true;
    
    // 4. Si no coincide con nada, definitivamente no es comando
    return false;
  }
  
  /**
   * Extraer prefix usado en el mensaje
   */
  extractPrefix(content, botId) {
    // Mención al bot
    const mentionMatch = content.match(new RegExp(`^<@!?${botId}>`));
    if (mentionMatch) {
      return mentionMatch[0];
    }
    
    // Default prefix
    if (content.startsWith(this.defaultPrefix)) {
      return this.defaultPrefix;
    }
    
    // Otros prefixes comunes
    const match = content.match(this.quickPrefixRegex);
    if (match) {
      return match[0];
    }
    
    return null;
  }
}

// Singleton
export const prefixChecker = new PrefixChecker(
  process.env.DEFAULT_PREFIX || "r!"
);