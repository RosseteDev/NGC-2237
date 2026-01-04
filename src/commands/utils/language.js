// commands/language.js

import { SlashCommandBuilder } from "discord.js";
import { useLang } from "../../localization/useLang.js";
import { db } from "../../database/manager.js";

export const data = new SlashCommandBuilder()
  .setName("language")
  .setNameLocalizations({
    "es-ES": "idioma",
    "es-419": "idioma"
  })
  .setDescription("Change server language")
  .setDescriptionLocalizations({
    "es-ES": "Cambiar el idioma del servidor",
    "es-419": "Cambiar el idioma del servidor"
  })
  .addStringOption(o =>
    o.setName("lang")
      .setNameLocalizations({
        "es-ES": "idioma",
        "es-419": "idioma"
      })
      .setDescription("Language code")
      .setDescriptionLocalizations({
        "es-ES": "Código de idioma",
        "es-419": "Código de idioma"
      })
      .setRequired(true)
      .addChoices(
        { name: "English", value: "en" },
        { name: "Español", value: "es" }
      )
  );

export async function execute(interaction) {
  const lang = interaction.options.getString("lang");

  // ✅ Guarda en DB Y actualiza cache automáticamente
  await db.pg.setGuildLang(interaction.guild.id, lang);

  // ✅ Log analytics
  db.analytics.logCommand(interaction);

  const t = await useLang(interaction);

  await interaction.reply(
    t("settings.language.changed", { lang })
  );
}