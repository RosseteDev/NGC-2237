// src/utils/CommandBuilder.js

import { SlashCommandBuilder } from "discord.js";
import { getTranslation } from "../localization/useLang.js";

/**
 * Construye un comando desde configuración JSON con i18n automático
 * @param {Object} config - Configuración del comando
 * @returns {SlashCommandBuilder}
 */
export function buildCommand(config) {
  const {
    name,           // Nombre en inglés (obligatorio)
    category,       // Categoría para i18n (music, moderation, etc.)
    aliases = [],   // Aliases adicionales manuales
    options = [],
    permissions = [],
    cooldown = 3
  } = config;

  // Obtener traducciones automáticamente
  const i18nKey = `${category}.commands.${name}`;
  
  // Nombre y descripción en inglés desde i18n
  const enDesc = getTranslation("en", `${i18nKey}.description`) || "No description";
  
  // Crear comando base
  const command = new SlashCommandBuilder()
    .setName(name)
    .setDescription(enDesc);

  // ✅ Localizaciones automáticas (español)
  const esName = getTranslation("es", `${i18nKey}.name`);
  const esDesc = getTranslation("es", `${i18nKey}.description`);
  
  if (esName && esName !== i18nKey + ".name") {
    command.setNameLocalizations({
      "es-ES": esName,
      "es-419": esName
    });
  }
  
  if (esDesc && esDesc !== i18nKey + ".description") {
    command.setDescriptionLocalizations({
      "es-ES": esDesc,
      "es-419": esDesc
    });
  }

  // ✅ Agregar opciones con i18n
  for (const opt of options) {
    addOption(command, opt, i18nKey);
  }

  // ✅ Permisos
  if (permissions.length > 0) {
    command.setDefaultMemberPermissions(permissions[0]);
  }

  // ✅ Metadata (aliases, cooldown, etc.)
  command.category = category;
  command.aliases = getCommandAliases(name, i18nKey, aliases);
  command.cooldown = cooldown;
  command.permissions = permissions;

  return command;
}

/**
 * Agregar opción al comando con i18n
 */
function addOption(command, optConfig, baseI18nKey) {
  const {
    type,
    name,
    required = false,
    choices = [],
    min,
    max,
    channelTypes,
    autocomplete = false
  } = optConfig;

  // i18n de la opción
  const optI18nKey = `${baseI18nKey}.options.${name}`;
  const enDesc = getTranslation("en", `${optI18nKey}.description`) || "No description";
  const esName = getTranslation("es", `${optI18nKey}.name`);
  const esDesc = getTranslation("es", `${optI18nKey}.description`);

  const optionBuilder = (option) => {
    option
      .setName(name)
      .setDescription(enDesc)
      .setRequired(required);

    // Localizaciones
    if (esName && esName !== `${optI18nKey}.name`) {
      option.setNameLocalizations({
        "es-ES": esName,
        "es-419": esName
      });
    }

    if (esDesc && esDesc !== `${optI18nKey}.description`) {
      option.setDescriptionLocalizations({
        "es-ES": esDesc,
        "es-419": esDesc
      });
    }

    // Configuraciones adicionales
    if (choices.length > 0) option.addChoices(...choices);
    if (min !== undefined) option.setMinValue?.(min);
    if (max !== undefined) option.setMaxValue?.(max);
    if (channelTypes) option.addChannelTypes?.(...channelTypes);
    if (autocomplete) option.setAutocomplete(true);

    return option;
  };

  // Agregar según tipo
  const typeMap = {
    "string": () => command.addStringOption(optionBuilder),
    "integer": () => command.addIntegerOption(optionBuilder),
    "boolean": () => command.addBooleanOption(optionBuilder),
    "user": () => command.addUserOption(optionBuilder),
    "channel": () => command.addChannelOption(optionBuilder),
    "role": () => command.addRoleOption(optionBuilder),
    "number": () => command.addNumberOption(optionBuilder),
    "attachment": () => command.addAttachmentOption(optionBuilder)
  };

  const addFn = typeMap[type];
  if (addFn) {
    addFn();
  } else {
    console.warn(`⚠️ Tipo de opción desconocido: ${type}`);
  }
}

/**
 * Obtener todos los aliases (manuales + automáticos de i18n)
 */
function getCommandAliases(name, i18nKey, manualAliases) {
  const aliases = [...manualAliases];
  
  // Agregar nombre en español
  const esName = getTranslation("es", `${i18nKey}.name`);
  if (esName && esName !== `${i18nKey}.name` && esName !== name) {
    aliases.push(esName);
  }
  
  // Agregar aliases desde i18n
  const i18nAliases = getTranslation("es", `${i18nKey}.aliases`);
  if (Array.isArray(i18nAliases)) {
    aliases.push(...i18nAliases);
  }
  
  return [...new Set(aliases)]; // Eliminar duplicados
}