// src/commands/settings/prefix.js

import { EmbedBuilder } from "discord.js";
import { buildCommand } from "../../utils/commandbuilder.js";
import { useLang } from "../../localization/useLang.js";
import { db } from "../../database/manager.js";

const DEFAULT_PREFIX = "r!";

// ✅ SINTAXIS CORRECTA: buildCommand(category, commandName)
export const data = buildCommand("settings", "prefix");

export async function execute(context) {
  const t = await context.getTranslator();
  let newPrefix = context.options.getString("new_prefix");
  const currentPrefix = await db.pg.getGuildPrefix(context.guild?.id);

  // Solo ver prefix actual
  if (!newPrefix) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("📌 Prefix Actual")
      .setDescription(
        `El prefix actual es: \`${currentPrefix}\`\n` +
        `Prefix por defecto: \`${DEFAULT_PREFIX}\`\n\n` +
        `**Ejemplos:**\n` +
        `• \`${currentPrefix}play lofi\`\n` +
        `• \`${currentPrefix}help\`\n`
      )
      .addFields({
        name: "💡 Cambiar prefix",
        value: `Usa: \`${currentPrefix}prefix <nuevo_prefix>\``
      })
      .setFooter({ text: `Para restaurar: ${currentPrefix}prefix ${DEFAULT_PREFIX.replace('!', '')}` })
      .setTimestamp();

    return context.reply({ embeds: [embed] });
  }

  // Cambiar prefix - verificar permisos
  if (!context.member?.permissions.has("ManageGuild")) {
    return context.reply({
      content: "❌ Necesitas el permiso `Gestionar Servidor` para cambiar el prefix",
      ephemeral: true
    });
  }

  // ✅ AÑADIR ! AUTOMÁTICAMENTE si no tiene símbolo al final
  const specialChars = ['!', '?', '.', '>', '$', '#', '*', '~', '-', '_', '+'];
  const hasSpecialChar = specialChars.some(char => newPrefix.endsWith(char));
  
  if (!hasSpecialChar) {
    newPrefix = newPrefix + '!';
  }

  // Validaciones
  if (newPrefix.length > 10) {
    return context.reply({
      content: "❌ El prefix no puede tener más de 10 caracteres",
      ephemeral: true
    });
  }

  if (newPrefix.includes(" ")) {
    return context.reply({
      content: "❌ El prefix no puede contener espacios",
      ephemeral: true
    });
  }

  if (newPrefix.startsWith("/")) {
    return context.reply({
      content: "❌ El prefix no puede empezar con `/`",
      ephemeral: true
    });
  }

  // Guardar nuevo prefix
  try {
    await db.pg.setGuildPrefix(context.guild.id, newPrefix);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Prefix Actualizado")
      .setDescription(
        `**Anterior:** \`${currentPrefix}\`\n` +
        `**Nuevo:** \`${newPrefix}\`\n\n` +
        `**Ejemplos:**\n` +
        `• \`${newPrefix}play lofi\`\n` +
        `• \`${newPrefix}help\`\n\n` +
        `💡 *Si no agregaste un símbolo al final, se añadió \`!\` automáticamente*`
      )
      .setFooter({ 
        text: `Para restaurar: ${newPrefix}prefix ${DEFAULT_PREFIX.replace('!', '')}` 
      })
      .setTimestamp();

    await context.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error guardando prefix:", error);
    return context.reply({
      content: "❌ Error al guardar el prefix. Intenta de nuevo.",
      ephemeral: true
    });
  }
}