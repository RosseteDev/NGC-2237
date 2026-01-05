// src/commands/music/skip.js

import { SlashCommandBuilder } from "discord.js";
import { useLang } from "../../localization/useLang.js";
import { createLogger } from "../../utils/Logger.js";
import { queues } from "./utils.js";

const logger = createLogger("music:skip");

export const data = new SlashCommandBuilder()
  .setName("skip")
  .setNameLocalizations({
    "es-ES": "saltar",
    "es-419": "saltar"
  })
  .setDescription("Skip to next song")
  .setDescriptionLocalizations({
    "es-ES": "Salta a la siguiente canción",
    "es-419": "Salta a la siguiente canción"
  });

export const aliases = ["s", "next", "saltar", "siguiente"];

export async function execute(context) {
  const t = await useLang(context);
  const { guild, member, client } = context;

  logger.debug(`Usuario: ${context.user.tag} en ${guild.name}`);

  if (!member?.voice?.channel) {
    logger.debug("Usuario no en canal de voz");
    return context.reply({
      content: t("music.errors.voice_required"),
      ephemeral: true
    });
  }

  const shoukaku = client.lavalink?.shoukaku;
  
  if (!shoukaku) {
    logger.error("Shoukaku no disponible");
    return context.reply({
      content: t("music.errors.system_unavailable"),
      ephemeral: true
    });
  }

  const player = shoukaku.players.get(guild.id);

  if (!player) {
    logger.debug("No hay player activo");
    return context.reply({
      content: t("music.errors.not_playing"),
      ephemeral: true
    });
  }

  const queue = queues.get(guild.id);

  if (!queue || !queue.playing) {
    logger.debug("No hay reproducción activa");
    return context.reply({
      content: t("music.errors.not_playing"),
      ephemeral: true
    });
  }

  if (queue.tracks.length === 0) {
    logger.info("Última canción, deteniendo");
    player.stopTrack();
    queue.playing = false;
    
    return context.reply({
      content: "⏭️ **Canción saltada.** No hay más canciones en la cola."
    });
  }

  logger.info(`⏭️ Saltando canción (${queue.tracks.length} en cola)`);
  player.stopTrack();

  await context.reply({
    content: t("music.messages.skip")
  });
}