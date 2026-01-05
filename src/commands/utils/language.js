// src/commands/settings/language.js

import { SlashCommandBuilder } from "discord.js";
import { useLang } from "../../localization/useLang.js";
import { createLogger } from "../../utils/Logger.js";
import { db } from "../../database/manager.js";

const logger = createLogger("settings:language");

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

export async function execute(context) {
  const lang = context.options.getString("lang");

  logger.debug(`Cambio de idioma solicitado: ${lang}`);
  logger.debug(`Usuario: ${context.user.tag}`);
  logger.debug(`Servidor: ${context.guild.name}`);

  await db.pg.setGuildLang(context.guild.id, lang);
  
  logger.info(`Idioma cambiado a ${lang} en ${context.guild.name}`);

  db.analytics.logCommand(context);

  const t = await useLang(context);

  await context.success(
    t("settings.language.updated_title"),
    t("settings.language.changed", { lang })
  );
}
