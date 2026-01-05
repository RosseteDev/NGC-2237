// src/commands/music/skip.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createLogger } from "../../utils/Logger.js";
import { queues } from "./utils.js";

const logger = createLogger("music:skip");

export const data = buildCommand("music", "skip");

async function getTranslator(context) {
  // Obtener idioma del servidor desde la base de datos
  let lang = "en"; // Default
  
  try {
    // Importar db directamente
    const { db } = await import("../../database/manager.js");
    lang = await db.pg.getGuildLang(context.guild.id);
  } catch (error) {
    // Si falla, usar el locale del contexto como fallback
    lang = context.locale?.startsWith("es") ? "es" : "en";
  }
  
  return (key, vars = {}) => {
    // Intentar obtener traducción en el idioma del servidor
    let text = data.responses?.[lang]?.[key] || data.responses?.en?.[key] || key;
    
    // Interpolación de variables
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    
    return text;
  };
}

export async function execute(context) {
  const { guild, member, client } = context;
  const t = await getTranslator(context); // ✅ AWAIT aquí
  
  logger.debug(`Usuario: ${context.user.tag} en ${guild.name}`);
  
  try {
    // Validar que el usuario esté en un canal de voz
    if (!member?.voice?.channel) {
      return context.reply({
        content: t("no_voice"),
        ephemeral: true
      });
    }
    
    // Obtener el player
    const player = client.lavalink?.shoukaku?.players.get(guild.id);
    if (!player) {
      return context.reply({
        content: t("not_playing"),
        ephemeral: true
      });
    }
    
    // Obtener la cola
    const queue = queues.get(guild.id);
    if (!queue || !queue.playing) {
      return context.reply({
        content: t("not_playing"),
        ephemeral: true
      });
    }
    
    const tracksLeft = queue.tracks.length;
    
    logger.info(`⏭️ Saltando canción (${tracksLeft} en cola)`);
    
    // Detener la canción actual
    // Esto dispara el evento "end" con reason: "stopped"
    // que automáticamente reproduce la siguiente canción
    await player.stopTrack();
    
    // Responder al usuario
    if (tracksLeft > 0) {
      await context.reply({
        content: t("skipped", { count: tracksLeft })
      });
    } else {
      await context.reply({
        content: t("skipped_last")
      });
    }
    
  } catch (error) {
    logger.error("Error en comando skip", error);
    await context.reply({
      content: "❌ Failed to skip the song",
      ephemeral: true
    });
  }
}