// src/commands/music/volumen.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("music:volume");

// ✅ SINTAXIS CORRECTA: buildCommand(category, commandName)
export const data = buildCommand("music", "volume");

export async function execute(context) {
  const { guild, client, member } = context;
  
  logger.debug(`Usuario: ${context.user.tag} en ${guild?.name}`);
  
  // Obtener nivel de volumen
  const level = context.options.getInteger("level", true);
  
  logger.debug(`Volumen solicitado: ${level}%`);
  
  // Validar que el usuario esté en voz
  if (!member?.voice?.channel) {
    logger.debug("Usuario no está en canal de voz");
    return context.reply({
      content: "❌ Debes estar en un canal de voz para usar este comando",
      ephemeral: true
    });
  }
  
  // Verificar Shoukaku
  const shoukaku = client.lavalink?.shoukaku;
  if (!shoukaku) {
    logger.error("Shoukaku no disponible");
    return context.reply({
      content: "❌ El sistema de música no está disponible",
      ephemeral: true
    });
  }
  
  // Obtener player
  const player = shoukaku.players.get(guild.id);
  
  if (!player) {
    logger.debug("No hay reproductor activo");
    return context.reply({
      content: "❌ No hay música reproduciéndose actualmente",
      ephemeral: true
    });
  }
  
  // Cambiar volumen
  try {
    await player.setGlobalVolume(level);
    logger.info(`Volumen cambiado a ${level}% por ${context.user.tag}`);
    
    await context.reply({
      content: `🔊 Volumen ajustado a **${level}%**`
    });
    
  } catch (error) {
    logger.error("Error cambiando volumen", error);
    return context.reply({
      content: "❌ No se pudo cambiar el volumen",
      ephemeral: true
    });
  }
}