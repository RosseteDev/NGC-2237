// src/commands/music/skip.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createLogger } from "../../utils/Logger.js";
import { queues } from "./utils.js";

const logger = createLogger("music:skip");

export const data = buildCommand("music", "skip");

async function getTranslator(context) {
  let lang = "en"; // Default
  
  try {
    // Intentar obtener idioma desde la base de datos
    const { db } = await import("../../database/manager.js");
    
    // Verificar si la DB está disponible
    if (db.available && context.guild?.id) {
      lang = await db.pg.getGuildLang(context.guild.id);
    } else {
      // DB no disponible, usar detección automática
      lang = detectLanguage(context);
    }
  } catch (error) {
    // Error al acceder a DB, usar detección automática
    lang = detectLanguage(context);
    logger.debug(`Usando detección automática de idioma: ${lang}`);
  }
  
  return (key, vars = {}) => {
    // Intentar obtener traducción en el idioma detectado
    let text = data.responses?.[lang]?.[key] || data.responses?.en?.[key] || key;
    
    // Interpolación de variables
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    
    return text;
  };
}

/**
 * Detectar idioma basado en el contexto del usuario/servidor
 */
function detectLanguage(context) {
  // 1. Locale del usuario (interacciones)
  if (context.locale) {
    if (context.locale.startsWith("es")) return "es";
    if (context.locale.startsWith("pt")) return "pt";
    if (context.locale.startsWith("fr")) return "fr";
    if (context.locale.startsWith("de")) return "de";
  }
  
  // 2. Locale del servidor
  if (context.guild?.preferredLocale) {
    if (context.guild.preferredLocale.startsWith("es")) return "es";
    if (context.guild.preferredLocale.startsWith("pt")) return "pt";
    if (context.guild.preferredLocale.startsWith("fr")) return "fr";
    if (context.guild.preferredLocale.startsWith("de")) return "de";
  }
  
  // 3. Default: inglés
  return "en";
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