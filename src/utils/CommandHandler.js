// src/utils/CommandHandler.js

import Context from "./Context.js";
import { db } from "../database/manager.js";
import logger, { createLogger } from "./Logger.js";

const handlerLogger = createLogger("handler");

export default class CommandHandler {
  constructor(client) {
    this.client = client;
    this.cooldowns = new Map();
    
    handlerLogger.info("CommandHandler inicializado");
  }
  
  async execute(source, args = null, commandName = null) {
    const context = new Context(source, args, commandName);
    const command = this.client.commands.get(context.commandName);
    
    if (!command) {
      handlerLogger.warn(`Comando no encontrado: ${context.commandName}`);
      return;
    }
    
    try {
      handlerLogger.debug(`Ejecutando: ${context.commandName}`);
      
      // Verificar cooldowns
      if (!this.checkCooldown(context, command)) {
        return;
      }
      
      // Verificar permisos
      if (command.permissions && !this.checkPermissions(context, command)) {
        return;
      }
      
      // ✅ CORREGIDO: Solo usar timer si debug está habilitado
      const timerLabel = `Ejecución de ${context.commandName}`;
      handlerLogger.time(timerLabel);
      
      // Ejecutar comando
      await command.execute(context);
      
      handlerLogger.timeEnd(timerLabel);
      
      // Log global de comando exitoso
      logger.command(context.user, context.commandName, true);
      
      // Analytics
      if (db.analytics) {
        db.analytics.logCommand({
          user: context.user,
          guild: context.guild,
          commandName: context.commandName
        }, true);
      }
      
    } catch (error) {
      handlerLogger.error(`Error en comando ${context.commandName}`, error);
      await this.handleError(context, error);
      
      // Log global de comando fallido
      logger.command(context.user, context.commandName, false);
      
      // Analytics
      if (db.analytics) {
        db.analytics.logCommand({
          user: context.user,
          guild: context.guild,
          commandName: context.commandName
        }, false);
      }
    }
  }
  
  checkCooldown(context, command) {
    const cooldownAmount = (command.cooldown || 3) * 1000;
    const key = `${context.user.id}-${context.commandName}`;
    
    if (this.cooldowns.has(key)) {
      const expirationTime = this.cooldowns.get(key);
      const now = Date.now();
      
      if (now < expirationTime) {
        const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
        
        handlerLogger.debug(`Cooldown activo para ${context.user.tag}: ${timeLeft}s`);
        
        context.reply({
          content: `⏱️ Espera **${timeLeft}s** antes de usar \`${context.commandName}\` de nuevo`,
          ephemeral: true
        });
        
        return false;
      }
    }
    
    this.cooldowns.set(key, Date.now() + cooldownAmount);
    setTimeout(() => this.cooldowns.delete(key), cooldownAmount);
    
    return true;
  }
  
  checkPermissions(context, command) {
    if (!context.guild) return true;
    
    const perms = command.permissions;
    if (!perms) return true;
    
    // Verificar permisos del usuario
    if (perms.user) {
      const missing = perms.user.filter(
        perm => !context.member.permissions.has(perm)
      );
      
      if (missing.length > 0) {
        handlerLogger.debug(`Permisos faltantes (usuario): ${missing.join(", ")}`);
        context.reply({
          content: `❌ Te faltan permisos: **${missing.join(", ")}**`,
          ephemeral: true
        });
        return false;
      }
    }
    
    // Verificar permisos del bot
    if (perms.bot) {
      const botMember = context.guild.members.me;
      const missing = perms.bot.filter(
        perm => !botMember.permissions.has(perm)
      );
      
      if (missing.length > 0) {
        handlerLogger.debug(`Permisos faltantes (bot): ${missing.join(", ")}`);
        context.reply({
          content: `❌ El bot necesita permisos: **${missing.join(", ")}**`,
          ephemeral: true
        });
        return false;
      }
    }
    
    return true;
  }
  
  async handleError(context, error) {
    const errorMessage = "❌ Ocurrió un error ejecutando este comando.";
    
    try {
      if (context.deferred || context.replied) {
        await context.editReply({ content: errorMessage });
      } else {
        await context.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      handlerLogger.error("No se pudo responder al error", replyError);
    }
  }
}