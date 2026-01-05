// src/handlers/prefixHandler.js

import { db } from "../database/manager.js";

/**
 * Parser de argumentos mejorado
 */
function parseArguments(args, commandOptions) {
  if (!commandOptions || commandOptions.length === 0) {
    return {};
  }

  const parsed = {};
  let currentIndex = 0;

  for (let i = 0; i < commandOptions.length; i++) {
    const option = commandOptions[i];
    const isLastOption = i === commandOptions.length - 1;

    if (currentIndex >= args.length) {
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

      default:
        // User, Channel, Role, etc. - dejar como string
        parsed[option.name] = args[currentIndex];
        currentIndex++;
    }
  }

  return parsed;
}

/**
 * Buscar comando por nombre o alias
 */
function findCommand(client, commandName) {
  // 1️⃣ Buscar por nombre exacto
  let command = client.commands.get(commandName);
  if (command) return { command, name: commandName };

  // 2️⃣ Buscar por alias
  for (const [cmdName, cmd] of client.commands.entries()) {
    const aliases = [
      ...(cmd.aliases || []),
      ...(cmd.data?.aliases || [])
    ].map(a => a.toLowerCase());

    if (aliases.includes(commandName)) {
      return { command: cmd, name: cmdName };
    }

    // Buscar por nombre localizado
    const dataName = cmd.data?.name?.toLowerCase();
    if (dataName && dataName === commandName) {
      return { command: cmd, name: cmdName };
    }
  }

  return null;
}

/**
 * Handler principal de prefix commands
 */
export async function handlePrefixCommand(message, client) {
  // Ignorar bots y mensajes sin contenido
  if (message.author.bot || !message.content || !message.guild) return;

  try {
    // ✅ Obtener prefix del servidor
    const prefix = await db.pg.getGuildPrefix(message.guild.id);

    // Verificar si el mensaje usa el prefix
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

    if (!usedPrefix || !content) return;

    // Separar comando y argumentos
    const rawArgs = content.split(/\s+/);
    const commandInput = rawArgs.shift()?.toLowerCase();

    if (!commandInput) return;

    // ✅ Buscar comando
    const result = findCommand(client, commandInput);
    if (!result) return;

    const { command, name } = result;

    // ✅ Parsear argumentos según las opciones del comando
    const commandOptions = command.data?.options || [];
    const parsedArgs = parseArguments(rawArgs, commandOptions);
    
    // Agregar metadata
    parsedArgs._commandName = name;
    parsedArgs._raw = rawArgs;

    console.log(`[PREFIX] ✅ ${message.author.tag} ejecutó ${prefix}${commandInput}`);

    // ✅ Pasar al CommandHandler unificado
    await client.commandHandler.execute(message, parsedArgs, name);

  } catch (error) {
    console.error("❌ Error en prefix command:", error);
    
    try {
      await message.reply({
        content: `❌ Error: ${error.message}`,
        allowedMentions: { repliedUser: false }
      });
    } catch {}
  }
}