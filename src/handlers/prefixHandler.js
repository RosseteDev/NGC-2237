// handlers/prefixHandler.js

import { db } from "../database/manager.js";

const DEFAULT_PREFIX = "r!";

/**
 * Maneja mensajes para detectar y ejecutar comandos por prefijo
 */
export async function handlePrefixCommand(message, client) {
  // Ignorar bots
  if (message.author.bot) return;

  // Ignorar mensajes sin contenido o sin guild
  if (!message.content || !message.guild) return;

  try {
    // ✅ Obtener prefix del servidor usando SOLO manager.js
    const prefix = await db.pg.getGuildPrefix(message.guild.id);

    // Verificar si el mensaje usa el prefix o menciona al bot
    let usedPrefix = null;
    let content = message.content;

    if (message.content.startsWith(prefix)) {
      usedPrefix = prefix;
      content = message.content.slice(prefix.length).trim();
    } else if (message.mentions.has(client.user.id)) {
      // Soporte para @Bot play lofi
      usedPrefix = `<@${client.user.id}>`;
      content = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`), "")
        .trim();
    }

    // Si no se usó ningún prefix, ignorar
    if (!usedPrefix || !content) return;

    // Separar comando y argumentos
    const args = content.split(/\s+/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // Buscar el comando
    const command = findCommand(client, commandName);

    if (!command) {
      console.log(`[PREFIX] ❌ Comando "${commandName}" no encontrado`);
      return;
    }

    // 🔍 DEBUG: Ver qué se va a ejecutar
    console.log(`[PREFIX] ✅ Comando: ${commandName} | Args completos: "${args.join(' ')}"`);

    // ✅ Obtener idioma del servidor usando manager.js
    const guildLang = await db.pg.getGuildLang(message.guild.id);
    
    // Crear un objeto "interaction-like" para compatibilidad
    const fakeInteraction = await createFakeInteraction(
      message, 
      args, 
      command, 
      guildLang
    );

    // Ejecutar el comando
    await command.execute(fakeInteraction);

    // Log analytics
    if (db.analytics) {
      db.analytics.logCommand(fakeInteraction, true);
    }

  } catch (error) {
    console.error("❌ Error en prefix command:", error.message);
    
    try {
      await message.reply({
        content: `❌ Error: ${error.message}`,
        allowedMentions: { repliedUser: false }
      });
    } catch (replyError) {
      console.error("No se pudo responder al error:", replyError);
    }
  }
}

/**
 * Busca un comando por nombre o alias
 */
function findCommand(client, commandName) {
  if (!client.commands) {
    console.error('[PREFIX] ⚠️ client.commands no está definido');
    return null;
  }

  // Buscar por nombre exacto
  let command = client.commands.get(commandName);
  
  if (command) return command;

  // Buscar por aliases
  for (const [cmdName, cmd] of client.commands.entries()) {
    const aliases = cmd.aliases || cmd.data?.aliases || [];
    
    if (aliases.includes(commandName)) {
      console.log(`[PREFIX] Alias encontrado: ${commandName} -> ${cmdName}`);
      return cmd;
    }
  }

  return null;
}

/**
 * Parsea los argumentos según las opciones definidas en el comando
 */
function parseCommandArguments(args, commandOptions) {
  if (!commandOptions || commandOptions.length === 0) {
    // Sin opciones definidas, retornar args como está
    return { parsedArgs: args, remaining: [] };
  }

  const parsed = {};
  let currentIndex = 0;

  for (let i = 0; i < commandOptions.length; i++) {
    const option = commandOptions[i];
    const isLastOption = i === commandOptions.length - 1;

    if (currentIndex >= args.length) {
      // No hay más argumentos
      parsed[option.name] = null;
      continue;
    }

    switch (option.type) {
      case 3: // STRING
      case "string":
        if (isLastOption) {
          // Última opción string: tomar todo lo que queda
          parsed[option.name] = args.slice(currentIndex).join(' ');
          currentIndex = args.length;
        } else {
          // No es la última: tomar solo este argumento
          parsed[option.name] = args[currentIndex];
          currentIndex++;
        }
        break;

      case 4: // INTEGER
      case "integer":
        const intVal = parseInt(args[currentIndex], 10);
        parsed[option.name] = isNaN(intVal) ? null : intVal;
        currentIndex++;
        break;

      case 10: // NUMBER
      case "number":
        const numVal = parseFloat(args[currentIndex]);
        parsed[option.name] = isNaN(numVal) ? null : numVal;
        currentIndex++;
        break;

      case 5: // BOOLEAN
      case "boolean":
        const boolVal = args[currentIndex]?.toLowerCase();
        parsed[option.name] = ["true", "yes", "si", "sí", "1", "on"].includes(boolVal);
        currentIndex++;
        break;

      case 6: // USER
      case "user":
        parsed[option.name] = args[currentIndex];
        currentIndex++;
        break;

      case 7: // CHANNEL
      case "channel":
        parsed[option.name] = args[currentIndex];
        currentIndex++;
        break;

      case 8: // ROLE
      case "role":
        parsed[option.name] = args[currentIndex];
        currentIndex++;
        break;

      default:
        // Tipo desconocido, tratar como string
        parsed[option.name] = args[currentIndex];
        currentIndex++;
    }
  }

  return {
    parsedArgs: parsed,
    remaining: args.slice(currentIndex)
  };
}

/**
 * Crea un objeto que simula una interacción de Discord.js
 */
async function createFakeInteraction(message, args, command, guildLang) {
  let replied = false;
  let deferred = false;
  let deferredMessage = null;

  // ✅ Parsear argumentos según las opciones del comando
  const commandOptions = command.data?.options || [];
  const { parsedArgs } = parseCommandArguments(args, commandOptions);

  // 🔍 DEBUG: Ver qué se parseó
  if (Object.keys(parsedArgs).length > 0) {
    console.log(`[PREFIX] Args parseados:`, parsedArgs);
  }

  const interaction = {
    // Propiedades básicas
    guild: message.guild,
    member: message.member,
    channel: message.channel,
    user: message.author,
    client: message.client,
    commandName: command.data?.name || 'unknown',
    locale: guildLang === "es" ? "es-ES" : "en-US",
    createdTimestamp: message.createdTimestamp,
    
    // Flags para saber si ya se respondió
    get replied() { return replied; },
    get deferred() { return deferred; },
    deferredMessage: null,
    
    // Sistema de opciones compatible
    options: {
      getString(name, required = false) {
        const value = parsedArgs[name];
        
        if (value === undefined || value === null) {
          return required ? "" : null;
        }
        
        return String(value);
      },
      
      getInteger(name, required = false) {
        const value = parsedArgs[name];
        
        if (value === undefined || value === null) {
          return null;
        }
        
        if (typeof value === 'number') {
          return Math.floor(value);
        }
        
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? null : parsed;
      },
      
      getNumber(name, required = false) {
        const value = parsedArgs[name];
        
        if (value === undefined || value === null) {
          return null;
        }
        
        if (typeof value === 'number') {
          return value;
        }
        
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
      },
      
      getBoolean(name, required = false) {
        const value = parsedArgs[name];
        
        if (value === undefined || value === null) {
          return null;
        }
        
        if (typeof value === 'boolean') {
          return value;
        }
        
        return ["true", "yes", "si", "sí", "1", "on"].includes(String(value).toLowerCase());
      },
      
      getUser(name, required = false) {
        const value = parsedArgs[name];
        
        if (!value) return null;
        
        // Extraer ID de mención <@123456789>
        const match = String(value).match(/^<@!?(\d+)>$/);
        const userId = match ? match[1] : value;
        
        return message.guild.members.cache.get(userId)?.user || null;
      },
      
      getMember(name, required = false) {
        const value = parsedArgs[name];
        
        if (!value) return null;
        
        const match = String(value).match(/^<@!?(\d+)>$/);
        const userId = match ? match[1] : value;
        
        return message.guild.members.cache.get(userId) || null;
      },
      
      getChannel(name, required = false) {
        const value = parsedArgs[name];
        
        if (!value) return null;
        
        const match = String(value).match(/^<#(\d+)>$/);
        const channelId = match ? match[1] : value;
        
        return message.guild.channels.cache.get(channelId) || null;
      },
      
      getRole(name, required = false) {
        const value = parsedArgs[name];
        
        if (!value) return null;
        
        const match = String(value).match(/^<@&(\d+)>$/);
        const roleId = match ? match[1] : value;
        
        return message.guild.roles.cache.get(roleId) || null;
      }
    },

    // Métodos de respuesta
    async reply(options) {
      if (replied || deferred) {
        return this.followUp(options);
      }
      
      replied = true;
      
      const replyOptions = typeof options === "string" 
        ? { content: options } 
        : options;
      
      if (replyOptions.ephemeral) {
        try {
          await message.author.send(replyOptions);
          await message.react("✅").catch(() => {});
        } catch {
          return await message.reply({
            ...replyOptions,
            allowedMentions: { repliedUser: false }
          });
        }
      } else {
        return await message.reply({
          ...replyOptions,
          allowedMentions: { repliedUser: false }
        });
      }
    },

    async editReply(options) {
      if (!deferred && !replied) {
        return this.reply(options);
      }
      
      if (deferred && deferredMessage) {
        const editOptions = typeof options === "string"
          ? { content: options }
          : options;
        
        return await deferredMessage.edit(editOptions);
      }
    },

    async deferReply(options = {}) {
      if (replied || deferred) return;
      
      deferred = true;
      
      if (!options.ephemeral) {
        deferredMessage = await message.channel.send({
          content: "⏳ Procesando...",
          allowedMentions: { repliedUser: false }
        });
        
        interaction.deferredMessage = deferredMessage;
      } else {
        await message.react("⏳").catch(() => {});
      }
    },

    async followUp(options) {
      const followUpOptions = typeof options === "string"
        ? { content: options }
        : options;
      
      if (followUpOptions.ephemeral) {
        try {
          await message.author.send(followUpOptions);
        } catch {
          await message.channel.send(followUpOptions);
        }
      } else {
        await message.channel.send(followUpOptions);
      }
    },
    
    async deleteReply() {
      if (deferredMessage) {
        await deferredMessage.delete().catch(() => {});
      }
    }
  };

  return interaction;
}