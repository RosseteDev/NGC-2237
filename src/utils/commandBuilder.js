// utils/commandBuilder.js

import { SlashCommandBuilder } from "discord.js";
import { getTranslation } from "../localization/useLang.js";

/**
 * Construye un comando con soporte para múltiples idiomas
 * @param {Object} config - Configuración del comando
 * @param {string} config.name - Nombre del comando en inglés
 * @param {string} config.description - Descripción en inglés
 * @param {string} config.category - Categoría (music, moderation, etc.)
 * @param {Array} config.aliases - Aliases adicionales
 * @param {Array} config.options - Opciones del comando
 * @param {Array} config.permissions - Permisos requeridos
 * @param {boolean} config.autoLocalizeAliases - Auto-generar aliases en español (default: true)
 */
export function buildCommand(config) {
  const {
    name,
    description,
    category,
    aliases = [],
    options = [],
    permissions = [],
    autoLocalizeAliases = true
  } = config;

  // Crear el comando base
  const command = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description);

  // ✅ NUEVO: Auto-agregar nombre en español como alias
  const allAliases = [...aliases];
  
  if (autoLocalizeAliases) {
    // Obtener traducciones de nombre y aliases
    const translationKey = `${category}.commands.${name}`;
    
    // Nombre en español
    const esName = getTranslation("es", `${translationKey}.name`);
    if (esName && esName !== `${translationKey}.name` && esName !== name) {
      allAliases.push(esName);
      
      // Agregar localización al slash command
      command.setNameLocalizations({
        "es-ES": esName,
        "es-419": esName
      });
    }

    // Descripción en español
    const esDesc = getTranslation("es", `${translationKey}.description`);
    if (esDesc && esDesc !== `${translationKey}.description`) {
      command.setDescriptionLocalizations({
        "es-ES": esDesc,
        "es-419": esDesc
      });
    }

    // Aliases en español desde traducciones
    const esAliases = getTranslation("es", `${translationKey}.aliases`);
    if (Array.isArray(esAliases)) {
      allAliases.push(...esAliases);
    }
  }

  // Agregar opciones
  for (const opt of options) {
    addOption(command, opt, category, name);
  }

  // Agregar permisos
  if (permissions.length > 0) {
    command.setDefaultMemberPermissions(permissions[0]);
  }

  // Retornar con aliases y metadata
  return {
    ...command,
    name,
    description,
    category,
    aliases: allAliases, // ✅ Incluye nombres en español
    permissions
  };
}

/**
 * Agrega una opción al comando con localización automática
 */
function addOption(command, optConfig, category, commandName) {
  const {
    type,
    name,
    description,
    required = false,
    choices = [],
    min,
    max,
    channelTypes,
    autocomplete
  } = optConfig;

  // Obtener traducciones
  const optKey = `${category}.commands.${commandName}.options.${name}`;
  const esName = getTranslation("es", `${optKey}.name`);
  const esDesc = getTranslation("es", `${optKey}.description`);

  const optionBuilder = (option) => {
    option
      .setName(name)
      .setDescription(description)
      .setRequired(required);

    // Localización
    if (esName && esName !== `${optKey}.name`) {
      option.setNameLocalizations({
        "es-ES": esName,
        "es-419": esName
      });
    }

    if (esDesc && esDesc !== `${optKey}.description`) {
      option.setDescriptionLocalizations({
        "es-ES": esDesc,
        "es-419": esDesc
      });
    }

    // Choices
    if (choices.length > 0) {
      option.addChoices(...choices);
    }

    // Límites numéricos
    if (min !== undefined) option.setMinValue?.(min);
    if (max !== undefined) option.setMaxValue?.(max);

    // Tipos de canal
    if (channelTypes) option.addChannelTypes?.(...channelTypes);

    // Autocomplete
    if (autocomplete) option.setAutocomplete(true);

    return option;
  };

  // Agregar según tipo
  switch (type) {
    case "string":
    case 3:
      command.addStringOption(optionBuilder);
      break;
    case "integer":
    case 4:
      command.addIntegerOption(optionBuilder);
      break;
    case "boolean":
    case 5:
      command.addBooleanOption(optionBuilder);
      break;
    case "user":
    case 6:
      command.addUserOption(optionBuilder);
      break;
    case "channel":
    case 7:
      command.addChannelOption(optionBuilder);
      break;
    case "role":
    case 8:
      command.addRoleOption(optionBuilder);
      break;
    case "number":
    case 10:
      command.addNumberOption(optionBuilder);
      break;
    case "attachment":
    case 11:
      command.addAttachmentOption(optionBuilder);
      break;
    default:
      console.warn(`Tipo de opción desconocido: ${type}`);
  }
}