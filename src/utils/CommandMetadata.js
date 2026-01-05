// src/utils/CommandMetadata.js

/**
 * Definir en qué contextos puede ejecutarse un comando
 */
export const CommandContext = {
  // Canales de texto
  TEXT: "text",                    // Cualquier canal de texto
  ANNOUNCEMENT: "announcement",     // Solo canales de anuncios
  FORUM: "forum",                  // Solo foros
  
  // Canales de voz/audio
  VOICE: "voice",                  // Canales de voz
  VOICE_TEXT: "voice_text",        // Chat de texto en canal de voz
  STAGE: "stage",                  // Stage channels
  
  // Hilos
  THREAD: "thread",                // Cualquier hilo
  PUBLIC_THREAD: "public_thread",  // Solo hilos públicos
  PRIVATE_THREAD: "private_thread", // Solo hilos privados
  
  // Mensajería privada
  DM: "dm",                        // Mensajes directos
  
  // Especiales
  NSFW: "nsfw",                    // Solo canales NSFW
  ANY: "any",                      // Cualquier contexto
  GUILD_ONLY: "guild_only"         // Solo en servidores (no DMs)
};

/**
 * Metadata extendida para comandos
 */
export class CommandMetadata {
  constructor(options = {}) {
    // Contextos donde puede ejecutarse
    this.contexts = options.contexts || [CommandContext.ANY];
    
    // Si requiere NSFW
    this.nsfw = options.nsfw || false;
    
    // Si solo funciona en guild
    this.guildOnly = options.guildOnly !== false;
    
    // Si requiere que el usuario esté en voz
    this.requiresVoiceConnection = options.requiresVoiceConnection || false;
    
    // Si requiere que el bot esté en voz
    this.requiresBotVoiceConnection = options.requiresBotVoiceConnection || false;
    
    // Canales específicos permitidos (whitelist)
    this.allowedChannelTypes = options.allowedChannelTypes || [];
    
    // Canales específicos bloqueados (blacklist)
    this.blockedChannelTypes = options.blockedChannelTypes || [];
    
    // Si puede ejecutarse en categorías específicas
    this.allowedCategories = options.allowedCategories || [];
    
    // Si puede ejecutarse con slowmode activo
    this.allowInSlowmode = options.allowInSlowmode !== false;
    
    // Permisos mínimos del canal requeridos
    this.requiredChannelPermissions = options.requiredChannelPermissions || [];
  }
  
  /**
   * Verificar si el comando puede ejecutarse en un contexto dado
   */
  canExecuteIn(channel, member = null) {
    const checks = [
      () => this.checkChannelType(channel),
      () => this.checkNSFW(channel),
      () => this.checkGuildOnly(channel),
      () => this.checkVoiceConnection(channel, member),
      () => this.checkChannelPermissions(channel, member),
      () => this.checkCategory(channel),
      () => this.checkSlowmode(channel)
    ];
    
    for (const check of checks) {
      const result = check();
      if (!result.allowed) {
        return result;
      }
    }
    
    return { allowed: true };
  }
  
  checkChannelType(channel) {
    // Si acepta ANY, permitir todo
    if (this.contexts.includes(CommandContext.ANY)) {
      return { allowed: true };
    }
    
    // DM check
    if (channel.type === ChannelType.DM) {
      if (!this.contexts.includes(CommandContext.DM)) {
        return { 
          allowed: false, 
          reason: "Este comando no puede usarse en mensajes directos" 
        };
      }
      return { allowed: true };
    }
    
    // Guild only check
    if (this.contexts.includes(CommandContext.GUILD_ONLY) && !channel.guild) {
      return { 
        allowed: false, 
        reason: "Este comando solo funciona en servidores" 
      };
    }
    
    // Voice channels
    if (channel.type === ChannelType.GuildVoice) {
      const voiceContexts = [
        CommandContext.VOICE,
        CommandContext.VOICE_TEXT
      ];
      if (!this.contexts.some(ctx => voiceContexts.includes(ctx))) {
        return { 
          allowed: false, 
          reason: "Este comando no puede usarse en canales de voz" 
        };
      }
    }
    
    // Text channels
    if (channel.type === ChannelType.GuildText) {
      if (this.contexts.includes(CommandContext.VOICE) && 
          !this.contexts.includes(CommandContext.TEXT)) {
        return { 
          allowed: false, 
          reason: "Este comando solo funciona en canales de voz" 
        };
      }
    }
    
    // Threads
    const threadTypes = [
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread
    ];
    
    if (threadTypes.includes(channel.type)) {
      if (!this.contexts.includes(CommandContext.THREAD) &&
          !this.contexts.includes(CommandContext.PUBLIC_THREAD) &&
          !this.contexts.includes(CommandContext.PRIVATE_THREAD)) {
        return { 
          allowed: false, 
          reason: "Este comando no puede usarse en hilos" 
        };
      }
    }
    
    // Stage channels
    if (channel.type === ChannelType.GuildStageVoice) {
      if (!this.contexts.includes(CommandContext.STAGE)) {
        return { 
          allowed: false, 
          reason: "Este comando no puede usarse en stages" 
        };
      }
    }
    
    // Forum channels
    if (channel.type === ChannelType.GuildForum) {
      if (!this.contexts.includes(CommandContext.FORUM)) {
        return { 
          allowed: false, 
          reason: "Este comando no puede usarse en foros" 
        };
      }
    }
    
    // Announcement channels
    if (channel.type === ChannelType.GuildAnnouncement) {
      if (!this.contexts.includes(CommandContext.ANNOUNCEMENT)) {
        return { 
          allowed: false, 
          reason: "Este comando no puede usarse en canales de anuncios" 
        };
      }
    }
    
    // Whitelist/Blacklist
    if (this.allowedChannelTypes.length > 0) {
      if (!this.allowedChannelTypes.includes(channel.type)) {
        return { 
          allowed: false, 
          reason: "Este comando no está permitido en este tipo de canal" 
        };
      }
    }
    
    if (this.blockedChannelTypes.includes(channel.type)) {
      return { 
        allowed: false, 
        reason: "Este comando está bloqueado en este tipo de canal" 
      };
    }
    
    return { allowed: true };
  }
  
  checkNSFW(channel) {
    if (this.nsfw && channel.guild) {
      if (!channel.nsfw) {
        return { 
          allowed: false, 
          reason: "Este comando solo puede usarse en canales NSFW (18+)" 
        };
      }
    }
    return { allowed: true };
  }
  
  checkGuildOnly(channel) {
    if (this.guildOnly && !channel.guild) {
      return { 
        allowed: false, 
        reason: "Este comando solo funciona en servidores" 
      };
    }
    return { allowed: true };
  }
  
  checkVoiceConnection(channel, member) {
    if (!member) return { allowed: true };
    
    if (this.requiresVoiceConnection) {
      if (!member.voice?.channel) {
        return { 
          allowed: false, 
          reason: "Debes estar en un canal de voz para usar este comando" 
        };
      }
    }
    
    if (this.requiresBotVoiceConnection && channel.guild) {
      const botMember = channel.guild.members.me;
      if (!botMember.voice?.channel) {
        return { 
          allowed: false, 
          reason: "El bot debe estar en un canal de voz" 
        };
      }
    }
    
    return { allowed: true };
  }
  
  checkChannelPermissions(channel, member) {
    if (!member || this.requiredChannelPermissions.length === 0) {
      return { allowed: true };
    }
    
    const permissions = channel.permissionsFor(member);
    const missing = this.requiredChannelPermissions.filter(
      perm => !permissions.has(perm)
    );
    
    if (missing.length > 0) {
      return { 
        allowed: false, 
        reason: `Necesitas los permisos: ${missing.join(", ")}` 
      };
    }
    
    return { allowed: true };
  }
  
  checkCategory(channel) {
    if (this.allowedCategories.length === 0) {
      return { allowed: true };
    }
    
    if (!channel.parent) {
      return { 
        allowed: false, 
        reason: "Este comando solo funciona en canales dentro de categorías específicas" 
      };
    }
    
    if (!this.allowedCategories.includes(channel.parentId)) {
      return { 
        allowed: false, 
        reason: "Este comando no está permitido en esta categoría" 
      };
    }
    
    return { allowed: true };
  }
  
  checkSlowmode(channel) {
    if (!this.allowInSlowmode && channel.rateLimitPerUser > 0) {
      return { 
        allowed: false, 
        reason: "Este comando no puede usarse en canales con slowmode activo" 
      };
    }
    return { allowed: true };
  }
}