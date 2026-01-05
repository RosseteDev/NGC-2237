// src/utils/ConfigLoader.js

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Sistema de carga de configuraciones con cache inteligente
 */
class ConfigLoader {
  constructor() {
    // Cache por archivo completo (music.json, nsfw.json, etc)
    this.fileCache = new Map();
    
    // Cache por comando específico
    this.commandCache = new Map();
    
    // Cache de mensajes comunes
    this.commonCache = new Map();
    
    // Timestamp de última carga (para hot-reload)
    this.lastLoad = new Map();
    
    // Configuración
    this.config = {
      i18nPath: join(__dirname, "..", "i18n"),
      cacheTTL: 30 * 60 * 1000, // 30 minutos
      enableHotReload: process.env.NODE_ENV === "development"
    };
    
    console.log("📦 ConfigLoader inicializado");
  }
  
  /**
   * Cargar archivo de categoría completo
   */
  loadCategoryFile(category, lang = "en") {
    const cacheKey = `${lang}:${category}`;
    
    // Verificar cache
    if (this.shouldUseCache(cacheKey)) {
      return this.fileCache.get(cacheKey);
    }
    
    try {
      const filePath = join(
        this.config.i18nPath,
        lang,
        "commands",
        `${category}.json`
      );
      
      if (!existsSync(filePath)) {
        console.warn(`⚠️ Archivo no encontrado: ${filePath}`);
        return null;
      }
      
      const data = JSON.parse(readFileSync(filePath, "utf-8"));
      
      // Guardar en cache
      this.fileCache.set(cacheKey, data);
      this.lastLoad.set(cacheKey, Date.now());
      
      console.log(`✅ Cargado: ${lang}/commands/${category}.json`);
      return data;
      
    } catch (error) {
      console.error(`❌ Error cargando ${category}.json:`, error.message);
      return null;
    }
  }
  
  /**
   * Cargar configuración de un comando específico
   */
  loadCommand(category, commandName, lang = "en") {
    const cacheKey = `${lang}:${category}:${commandName}`;
    
    // Verificar cache de comando
    if (this.commandCache.has(cacheKey)) {
      return this.commandCache.get(cacheKey);
    }
    
    // Cargar archivo de categoría
    const categoryData = this.loadCategoryFile(category, lang);
    if (!categoryData) return null;
    
    // Extraer comando específico
    const commandData = categoryData[commandName];
    if (!commandData) {
      console.warn(`⚠️ Comando "${commandName}" no encontrado en ${category}.json`);
      return null;
    }
    
    // Cachear comando individual
    this.commandCache.set(cacheKey, commandData);
    
    return commandData;
  }
  
  /**
   * Cargar mensajes comunes (errors, success, etc)
   */
  loadCommon(lang = "en") {
    const cacheKey = `common:${lang}`;
    
    if (this.commonCache.has(cacheKey)) {
      return this.commonCache.get(cacheKey);
    }
    
    try {
      const filePath = join(this.config.i18nPath, lang, "common.json");
      const data = JSON.parse(readFileSync(filePath, "utf-8"));
      
      this.commonCache.set(cacheKey, data);
      return data;
      
    } catch (error) {
      console.error(`❌ Error cargando common.json:`, error.message);
      return {};
    }
  }
  
  /**
   * Obtener todas las categorías disponibles
   */
  getAvailableCategories(lang = "en") {
    try {
      const commandsPath = join(this.config.i18nPath, lang, "commands");
      
      if (!existsSync(commandsPath)) {
        return [];
      }
      
      return readdirSync(commandsPath)
        .filter(file => file.endsWith(".json"))
        .map(file => file.replace(".json", ""));
        
    } catch (error) {
      console.error("❌ Error obteniendo categorías:", error);
      return [];
    }
  }
  
  /**
   * Obtener todos los comandos de una categoría
   */
  getCategoryCommands(category, lang = "en") {
    const data = this.loadCategoryFile(category, lang);
    if (!data) return [];
    
    // Filtrar entradas que no son comandos (como _category)
    return Object.keys(data).filter(key => !key.startsWith("_"));
  }
  
  /**
   * Verificar si debe usar cache
   */
  shouldUseCache(cacheKey) {
    if (!this.fileCache.has(cacheKey)) return false;
    
    if (!this.config.enableHotReload) return true;
    
    const lastLoadTime = this.lastLoad.get(cacheKey);
    const elapsed = Date.now() - lastLoadTime;
    
    return elapsed < this.config.cacheTTL;
  }
  
  /**
   * Limpiar cache (útil para hot-reload)
   */
  clearCache(specific = null) {
    if (specific) {
      this.fileCache.delete(specific);
      this.commandCache.delete(specific);
      this.lastLoad.delete(specific);
      console.log(`🧹 Cache limpiado: ${specific}`);
    } else {
      this.fileCache.clear();
      this.commandCache.clear();
      this.commonCache.clear();
      this.lastLoad.clear();
      console.log("🧹 Cache completo limpiado");
    }
  }
  
  /**
   * Obtener estadísticas del cache
   */
  getCacheStats() {
    return {
      files: this.fileCache.size,
      commands: this.commandCache.size,
      common: this.commonCache.size,
      total: this.fileCache.size + this.commandCache.size + this.commonCache.size
    };
  }
  
  /**
   * Pre-cargar todas las categorías (al inicio del bot)
   */
  async preloadAll(langs = ["en", "es"]) {
    console.log("🚀 Pre-cargando configuraciones...");
    
    for (const lang of langs) {
      const categories = this.getAvailableCategories(lang);
      
      for (const category of categories) {
        this.loadCategoryFile(category, lang);
      }
      
      this.loadCommon(lang);
    }
    
    const stats = this.getCacheStats();
    console.log(`✅ Pre-carga completa: ${stats.total} archivos en cache`);
  }
}

// Singleton
export const configLoader = new ConfigLoader();