// src/commands/music/play.js

import { buildCommand } from "../../utils/CommandBuilder.js";
import { createLogger } from "../../utils/Logger.js";
import { queues, buildSearchIdentifier } from "./utils.js";

// ✅ Logger específico para este comando
const logger = createLogger("music:play");

// ✅ Construir comando desde JSON
export const data = buildCommand("music", "play");

/**
 * Helper para obtener traducciones
 */
function getTranslator(context) {
  const lang = context.locale?.startsWith("es") ? "es" : "en";
  
  return (key, vars = {}) => {
    let text = data.responses[lang]?.[key] || key;
    
    // Interpolación de variables
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    
    return text;
  };
}

/**
 * Ejecución principal
 */
export async function execute(context) {
  // ✅ Debug: Información inicial
  logger.group("🎵 Comando Play Iniciado", () => {
    logger.debug(`Usuario: ${context.user.tag} (${context.user.id})`);
    logger.debug(`Servidor: ${context.guild?.name} (${context.guild?.id})`);
    logger.debug(`Canal: ${context.channel?.name} (${context.channel?.id})`);
    logger.debug(`Locale: ${context.locale}`);
  });
  
  const { member, guild, client, channel } = context;
  const t = getTranslator(context);
  
  try {
    const query = context.options.getString("query", true);
    logger.info(`🔍 Query: "${query}"`);
    
    // ========================================
    // VALIDACIONES
    // ========================================
    
    logger.debug("Validando precondiciones...");
    
    // Validar canal de voz del usuario
    if (!member?.voice?.channel) {
      logger.debug("❌ Usuario no está en canal de voz");
      return context.reply({
        content: t("no_voice"),
        ephemeral: true
      });
    }
    
    logger.debug(`✅ Usuario en canal: ${member.voice.channel.name}`);
    
    // Validar Shoukaku
    const shoukaku = client.lavalink?.shoukaku;
    if (!shoukaku) {
      logger.error("❌ Shoukaku no disponible");
      return context.reply({
        content: t("system_unavailable"),
        ephemeral: true
      });
    }
    
    logger.debug("✅ Shoukaku disponible");
    
    // Obtener nodo ideal
    const node = shoukaku.getIdealNode();
    if (!node) {
      logger.error("❌ Sin nodos de Lavalink disponibles");
      return context.reply({
        content: t("no_nodes"),
        ephemeral: true
      });
    }
    
    logger.info(`✅ Nodo seleccionado: ${node.name}`);
    
    // Defer reply (mostrar "pensando...")
    await context.deferReply();
    logger.debug("⏳ Reply diferido");
    
    // ========================================
    // BÚSQUEDA EN LAVALINK
    // ========================================
    
    const identifier = buildSearchIdentifier(query);
    logger.debug(`🔍 Identificador de búsqueda: ${identifier}`);
    
    logger.time("Búsqueda en Lavalink");
    
    let result;
    try {
      result = await node.rest.resolve(identifier);
      logger.timeEnd("Búsqueda en Lavalink");
      
      logger.group("📦 Resultado de búsqueda", () => {
        logger.debug(`Tipo: ${result?.loadType}`);
        logger.debug(`Datos: ${result?.data ? 'Presente' : 'Ausente'}`);
      });
      
    } catch (error) {
      logger.error("❌ Error en búsqueda de Lavalink", error);
      
      // Fallback a SoundCloud si no es URL
      if (!/^https?:\/\//.test(query)) {
        logger.debug("🔄 Intentando fallback a SoundCloud...");
        
        try {
          result = await node.rest.resolve(`scsearch:${query}`);
          logger.info("✅ Resultado encontrado en SoundCloud");
        } catch (scError) {
          logger.error("❌ Fallback a SoundCloud falló", scError);
          throw scError;
        }
      } else {
        throw error;
      }
    }
    
    // ========================================
    // PROCESAR RESULTADOS
    // ========================================
    
    logger.debug("🎵 Procesando resultados...");
    
    let tracks = [];
    let playlistInfo = null;
    
    switch (result?.loadType) {
      case "track":
        tracks = [result.data];
        logger.debug("✅ 1 track encontrado");
        break;
        
      case "search":
        tracks = result.data;
        logger.debug(`✅ ${tracks.length} tracks encontrados en búsqueda`);
        break;
        
      case "playlist":
        tracks = result.data.tracks;
        playlistInfo = {
          name: result.data.info?.name || "Unknown Playlist",
          count: tracks.length
        };
        logger.info(`✅ Playlist: ${playlistInfo.name} (${playlistInfo.count} tracks)`);
        break;
        
      default:
        logger.warn(`⚠️ Tipo de carga desconocido: ${result?.loadType}`);
    }
    
    // Validar que hay resultados
    if (!tracks.length) {
      logger.debug("❌ Sin resultados para mostrar");
      return context.editReply({
        content: t("no_results", { query })
      });
    }
    
    const track = tracks[0];
    
    // ✅ Log detallado del track
    logger.group("🎵 Track Seleccionado", () => {
      logger.debug(`Título: ${track.info.title}`);
      logger.debug(`Autor: ${track.info.author}`);
      logger.debug(`Duración: ${track.info.length}ms (${formatDuration(track.info.length)})`);
      logger.debug(`URL: ${track.info.uri}`);
      logger.debug(`Stream: ${track.info.isStream ? "Sí" : "No"}`);
      logger.debug(`Identificador: ${track.info.identifier}`);
    });
    
    // ========================================
    // CONECTAR A VOZ
    // ========================================
    
    let player = shoukaku.players.get(guild.id);
    
    if (!player) {
      logger.debug("🔌 Conectando a canal de voz...");
      logger.time("Conexión a voz");
      
      try {
        player = await shoukaku.joinVoiceChannel({
          guildId: guild.id,
          channelId: member.voice.channel.id,
          shardId: guild.shardId ?? 0,
          deaf: true
        });
        
        logger.timeEnd("Conexión a voz");
        logger.info(`🔊 Conectado a: ${member.voice.channel.name}`);
        
      } catch (error) {
        logger.error("❌ Error conectando a voz", error);
        return context.editReply({
          content: t("connection_failed")
        });
      }
    } else {
      logger.debug(`✅ Ya conectado a: ${player.connection.channelId}`);
    }
    
    // ========================================
    // GESTIÓN DE COLA
    // ========================================
    
    logger.debug("📋 Gestionando cola...");
    
    let queue = queues.get(guild.id);
    
    if (!queue) {
      logger.debug("📝 Creando nueva cola");
      queue = {
        playing: false,
        tracks: [],
        textChannel: channel,
        originalContext: context,
        contextHandled: false
      };
      queues.set(guild.id, queue);
    }
    
    // Añadir track(s) a la cola
    if (playlistInfo) {
      // Es una playlist
      queue.tracks.push(...tracks);
      logger.info(`✅ ${tracks.length} tracks añadidos a la cola`);
      
      await context.editReply({
        content: t("playlist_added", {
          count: playlistInfo.count,
          name: playlistInfo.name
        })
      });
      queue.contextHandled = true;
      
    } else {
      // Es un solo track
      queue.tracks.push(track);
      logger.debug(`✅ Track añadido. Cola: ${queue.tracks.length} tracks`);
    }
    
    // Si ya está reproduciendo, solo confirmar adición
    if (queue.playing) {
      logger.debug("▶️ Ya hay reproducción activa, añadiendo a cola");
      
      if (!playlistInfo) {
        const embed = context.embeds.music(track, queue.tracks.length);
        await context.editReply({ embeds: [embed] });
        queue.contextHandled = true;
      }
      
      return;
    }
    
    // ========================================
    // FUNCIÓN DE REPRODUCCIÓN
    // ========================================
    
    async function playNext() {
      const queueLength = queue.tracks.length;
      logger.debug(`▶️ playNext() - Cola: ${queueLength} tracks`);
      
      const next = queue.tracks.shift();
      
      if (!next) {
        logger.info("🏁 Cola vacía, deteniendo reproducción");
        queue.playing = false;
        return;
      }
      
      queue.playing = true;
      
      logger.group("🎵 Reproduciendo Track", () => {
        logger.info(`Título: ${next.info.title}`);
        logger.debug(`Autor: ${next.info.author}`);
        logger.debug(`Duración: ${formatDuration(next.info.length)}`);
      });
      
      try {
        logger.time("Inicio de reproducción");
        
        await player.playTrack({ 
          track: { encoded: next.encoded } 
        });
        
        logger.timeEnd("Inicio de reproducción");
        logger.info("✅ Reproducción iniciada correctamente");
        
        // Enviar embed
        const embed = context.embeds.music(next);
        
        if (!queue.contextHandled && queue.originalContext) {
          await queue.originalContext.editReply({ embeds: [embed] });
          queue.contextHandled = true;
        } else {
          queue.textChannel?.send({ embeds: [embed] });
        }
        
      } catch (error) {
        logger.error("❌ Error reproduciendo track", error);
        queue.playing = false;
        
        // Notificar error
        if (!queue.contextHandled && queue.originalContext) {
          await queue.originalContext.editReply({
            content: t("playback_failed")
          });
          queue.contextHandled = true;
        } else {
          queue.textChannel?.send({
            content: `⚠️ Error: **${next.info.title}**`
          });
        }
        
        // Intentar siguiente canción
        logger.debug("🔄 Intentando siguiente track...");
        await playNext();
      }
    }
    
    // ========================================
    // EVENT LISTENERS
    // ========================================
    
    logger.debug("🎧 Configurando event listeners...");
    
    // Limpiar listeners anteriores
    player.removeAllListeners("end");
    player.removeAllListeners("exception");
    
    // Evento: Track terminado
    player.on("end", async (data) => {
      logger.group("⏹️ Evento END", () => {
        logger.debug(`Razón: ${data.reason}`);
        logger.debug(`Cola restante: ${queue.tracks.length} tracks`);
      });
      
      if (["finished", "loadFailed", "stopped"].includes(data.reason)) {
        if (queue.tracks.length > 0) {
          logger.debug("▶️ Continuando con siguiente track");
          await playNext();
        } else {
          logger.info("🏁 Cola terminada");
          queue.playing = false;
        }
      } else {
        logger.debug(`⏸️ Reproducción detenida: ${data.reason}`);
        queue.playing = false;
      }
    });
    
    // Evento: Excepción durante reproducción
    player.on("exception", async (data) => {
      logger.error("💥 Excepción en playback", data.exception);
      
      queue.textChannel?.send({
        content: `⚠️ Error: **${data.track?.info?.title || 'Desconocido'}**`
      });
      
      logger.debug("🔄 Intentando siguiente track tras excepción");
      await playNext();
    });
    
    logger.debug("✅ Event listeners configurados");
    
    // ========================================
    // INICIAR REPRODUCCIÓN
    // ========================================
    
    logger.info("🚀 Iniciando reproducción...");
    logger.time("Tiempo total de ejecución");
    
    await playNext();
    
    logger.timeEnd("Tiempo total de ejecución");
    logger.info("✅ Comando play completado exitosamente");
    
  } catch (error) {
    logger.error("💥 Error general en comando play", error);
    
    // Intentar responder al usuario
    try {
      const errorMessage = t("system_unavailable");
      
      if (context.deferred || context.replied) {
        await context.editReply({ content: errorMessage });
      } else {
        await context.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      logger.error("❌ No se pudo enviar mensaje de error al usuario", replyError);
    }
  }
}

/**
 * Helper: Formatear duración
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}:${remainMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}