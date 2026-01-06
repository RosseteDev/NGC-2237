// src/database/manager.js - VERSIÓN CORREGIDA

import pool from './pool.js';
import Database from 'better-sqlite3';
import { createLogger } from '../utils/Logger.js';
import 'dotenv/config';

const logger = createLogger("database");

// ============================================
// 1. CACHE MANAGER CON LRU
// ============================================
class CacheManager {
  constructor(ttl = 30 * 60 * 1000, maxSize = 1000) {
    this.cache = new Map();
    this.ttl = ttl;
    this.maxSize = maxSize;
    
    // Limpieza automática cada 5 minutos
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  set(key, value, customTTL = null) {
    // Implementar LRU: Si excede max, eliminar el más viejo
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + (customTTL || this.ttl),
      lastAccess: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    // Actualizar último acceso (LRU)
    item.lastAccess = Date.now();
    
    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cache cleanup: ${cleaned} items expirados`);
    }
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys())
    };
  }

  // ✅ NUEVO: Destructor para cleanup
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// ============================================
// 2. POSTGRESQL CON CACHE
// ============================================
class CachedPostgresDB {
  constructor() {
    this.pool = pool;
    
    this.caches = {
      guildSettings: new CacheManager(30 * 60 * 1000, 500),
      userSettings: new CacheManager(30 * 60 * 1000, 1000),
      economy: new CacheManager(10 * 60 * 1000, 2000),
      levels: new CacheManager(5 * 60 * 1000, 2000)
    };
    
    this.stats = {
      hits: 0,
      misses: 0
    };
  }

  async getGuildLang(guildId) {
    const cacheKey = `lang:${guildId}`;
    
    let lang = this.caches.guildSettings.get(cacheKey);
    
    if (lang !== null) {
      this.stats.hits++;
      return lang;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT lang FROM guild_settings WHERE guild_id = $1',
      [guildId]
    );
    
    lang = result.rows[0]?.lang || 'en';
    this.caches.guildSettings.set(cacheKey, lang);
    
    return lang;
  }

  async setGuildLang(guildId, lang) {
    await this.pool.query(
      `INSERT INTO guild_settings (guild_id, lang, updated_at) 
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET lang = $2, updated_at = NOW()`,
      [guildId, lang]
    );
    
    const cacheKey = `lang:${guildId}`;
    this.caches.guildSettings.set(cacheKey, lang);
    this.caches.guildSettings.delete(`settings:${guildId}`);
  }

  async getGuildPrefix(guildId) {
    const cacheKey = `prefix:${guildId}`;
    
    let prefix = this.caches.guildSettings.get(cacheKey);
    
    if (prefix !== null) {
      this.stats.hits++;
      return prefix;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT prefix FROM guild_settings WHERE guild_id = $1',
      [guildId]
    );
    
    prefix = result.rows[0]?.prefix || 'r!';
    this.caches.guildSettings.set(cacheKey, prefix);
    
    return prefix;
  }

  async setGuildPrefix(guildId, prefix) {
    await this.pool.query(
      `INSERT INTO guild_settings (guild_id, prefix, updated_at) 
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET prefix = $2, updated_at = NOW()`,
      [guildId, prefix]
    );
    
    const cacheKey = `prefix:${guildId}`;
    this.caches.guildSettings.set(cacheKey, prefix);
    this.caches.guildSettings.delete(`settings:${guildId}`);
  }

  async getGuildSettings(guildId) {
    const cacheKey = `settings:${guildId}`;
    
    let settings = this.caches.guildSettings.get(cacheKey);
    
    if (settings !== null) {
      this.stats.hits++;
      return settings;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT * FROM guild_settings WHERE guild_id = $1',
      [guildId]
    );
    
    settings = result.rows[0] || { 
      guild_id: guildId, 
      lang: 'en', 
      prefix: 'r!' 
    };
    
    this.caches.guildSettings.set(cacheKey, settings);
    return settings;
  }

  async updateGuildSettings(guildId, updates) {
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    
    await this.pool.query(
      `INSERT INTO guild_settings (guild_id, ${keys.join(', ')}, updated_at)
       VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
       ON CONFLICT (guild_id)
       DO UPDATE SET ${setClause}, updated_at = NOW()`,
      [guildId, ...values, ...values]
    );
    
    this.caches.guildSettings.delete(`settings:${guildId}`);
    keys.forEach(key => {
      this.caches.guildSettings.delete(`${key}:${guildId}`);
    });
  }

  async getUserSettings(userId) {
    const cacheKey = `user:${userId}`;
    
    let settings = this.caches.userSettings.get(cacheKey);
    
    if (settings !== null) {
      this.stats.hits++;
      return settings;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );
    
    settings = result.rows[0] || {
      user_id: userId,
      dm_notifications: true,
      level_up_messages: true,
      timezone: 'UTC'
    };
    
    this.caches.userSettings.set(cacheKey, settings);
    return settings;
  }

  async updateUserSettings(userId, updates) {
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    
    await this.pool.query(
      `INSERT INTO user_settings (user_id, ${keys.join(', ')})
       VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id)
       DO UPDATE SET ${setClause}`,
      [userId, ...values, ...values]
    );
    
    this.caches.userSettings.delete(`user:${userId}`);
  }

  async getBalance(userId) {
    const cacheKey = `balance:${userId}`;
    
    let balance = this.caches.economy.get(cacheKey);
    
    if (balance !== null) {
      this.stats.hits++;
      return balance;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT balance FROM economy WHERE user_id = $1',
      [userId]
    );
    
    balance = result.rows[0]?.balance || 0;
    this.caches.economy.set(cacheKey, balance);
    
    return balance;
  }

  async addMoney(userId, amount) {
    const result = await this.pool.query(
      `INSERT INTO economy (user_id, balance) 
       VALUES ($1, $2)
       ON CONFLICT (user_id) 
       DO UPDATE SET balance = economy.balance + $2
       RETURNING balance`,
      [userId, amount]
    );
    
    const newBalance = result.rows[0].balance;
    this.caches.economy.set(`balance:${userId}`, newBalance);
    
    return newBalance;
  }

  async removeMoney(userId, amount) {
    const result = await this.pool.query(
      `UPDATE economy 
       SET balance = balance - $1 
       WHERE user_id = $2 AND balance >= $1
       RETURNING balance`,
      [amount, userId]
    );
    
    if (result.rows.length === 0) {
      return { success: false, balance: await this.getBalance(userId) };
    }
    
    const newBalance = result.rows[0].balance;
    this.caches.economy.set(`balance:${userId}`, newBalance);
    
    return { success: true, balance: newBalance };
  }

  async getXP(userId) {
    const cacheKey = `xp:${userId}`;
    
    let data = this.caches.levels.get(cacheKey);
    
    if (data !== null) {
      this.stats.hits++;
      return data;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT xp, level FROM levels WHERE user_id = $1',
      [userId]
    );
    
    data = result.rows[0] || { xp: 0, level: 1 };
    this.caches.levels.set(cacheKey, data);
    
    return data;
  }

  async addXP(userId, amount) {
    const result = await this.pool.query(
      `INSERT INTO levels (user_id, xp, level) 
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id) 
       DO UPDATE SET xp = levels.xp + $2
       RETURNING xp, level`,
      [userId, amount]
    );
    
    const { xp, level } = result.rows[0];
    const newLevel = Math.floor(xp / 1000) + 1;
    
    if (newLevel > level) {
      await this.pool.query(
        'UPDATE levels SET level = $1 WHERE user_id = $2',
        [newLevel, userId]
      );
      
      const updatedData = { xp, level: newLevel };
      this.caches.levels.set(`xp:${userId}`, updatedData);
      
      return { levelUp: true, newLevel, xp };
    }
    
    this.caches.levels.set(`xp:${userId}`, { xp, level });
    return { levelUp: false, xp, level };
  }

  async addWarn(guildId, userId, reason, moderatorId) {
    await this.pool.query(
      `INSERT INTO warns (guild_id, user_id, reason, moderator_id, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [guildId, userId, reason, moderatorId]
    );
  }

  async getWarns(guildId, userId) {
    const result = await this.pool.query(
      'SELECT * FROM warns WHERE guild_id = $1 AND user_id = $2 ORDER BY timestamp DESC',
      [guildId, userId]
    );
    return result.rows;
  }

  invalidateUserCache(userId) {
    this.caches.userSettings.delete(`user:${userId}`);
    this.caches.economy.delete(`balance:${userId}`);
    this.caches.levels.delete(`xp:${userId}`);
  }

  invalidateGuildCache(guildId) {
    this.caches.guildSettings.delete(`settings:${guildId}`);
    this.caches.guildSettings.delete(`lang:${guildId}`);
    this.caches.guildSettings.delete(`prefix:${guildId}`);
  }

  getCacheStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      total,
      hitRate: `${hitRate}%`,
      caches: {
        guildSettings: this.caches.guildSettings.stats(),
        userSettings: this.caches.userSettings.stats(),
        economy: this.caches.economy.stats(),
        levels: this.caches.levels.stats()
      }
    };
  }

  // ✅ NUEVO: Destructor
  destroy() {
    Object.values(this.caches).forEach(cache => cache.destroy());
  }
}

// ============================================
// 3. ANALYTICS (SQLite)
// ============================================
class AnalyticsCache {
  constructor() {
    this.db = new Database('analytics.db');
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        content_length INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        command_name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        success INTEGER NOT NULL
      )
    `);

    this.stmts = {
      logMessage: this.db.prepare(`
        INSERT INTO message_logs (user_id, guild_id, channel_id, timestamp, content_length)
        VALUES (?, ?, ?, ?, ?)
      `),
      
      logCommand: this.db.prepare(`
        INSERT INTO command_usage (user_id, guild_id, command_name, timestamp, success)
        VALUES (?, ?, ?, ?, ?)
      `),
      
      getAllMessages: this.db.prepare('SELECT * FROM message_logs'),
      getAllCommands: this.db.prepare('SELECT * FROM command_usage'),
      
      clearMessages: this.db.prepare('DELETE FROM message_logs'),
      clearCommands: this.db.prepare('DELETE FROM command_usage')
    };
  }

  logMessage(message) {
    try {
      this.stmts.logMessage.run(
        message.author.id,
        message.guild?.id || 'DM',
        message.channel.id,
        Date.now(),
        message.content.length
      );
    } catch (error) {
      logger.error('Error logging message', error);
    }
  }

  logCommand(interaction, success = true) {
    try {
      this.stmts.logCommand.run(
        interaction.user.id,
        interaction.guild?.id || 'DM',
        interaction.commandName,
        Date.now(),
        success ? 1 : 0
      );
    } catch (error) {
      logger.error('Error logging command', error);
    }
  }

  async flushToPostgres(pgDB) {
    const startTime = Date.now();
    let totalFlushed = 0;

    try {
      const messages = this.stmts.getAllMessages.all();
      if (messages.length > 0) {
        const values = messages.map(m => 
          `('${m.user_id}', '${m.guild_id}', '${m.channel_id}', to_timestamp(${m.timestamp}/1000), ${m.content_length})`
        ).join(',');
        
        await pgDB.pool.query(`
          INSERT INTO message_logs (user_id, guild_id, channel_id, timestamp, content_length)
          VALUES ${values}
        `);
        
        this.stmts.clearMessages.run();
        totalFlushed += messages.length;
      }

      const commands = this.stmts.getAllCommands.all();
      if (commands.length > 0) {
        const values = commands.map(c =>
          `('${c.user_id}', '${c.guild_id}', '${c.command_name}', to_timestamp(${c.timestamp}/1000), ${c.success === 1})`
        ).join(',');
        
        await pgDB.pool.query(`
          INSERT INTO command_usage (user_id, guild_id, command_name, timestamp, success)
          VALUES ${values}
        `);
        
        this.stmts.clearCommands.run();
        totalFlushed += commands.length;
      }

      const elapsed = Date.now() - startTime;
      if (totalFlushed > 0) {
        logger.info(`Analytics flushed: ${totalFlushed} registros en ${elapsed}ms`);
      }
      
      return { success: true, count: totalFlushed, elapsed };
    } catch (error) {
      logger.error('Error flushing analytics', error);
      return { success: false, error };
    }
  }

  getLocalStats() {
    const messages = this.stmts.getAllMessages.all().length;
    const commands = this.stmts.getAllCommands.all().length;
    
    return { messages, commands, total: messages + commands };
  }

  close() {
    this.db.close();
  }
}

// ============================================
// 4. DATABASE MANAGER
// ============================================
class DatabaseManager {
  constructor() {
    this.pg = new CachedPostgresDB();
    this.analytics = new AnalyticsCache();
    this.flushInterval = null;
    
    // ✅ NUEVO: Flag de disponibilidad (público)
    this.available = false;
    
    // ✅ NUEVO: Variable de entorno para forzar modo sin-DB
    this.forceOffline = process.env.DB_DISABLED === "true";
  }

  async init() {
    logger.info("Inicializando sistema de base de datos...");

    // ✅ Si está forzado offline, no intentar conectar
    if (this.forceOffline) {
      logger.warn("⚠️ Base de datos deshabilitada por configuración (DB_DISABLED=true)");
      this.available = false;
      logger.info("✅ Sistema de base de datos listo (modo offline)");
      return;
    }

    try {
      logger.time("Conexión a PostgreSQL");
      
      // ✅ Timeout de 3 segundos
      await Promise.race([
        pool.query("SELECT 1"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Connection timeout")), 3000)
        )
      ]);
      
      logger.timeEnd("Conexión a PostgreSQL");

      this.available = true;
      logger.info("✅ PostgreSQL conectado");
      
      // Solo iniciar flush interval si está disponible
      this.flushInterval = setInterval(
        () => this.analytics.flushToPostgres(this.pg),
        60 * 60 * 1000
      );
      
    } catch (error) {
      this.available = false;
      
      if (error.message.includes("timeout") || 
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("ECONNREFUSED")) {
        logger.warn("⚠️ No se pudo conectar a PostgreSQL, continuando sin base de datos");
      } else {
        logger.warn("⚠️ PostgreSQL no disponible, modo cache-only");
        logger.debug(`Error: ${error.message}`);
      }
    }

    logger.info(`✅ Sistema de base de datos listo (disponible: ${this.available})`);
  }

  async shutdown() {
    logger.info("Cerrando bases de datos...");
    
    if (this.available) {
      await this.analytics.flushToPostgres(this.pg);
    }
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    this.analytics.close();
    
    if (this.available) {
      await pool.end();
    }
    
    logger.info("✅ Cerrado correctamente");
  }
  
  // ... resto del código
}

// ============================================
// 5. EXPORT
// ============================================
export const db = new DatabaseManager();
export { CacheManager, CachedPostgresDB, AnalyticsCache };

// ✅ CORRECCIÓN: Línea 432 eliminada (estaba fuera de clase)