// src/utils/commandbuilder.js

import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from "discord.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CommandMetadata } from "./CommandMetadata.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache de configuraciones cargadas
const configCache = new Map();

/**
 * Cargar configuración de comando desde JSON
 */
function loadCommandConfig(category, commandName, lang = "en") {
  const cacheKey = `${lang}:${category}:${commandName}`;
  
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey);
  }
  
  try {
    const configPath = join(
      __dirname,
      "..",
      "i18n",
      lang,
      "commands",
      `${category}.json`
    );

    const data = JSON.parse(readFileSync(configPath, "utf-8"));
    const config = data[commandName];
    
    if (!config) {
      throw new Error(`Comando "${commandName}" no encontrado en ${configPath}`);
    }
    
    configCache.set(cacheKey, config);
    return config;
    
  } catch (error) {
    console.error(`❌ Error cargando config para ${category}/${commandName}:`, error.message);
    return null;
  }
}

/**
 * Mapeo de strings a valores de Discord.js
 */
const TypeMap = {
  "string": 3,
  "integer": 4,
  "boolean": 5,
  "user": 6,
  "channel": 7,
  "role": 8,
  "number": 10,
  "attachment": 11
};

const ChannelTypeMap = {
  "text": ChannelType.GuildText,
  "voice": ChannelType.GuildVoice,
  "category": ChannelType.GuildCategory,
  "announcement": ChannelType.GuildAnnouncement,
  "stage": ChannelType.GuildStageVoice,
  "forum": ChannelType.GuildForum,
  "thread": ChannelType.PublicThread,
  "private_thread": ChannelType.PrivateThread
};

const PermissionMap = {
  "Administrator": PermissionFlagsBits.Administrator,
  "ManageGuild": PermissionFlagsBits.ManageGuild,
  "ManageRoles": PermissionFlagsBits.ManageRoles,
  "ManageChannels": PermissionFlagsBits.ManageChannels,
  "KickMembers": PermissionFlagsBits.KickMembers,
  "BanMembers": PermissionFlagsBits.BanMembers,
  "ManageMessages": PermissionFlagsBits.ManageMessages,
  "Connect": PermissionFlagsBits.Connect,
  "Speak": PermissionFlagsBits.Speak,
  "MuteMembers": PermissionFlagsBits.MuteMembers,
  "DeafenMembers": PermissionFlagsBits.DeafenMembers,
  "MoveMembers": PermissionFlagsBits.MoveMembers
};

/**
 * Construir comando desde configuración JSON
 */
export function buildCommand(category, commandName) {
  // Cargar configuración en inglés (base)
  const enConfig = loadCommandConfig(category, commandName, "en");
  if (!enConfig) {
    throw new Error(`No se pudo cargar: ${category}/${commandName}`);
  }
  
  // Cargar traducciones
  const esConfig = loadCommandConfig(category, commandName, "es");
  
  // Crear comando
  const command = new SlashCommandBuilder()
    .setName(enConfig.name)
    .setDescription(enConfig.description);
  
  // Localizaciones
  if (esConfig) {
    command.setNameLocalizations({
      "es-ES": esConfig.name,
      "es-419": esConfig.name
    });
    
    command.setDescriptionLocalizations({
      "es-ES": esConfig.description,
      "es-419": esConfig.description
    });
  }
  
  // Opciones
  if (enConfig.options) {
    for (const [optName, optConfig] of Object.entries(enConfig.options)) {
      addOption(command, optName, optConfig, esConfig?.options?.[optName]);
    }
  }
  
  // Permisos
  if (enConfig.metadata?.permissions?.user?.length > 0) {
    const firstPerm = enConfig.metadata.permissions.user[0];
    const permFlag = PermissionMap[firstPerm];
    if (permFlag) {
      // Convertir BigInt a Number para evitar error de serialización
      command.setDefaultMemberPermissions(Number(permFlag));
    }
  }
  
  command.setDMPermission(enConfig.metadata?.guildOnly === false);
  
  // Metadata
  command.category = category;
  command.aliases = mergeAliases(enConfig.aliases, esConfig?.aliases);
  command.cooldown = enConfig.metadata?.cooldown || 3;
  command.metadata = buildMetadata(enConfig.metadata);
  command.responses = {
    en: enConfig.responses || {},
    es: esConfig?.responses || {}
  };
  
  return command;
}

/**
 * Agregar opción al comando
 */
function addOption(command, name, enConfig, esConfig) {
  const type = enConfig.type || "string";
  const typeValue = TypeMap[type];
  
  const optionBuilder = (option) => {
    option
      .setName(name)
      .setDescription(enConfig.description)
      .setRequired(enConfig.required !== false);
    
    // Localizaciones
    if (esConfig) {
      option.setNameLocalizations({
        "es-ES": esConfig.name,
        "es-419": esConfig.name
      });
      
      option.setDescriptionLocalizations({
        "es-ES": esConfig.description,
        "es-419": esConfig.description
      });
    }
    
    // Configuraciones específicas por tipo
    if (enConfig.choices) {
      option.addChoices(...enConfig.choices);
    }
    
    if (enConfig.min !== undefined) {
      option.setMinValue?.(enConfig.min);
    }
    
    if (enConfig.max !== undefined) {
      option.setMaxValue?.(enConfig.max);
    }
    
    if (enConfig.channelTypes) {
      const types = enConfig.channelTypes.map(t => ChannelTypeMap[t]);
      option.addChannelTypes?.(...types);
    }
    
    if (enConfig.autocomplete) {
      option.setAutocomplete(true);
    }
    
    return option;
  };
  
  // Agregar según tipo
  switch (type) {
    case "string":
      command.addStringOption(optionBuilder);
      break;
    case "integer":
      command.addIntegerOption(optionBuilder);
      break;
    case "boolean":
      command.addBooleanOption(optionBuilder);
      break;
    case "user":
      command.addUserOption(optionBuilder);
      break;
    case "channel":
      command.addChannelOption(optionBuilder);
      break;
    case "role":
      command.addRoleOption(optionBuilder);
      break;
    case "number":
      command.addNumberOption(optionBuilder);
      break;
    case "attachment":
      command.addAttachmentOption(optionBuilder);
      break;
  }
}

/**
 * Construir metadata desde configuración
 */
function buildMetadata(metaConfig) {
  if (!metaConfig) {
    return new CommandMetadata();
  }
  
  return new CommandMetadata({
    contexts: metaConfig.contexts || ["any"],
    nsfw: metaConfig.nsfw || false,
    guildOnly: metaConfig.guildOnly !== false,
    requiresVoiceConnection: metaConfig.requiresVoiceConnection || false,
    requiresBotVoiceConnection: metaConfig.requiresBotVoiceConnection || false,
    allowedChannelTypes: (metaConfig.allowedChannelTypes || []).map(t => 
      typeof t === "number" ? t : ChannelTypeMap[t]
    ),
    blockedChannelTypes: (metaConfig.blockedChannelTypes || []).map(t => 
      typeof t === "number" ? t : ChannelTypeMap[t]
    ),
    allowedCategories: metaConfig.allowedCategories || [],
    allowInSlowmode: metaConfig.allowInSlowmode !== false,
    requiredChannelPermissions: (metaConfig.permissions?.user || []).map(p => 
      PermissionMap[p] || p
    )
  });
}

/**
 * Combinar aliases de múltiples idiomas
 */
function mergeAliases(...aliasSets) {
  const merged = new Set();
  
  for (const aliases of aliasSets) {
    if (Array.isArray(aliases)) {
      aliases.forEach(a => merged.add(a));
    }
  }
  
  return Array.from(merged);
}

/**
 * Limpiar cache (útil para hot-reload)
 */
export function clearCommandCache() {
  configCache.clear();
  console.log("🧹 Cache de comandos limpiado");
}