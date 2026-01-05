import { EmbedBuilder } from "discord.js";
import { buildCommand } from "../../utils/commandBuilder.js";
import { useLang } from "../../localization/useLang.js";
import { db } from "../../database/manager.js";

const DEFAULT_PREFIX = "r!";

// ✅ Actualizado para usar buildCommand()
export const data = buildCommand({
  name: "prefix",
  description: "View or change server prefix",
  category: "settings",
  aliases: ["setprefix", "changeprefix"],
  autoLocalizeAliases: true, // Auto: prefijo
  options: [
    {
      type: "string",
      name: "new_prefix",
      description: "New prefix (leave empty to view current)",
      required: false,
      max: 10
    }
  ]
});

export async function execute(interaction) {
  const t = await useLang(interaction);
  let newPrefix = interaction.options?.getString("new_prefix");
  const currentPrefix = await db.pg.getGuildPrefix(interaction.guild?.id);

  // Solo ver prefix actual
  if (!newPrefix) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(t("settings.prefix.current"))
      .setDescription(
        t("settings.prefix.current_prefix", { prefix: currentPrefix }) + "\n" +
        t("settings.prefix.default_prefix", { default: DEFAULT_PREFIX }) + "\n\n" +
        t("settings.prefix.examples_title") + "\n" +
        `• \`${currentPrefix}play lofi\`\n` +
        `• \`${currentPrefix}help\`\n`
      )
      .addFields({
        name: t("settings.prefix.change_tip"),
        value: t("settings.prefix.change_info", { prefix: currentPrefix })
      })
      .setFooter({ text: t("settings.prefix.footer", { default: DEFAULT_PREFIX }) })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // Cambiar prefix
  if (!interaction.member?.permissions.has("ManageGuild")) {
    return interaction.reply({
      content: t("settings.errors.permission_required"),
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
    return interaction.reply({
      content: t("settings.errors.prefix_too_long"),
      ephemeral: true
    });
  }

  if (newPrefix.includes(" ")) {
    return interaction.reply({
      content: t("settings.errors.prefix_no_spaces"),
      ephemeral: true
    });
  }

  if (newPrefix.startsWith("/")) {
    return interaction.reply({
      content: t("settings.errors.prefix_no_slash"),
      ephemeral: true
    });
  }

  // Guardar nuevo prefix
  try {
    await db.pg.setGuildPrefix(interaction.guild.id, newPrefix);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(t("settings.prefix.updated_title"))
      .setDescription(
        t("settings.prefix.previous", { old: currentPrefix }) + "\n" +
        t("settings.prefix.new", { new: newPrefix }) + "\n\n" +
        t("settings.prefix.examples_title") + "\n" +
        `• \`${newPrefix}play lofi\`\n` +
        `• \`${newPrefix}help\`\n\n` +
        t("settings.prefix.auto_symbol_tip")
      )
      .setFooter({ 
        text: t("settings.prefix.restore_info", { 
          prefix: newPrefix, 
          default: DEFAULT_PREFIX.replace('!', '') 
        }) 
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error guardando prefix:", error);
    return interaction.reply({
      content: t("settings.errors.save_failed"),
      ephemeral: true
    });
  }
}