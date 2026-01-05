// src/utils/Context.js

import EmbedFactory from "./EmbedFactory.js";
import { useLang } from "../localization/useLang.js";

/**
 * Context - Wrapper unificado para Interactions y Messages
 * Proporciona una API consistente sin importar el origen del comando
 */
export default class Context {
  constructor(source, args = null, commandName = null) {
    // ========================================
    // DETECCIÓN Y CONFIGURACIÓN INICIAL
    // ========================================
    this.isInteraction = source.constructor.name === "ChatInputCommandInteraction" || 
                         source.type === 2;
    
    this.source = source;
    this.args = args;
    this.commandNameOverride = commandName;
    
    // ========================================
    // PROPIEDADES UNIFICADAS
    // ========================================
    this.guild = source.guild;
    this.channel = source.channel;
    this.user = this.isInteraction ? source.user : source.author;
    this.member = source.member;
    this.client = source.client;
    this.createdTimestamp = source.createdTimestamp;
    this.locale = this.isInteraction 
      ? source.locale 
      : (source.guild?.preferredLocale || "en-US");
    
    // ========================================
    // ESTADO INTERNO
    // ========================================
    this._replied = false;
    this._deferred = false;
    this._deferredMessage = null;
    
    // ========================================
    // INYECCIÓN DE UTILIDADES
    // ========================================
    this.embeds = EmbedFactory;
  }
  
  // ========================================
  // GETTERS
  // ========================================
  
  get commandName() {
    if (this.commandNameOverride) return this.commandNameOverride;
    return this.isInteraction 
      ? this.source.commandName 
      : this.args?._commandName || "unknown";
  }
  
  get replied() {
    return this.isInteraction ? this.source.replied : this._replied;
  }
  
  get deferred() {
    return this.isInteraction ? this.source.deferred : this._deferred;
  }
  
  // ========================================
  // MÉTODOS DE RESPUESTA BÁSICOS
  // ========================================
  
  /**
   * Responder al comando
   * @param {string|Object} options - Contenido o opciones de respuesta
   * @returns {Promise<Message>}
   */
  async reply(options) {
    const content = typeof options === "string" ? { content: options } : options;
    
    if (this.isInteraction) {
      return await this._replyInteraction(content);
    } else {
      return await this._replyMessage(content);
    }
  }
  
  /**
   * Editar respuesta existente
   * @param {string|Object} options - Nuevo contenido
   * @returns {Promise<Message>}
   */
  async editReply(options) {
    const content = typeof options === "string" ? { content: options } : options;
    
    if (this.isInteraction) {
      return await this.source.editReply(content);
    } else {
      if (this._deferredMessage) {
        return await this._deferredMessage.edit(content);
      }
      return await this.reply(content);
    }
  }
  
  /**
   * Diferir respuesta (mostrar "pensando...")
   * @param {Object} options - Opciones de defer
   * @returns {Promise<void>}
   */
  async deferReply(options = {}) {
    if (this.deferred) return;
    
    if (this.isInteraction) {
      return await this._deferInteraction(options);
    } else {
      return await this._deferMessage(options);
    }
  }
  
  /**
   * Eliminar respuesta
   * @returns {Promise<void>}
   */
  async deleteReply() {
    if (this.isInteraction) {
      return await this.source.deleteReply();
    } else {
      if (this._deferredMessage) {
        return await this._deferredMessage.delete().catch(() => {});
      }
    }
  }
  
  /**
   * Enviar mensaje de seguimiento
   * @param {string|Object} options - Contenido del seguimiento
   * @returns {Promise<Message>}
   */
  async followUp(options) {
    const content = typeof options === "string" ? { content: options } : options;
    
    if (this.isInteraction) {
      return await this.source.followUp(content);
    } else {
      return await this._followUpMessage(content);
    }
  }
  
  // ========================================
  // MÉTODOS DE RESPUESTA CON EMBEDS (SHORTCUTS)
  // ========================================
  
  /**
   * Responder con embed de éxito
   * @param {string} title - Título del embed
   * @param {string} description - Descripción
   * @param {Array} fields - Campos adicionales
   * @returns {Promise<Message>}
   */
  async success(title, description, fields = []) {
    const embed = EmbedFactory.success(title, description, fields);
    return await this.reply({ embeds: [embed] });
  }
  
  /**
   * Responder con embed de error
   * @param {string} title - Título del error
   * @param {string} description - Descripción del error
   * @param {Array} fields - Campos adicionales
   * @returns {Promise<Message>}
   */
  async error(title, description, fields = []) {
    const embed = EmbedFactory.error(title, description, fields);
    return await this.reply({ embeds: [embed] });
  }
  
  /**
   * Responder con embed de advertencia
   * @param {string} title - Título de la advertencia
   * @param {string} description - Descripción
   * @param {Array} fields - Campos adicionales
   * @returns {Promise<Message>}
   */
  async warning(title, description, fields = []) {
    const embed = EmbedFactory.warning(title, description, fields);
    return await this.reply({ embeds: [embed] });
  }
  
  /**
   * Responder con embed de información
   * @param {string} title - Título informativo
   * @param {string} description - Descripción
   * @param {Array} fields - Campos adicionales
   * @returns {Promise<Message>}
   */
  async info(title, description, fields = []) {
    const embed = EmbedFactory.info(title, description, fields);
    return await this.reply({ embeds: [embed] });
  }
  
  // ========================================
  // UTILIDADES DE TRADUCCIÓN
  // ========================================
  
  /**
   * Obtener traducción directamente desde el contexto
   * @param {string} key - Clave de traducción
   * @param {Object} params - Parámetros de interpolación
   * @returns {Promise<string>}
   */
  async getTranslation(key, params = {}) {
    const t = await useLang(this);
    return t(key, params);
  }
  
  /**
   * Obtener función de traducción cacheada
   * @returns {Promise<Function>}
   */
  async getTranslator() {
    if (!this._translator) {
      this._translator = await useLang(this);
    }
    return this._translator;
  }
  
  // ========================================
  // SISTEMA DE OPCIONES UNIFICADO
  // ========================================
  
  get options() {
    return new ContextOptions(this);
  }
  
  // ========================================
  // MÉTODOS PRIVADOS (IMPLEMENTACIÓN)
  // ========================================
  
  /**
   * @private
   * Responder a una interaction
   */
  async _replyInteraction(content) {
    if (this.source.deferred || this.source.replied) {
      return await this.source.editReply(content);
    }
    return await this.source.reply(content);
  }
  
  /**
   * @private
   * Responder a un message
   */
  async _replyMessage(content) {
    this._replied = true;
    
    if (content.ephemeral) {
      try {
        await this.user.send(content);
        await this.source.react("📬").catch(() => {});
        return;
      } catch {
        return await this.source.reply({
          ...content,
          allowedMentions: { repliedUser: false }
        });
      }
    }
    
    return await this.source.reply({
      ...content,
      allowedMentions: { repliedUser: false }
    });
  }
  
  /**
   * @private
   * Diferir interaction
   */
  async _deferInteraction(options) {
    this._deferred = true;
    return await this.source.deferReply(options);
  }
  
  /**
   * @private
   * Diferir message
   */
  async _deferMessage(options) {
    this._deferred = true;
    
    if (!options.ephemeral) {
      this._deferredMessage = await this.channel.send("⏳ Procesando...");
    } else {
      await this.channel.sendTyping();
    }
  }
  
  /**
   * @private
   * Follow up en message
   */
  async _followUpMessage(content) {
    if (content.ephemeral) {
      try {
        return await this.user.send(content);
      } catch {
        return await this.channel.send(content);
      }
    }
    return await this.channel.send(content);
  }
}

// ========================================
// CLASE SEPARADA PARA OPTIONS
// ========================================

/**
 * Gestor de opciones/argumentos unificado
 */
class ContextOptions {
  constructor(context) {
    this.context = context;
  }
  
  /**
   * Obtener string
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {string|null}
   */
  getString(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getString(name, required);
    } else {
      const value = this.context.args?.[name];
      if (required && !value) {
        throw new Error(`Argumento requerido: ${name}`);
      }
      return value || null;
    }
  }
  
  /**
   * Obtener integer
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {number|null}
   */
  getInteger(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getInteger(name, required);
    } else {
      const value = this.context.args?.[name];
      if (!value) return null;
      
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        if (required) throw new Error(`${name} debe ser un número entero`);
        return null;
      }
      return parsed;
    }
  }
  
  /**
   * Obtener number
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {number|null}
   */
  getNumber(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getNumber(name, required);
    } else {
      const value = this.context.args?.[name];
      if (!value) return null;
      
      const parsed = parseFloat(value);
      if (isNaN(parsed)) {
        if (required) throw new Error(`${name} debe ser un número`);
        return null;
      }
      return parsed;
    }
  }
  
  /**
   * Obtener boolean
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {boolean|null}
   */
  getBoolean(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getBoolean(name, required);
    } else {
      const value = this.context.args?.[name];
      if (!value) return null;
      
      const truthy = ["true", "yes", "si", "sí", "1", "on"];
      return truthy.includes(String(value).toLowerCase());
    }
  }
  
  /**
   * Obtener user
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {User|null}
   */
  getUser(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getUser(name, required);
    } else {
      const value = this.context.args?.[name];
      if (!value) return null;
      
      const match = String(value).match(/^<@!?(\d+)>$/);
      const userId = match ? match[1] : value;
      
      return this.context.client.users.cache.get(userId) || null;
    }
  }
  
  /**
   * Obtener member
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {GuildMember|null}
   */
  getMember(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getMember(name, required);
    } else {
      const value = this.context.args?.[name];
      if (!value) return null;
      
      const match = String(value).match(/^<@!?(\d+)>$/);
      const userId = match ? match[1] : value;
      
      return this.context.guild?.members.cache.get(userId) || null;
    }
  }
  
  /**
   * Obtener channel
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {Channel|null}
   */
  getChannel(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getChannel(name, required);
    } else {
      const value = this.context.args?.[name];
      if (!value) return null;
      
      const match = String(value).match(/^<#(\d+)>$/);
      const channelId = match ? match[1] : value;
      
      return this.context.guild?.channels.cache.get(channelId) || null;
    }
  }
  
  /**
   * Obtener role
   * @param {string} name - Nombre de la opción
   * @param {boolean} required - Si es requerida
   * @returns {Role|null}
   */
  getRole(name, required = false) {
    if (this.context.isInteraction) {
      return this.context.source.options.getRole(name, required);
    } else {
      const value = this.context.args?.[name];
      if (!value) return null;
      
      const match = String(value).match(/^<@&(\d+)>$/);
      const roleId = match ? match[1] : value;
      
      return this.context.guild?.roles.cache.get(roleId) || null;
    }
  }
}