// src/utils/Logger.js

class Logger {
  constructor(module = null) {
    this.module = module;
    
    // Configuración global (compartida entre todas las instancias)
    if (!Logger.config) {
      Logger.config = {
        debugEnabled: process.env.DEBUG === "true",
        debugModules: process.env.DEBUG_MODULES?.split(",").map(m => m.trim()) || ["*"],
        logLevel: process.env.LOG_LEVEL || "info",
        showTimestamp: process.env.LOG_TIMESTAMP !== "false",
        colorize: process.env.LOG_COLOR !== "false"
      };
      
      Logger.levels = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
      };
      
      Logger.currentLevel = Logger.levels[Logger.config.logLevel] || 2;
      
      // Colores ANSI
      Logger.colors = {
        reset: "\x1b[0m",
        red: "\x1b[31m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        cyan: "\x1b[36m",
        green: "\x1b[32m",
        gray: "\x1b[90m",
        magenta: "\x1b[35m"
      };
      
      // Log inicial de configuración
      if (Logger.config.debugEnabled) {
        console.log(
          `${Logger.colors.cyan}[Logger]${Logger.colors.reset} ` +
          `Debug habilitado - Módulos: ${Logger.config.debugModules.join(", ")}`
        );
      }
    }
  }
  
  /**
   * Verificar si un módulo debe mostrar debug
   */
  shouldDebug() {
    if (!Logger.config.debugEnabled) return false;
    if (!this.module) return true;
    
    // Soporte para wildcards: "music:*" coincide con "music:play", "music:skip", etc.
    return Logger.config.debugModules.some(pattern => {
      if (pattern === "*") return true;
      if (pattern.endsWith(":*")) {
        const prefix = pattern.slice(0, -2);
        return this.module.startsWith(prefix);
      }
      return pattern === this.module;
    });
  }
  
  /**
   * Verificar si se debe mostrar un nivel de log
   */
  shouldLog(level) {
    return Logger.levels[level] <= Logger.currentLevel;
  }
  
  /**
   * Formatear mensaje con timestamp y metadata
   */
  format(level, message) {
    const parts = [];
    
    // Timestamp
    if (Logger.config.showTimestamp) {
      const timestamp = new Date().toISOString();
      parts.push(this.colorize(timestamp, "gray"));
    }
    
    // Nivel
    const levelUpper = level.toUpperCase().padEnd(5);
    const levelColor = {
      error: "red",
      warn: "yellow",
      info: "blue",
      debug: "cyan"
    }[level];
    parts.push(this.colorize(levelUpper, levelColor));
    
    // Módulo
    if (this.module) {
      parts.push(this.colorize(`[${this.module}]`, "green"));
    }
    
    // Mensaje
    parts.push(message);
    
    return parts.join(" ");
  }
  
  /**
   * Aplicar color ANSI
   */
  colorize(text, color) {
    if (!Logger.config.colorize) return text;
    return `${Logger.colors[color]}${text}${Logger.colors.reset}`;
  }
  
  // ========================================
  // MÉTODOS PÚBLICOS DE LOGGING
  // ========================================
  
  /**
   * Log de debug (solo si DEBUG=true y módulo habilitado)
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  debug(message, ...args) {
    if (!this.shouldDebug()) return;
    console.log(this.format("debug", message), ...args);
  }
  
  /**
   * Log de información
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  info(message, ...args) {
    if (!this.shouldLog("info")) return;
    console.log(this.format("info", message), ...args);
  }
  
  /**
   * Log de advertencia
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  warn(message, ...args) {
    if (!this.shouldLog("warn")) return;
    console.warn(this.format("warn", message), ...args);
  }
  
  /**
   * Log de error
   * @param {string} message - Mensaje descriptivo
   * @param {Error} error - Objeto de error (opcional)
   */
  error(message, error = null) {
    if (!this.shouldLog("error")) return;
    
    console.error(this.format("error", message));
    if (error?.stack) {
      console.error(this.colorize(error.stack, "red"));
    } else if (error) {
      console.error(this.colorize(String(error), "red"));
    }
  }
  
  /**
   * Log de ejecución de comandos (formato especial)
   * @param {Object} user - Usuario de Discord
   * @param {string} commandName - Nombre del comando
   * @param {boolean} success - Si tuvo éxito
   */
  command(user, commandName, success = true) {
    if (!this.shouldLog("info")) return;
    
    const icon = success ? "✅" : "❌";
    const userName = user.tag || user.username || "Unknown";
    const message = `${icon} ${userName} ejecutó /${commandName}`;
    
    // Usar módulo "command" temporalmente
    const originalModule = this.module;
    this.module = "command";
    console.log(this.format("info", message));
    this.module = originalModule;
  }
  
  // ========================================
  // HERRAMIENTAS DE DEBUGGING AVANZADO
  // ========================================
  
  /**
   * Grupo de logs (colapsar logs relacionados)
   * @param {string} label - Etiqueta del grupo
   * @param {Function} callback - Función que contiene los logs
   */
  group(label, callback) {
    if (!this.shouldDebug()) {
      // Si debug está off, ejecutar callback sin mostrar nada
      callback();
      return;
    }
    
    console.group(this.colorize(`🔍 ${label}`, "cyan"));
    callback();
    console.groupEnd();
  }
  
  /**
   * Tabla (útil para mostrar arrays/objetos)
   * @param {Object|Array} data - Datos a mostrar en tabla
   */
  table(data) {
    if (!this.shouldDebug()) return;
    console.table(data);
  }
  
  /**
   * Iniciar timer para medir performance
   * @param {string} label - Etiqueta del timer
   */
  time(label) {
    if (!this.shouldDebug()) return;
    
    const timerLabel = this.module 
      ? `[${this.module}] ${label}`
      : label;
    
    console.time(this.colorize(`⏱️  ${timerLabel}`, "magenta"));
  }
  
  /**
   * Finalizar timer
   * @param {string} label - Etiqueta del timer (debe coincidir con time())
   */
  timeEnd(label) {
    if (!this.shouldDebug()) return;
    
    const timerLabel = this.module 
      ? `[${this.module}] ${label}`
      : label;
    
    console.timeEnd(this.colorize(`⏱️  ${timerLabel}`, "magenta"));
  }
  
  /**
   * Trace (mostrar stack trace)
   * @param {string} message - Mensaje descriptivo
   */
  trace(message) {
    if (!this.shouldDebug()) return;
    console.trace(this.format("debug", message));
  }
  
  // ========================================
  // MÉTODOS ESTÁTICOS DE CONFIGURACIÓN
  // ========================================
  
  /**
   * Habilitar debug en runtime
   * @param {string|Array} modules - Módulos a habilitar (* para todos)
   */
  static enableDebug(modules = "*") {
    Logger.config.debugEnabled = true;
    Logger.config.debugModules = Array.isArray(modules) 
      ? modules 
      : modules.split(",").map(m => m.trim());
    
    console.log(
      `${Logger.colors.green}[Logger]${Logger.colors.reset} ` +
      `Debug habilitado - Módulos: ${Logger.config.debugModules.join(", ")}`
    );
  }
  
  /**
   * Deshabilitar debug en runtime
   */
  static disableDebug() {
    Logger.config.debugEnabled = false;
    console.log(
      `${Logger.colors.yellow}[Logger]${Logger.colors.reset} Debug deshabilitado`
    );
  }
  
  /**
   * Cambiar nivel de log en runtime
   * @param {string} level - Nuevo nivel (error, warn, info, debug)
   */
  static setLevel(level) {
    if (!Logger.levels[level]) {
      console.error(`Nivel inválido: ${level}`);
      return;
    }
    
    Logger.config.logLevel = level;
    Logger.currentLevel = Logger.levels[level];
    
    console.log(
      `${Logger.colors.cyan}[Logger]${Logger.colors.reset} ` +
      `Nivel cambiado a: ${level}`
    );
  }
  
  /**
   * Obtener estado actual del logger
   * @returns {Object} Estado de configuración
   */
  static getStatus() {
    return {
      debugEnabled: Logger.config.debugEnabled,
      debugModules: Logger.config.debugModules,
      logLevel: Logger.config.logLevel,
      showTimestamp: Logger.config.showTimestamp,
      colorize: Logger.config.colorize
    };
  }
}

// ========================================
// EXPORTS
// ========================================

/**
 * Logger global (para uso rápido sin contexto)
 */
export const logger = new Logger();

/**
 * Factory para crear loggers contextuales
 */
export function createLogger(module) {
  return new Logger(module);
}

/**
 * Exportar la clase Logger para acceder a métodos estáticos
 */
export { Logger };

/**
 * Export default para compatibilidad
 */
export default logger;