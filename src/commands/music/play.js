// src/commands/music/play.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createLogger } from "../../utils/Logger.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { queues, buildSearchIdentifier } from "./utils.js";

const logger = createLogger("music:play");

export const data = buildCommand("music", "play");

// ✅ FUNCIÓN DE AUTOCOMPLETADO
export async function autocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  
  if (focusedOption.name !== 'query') {
    return interaction.respond([]);
  }
  
  const query = focusedOption.value;
  
  if (!query || query.length < 2) {
    return interaction.respond([]);
  }
  
  if (/^https?:\/\//.test(query)) {
    return interaction.respond([]);
  }
  
  try {
    const shoukaku = interaction.client.lavalink?.shoukaku;
    if (!shoukaku) {
      return interaction.respond([]);
    }
    
    const node = shoukaku.getIdealNode();
    if (!node) {
      return interaction.respond([]);
    }
    
    const result = await node.rest.resolve(`ytsearch:${query}`);
    
    if (result?.loadType !== 'search' || !result.data?.length) {
      return interaction.respond([]);
    }
    
    const choices = result.data.slice(0, 10).map(track => {
      const duration = formatDuration(track.info.length);
      return {
        name: truncate(`${track.info.title} - ${track.info.author} [${duration}]`, 100),
        value: track.info.uri || track.info.identifier
      };
    });
    
    await interaction.respond(choices);
    
  } catch (error) {
    logger.error("Error en autocomplete:", error);
    await interaction.respond([]);
  }
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export async function execute(context) {
  logger.group("🎵 Comando Play Iniciado", () => {
    logger.debug(`Usuario: ${context.user.tag} (${context.user.id})`);
    logger.debug(`Servidor: ${context.guild?.name} (${context.guild?.id})`);
    logger.debug(`Canal: ${context.channel?.name} (${context.channel?.id})`);
  });
  
  const { member, guild, client, channel } = context;
  
  // ✅ USAR HELPER DE TRADUCCIÓN
  const t = await createTranslator(data, context);
  
  try {
    const query = context.options.getString("query", true);
    logger.info(`🔍 Query: "${query}"`);
    
    // VALIDACIONES
    if (!member?.voice?.channel) {
      logger.debug("❌ Usuario no está en canal de voz");
      return context.reply({
        content: t("no_voice"),
        ephemeral: true
      });
    }
    
    logger.debug(`✅ Usuario en canal: ${member.voice.channel.name}`);
    
    const shoukaku = client.lavalink?.shoukaku;
    if (!shoukaku) {
      logger.error("❌ Shoukaku no disponible");
      return context.reply({
        content: "❌ Music system is unavailable",
        ephemeral: true
      });
    }
    
    const node = shoukaku.getIdealNode();
    if (!node) {
      logger.error("❌ Sin nodos de Lavalink disponibles");
      return context.reply({
        content: "❌ No music nodes available",
        ephemeral: true
      });
    }
    
    logger.info(`✅ Nodo seleccionado: ${node.name}`);
    
    await context.deferReply();
    logger.debug("⏳ Reply diferido");
    
    // BÚSQUEDA EN LAVALINK
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
    
    // PROCESAR RESULTADOS
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
        
      case "error":
        logger.error("❌ Error de Lavalink:", result.data);
        return context.editReply({
          content: t("no_results", { query })
        });
        
      case "empty":
        logger.debug("❌ Búsqueda sin resultados");
        return context.editReply({
          content: t("no_results", { query })
        });
        
      default:
        logger.warn(`⚠️ Tipo de carga desconocido: ${result?.loadType}`);
    }
    
    if (!tracks.length) {
      logger.debug("❌ Sin resultados para mostrar");
      return context.editReply({
        content: t("no_results", { query })
      });
    }
    
    const track = tracks[0];
    
    logger.group("🎵 Track Seleccionado", () => {
      logger.debug(`Título: ${track.info.title}`);
      logger.debug(`Autor: ${track.info.author}`);
      logger.debug(`Duración: ${track.info.length}ms (${formatDuration(track.info.length)})`);
      logger.debug(`URL: ${track.info.uri}`);
    });
    
    // CONECTAR A VOZ
    let player = shoukaku.players.get(guild.id);
    
    if (!player) {
      logger.debug("🔌 Conectando a canal de voz...");
      
      try {
        player = await shoukaku.joinVoiceChannel({
          guildId: guild.id,
          channelId: member.voice.channel.id,
          shardId: guild.shardId ?? 0,
          deaf: true
        });
        
        logger.info(`🔊 Conectado a: ${member.voice.channel.name}`);
        
      } catch (error) {
        logger.error("❌ Error conectando a voz", error);
        return context.editReply({
          content: "❌ Failed to connect to voice channel"
        });
      }
    } else {
      logger.debug(`✅ Ya conectado al canal de voz`);
    }
    
    // GESTIÓN DE COLA
    logger.debug("📋 Gestionando cola...");
    
    let queue = queues.get(guild.id);
    
    if (!queue) {
      logger.debug("🆕 Creando nueva cola");
      queue = {
        playing: false,
        tracks: [],
        textChannel: channel,
        originalContext: context,
        contextHandled: false,
        listenersConfigured: false
      };
      queues.set(guild.id, queue);
    }
    
    // Añadir track(s) a la cola
    if (playlistInfo) {
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
      queue.tracks.push(track);
      logger.debug(`✅ Track añadido. Cola: ${queue.tracks.length} tracks`);
    }
    
    // Si ya está reproduciendo, solo confirmar adición
    if (queue.playing) {
      logger.debug("▶️ Ya hay reproducción activa, añadiendo a cola");
      
      if (!playlistInfo) {
        const position = queue.tracks.length;
        await context.editReply({
          content: t("added", {
            title: track.info.title,
            position: position
          })
        });
        queue.contextHandled = true;
      }
      
      return;
    }
    
    // FUNCIÓN DE REPRODUCCIÓN
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
        await player.playTrack({ 
          track: { encoded: next.encoded } 
        });
        
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
        
        if (!queue.contextHandled && queue.originalContext) {
          await queue.originalContext.editReply({
            content: "❌ Failed to play track"
          });
          queue.contextHandled = true;
        } else {
          queue.textChannel?.send({
            content: `⚠️ Error: **${next.info.title}**`
          });
        }
        
        logger.debug("🔄 Intentando siguiente track...");
        await playNext();
      }
    }
    
    // EVENT LISTENERS (SOLO UNA VEZ)
    if (!queue.listenersConfigured) {
      logger.debug("🎧 Configurando event listeners...");
      
      player.removeAllListeners("end");
      player.removeAllListeners("exception");
      
      player.on("end", async (data) => {
        logger.group("⏹️ Evento END", () => {
          logger.debug(`Razón: ${data.reason}`);
          logger.debug(`Cola restante: ${queue.tracks.length} tracks`);
        });
        
        const shouldContinue = ["finished", "loadFailed", "stopped"].includes(data.reason);
        
        if (shouldContinue) {
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
      
      player.on("exception", async (data) => {
        logger.error("💥 Excepción en playback", data.exception);
        
        queue.textChannel?.send({
          content: `⚠️ Error playing: **${data.track?.info?.title || 'Unknown'}**`
        });
        
        logger.debug("🔄 Intentando siguiente track tras excepción");
        await playNext();
      });
      
      queue.listenersConfigured = true;
      logger.debug("✅ Event listeners configurados");
    } else {
      logger.debug("✅ Event listeners ya configurados, reutilizando");
    }
    
    // INICIAR REPRODUCCIÓN
    logger.info("🚀 Iniciando reproducción...");
    await playNext();
    logger.info("✅ Comando play completado exitosamente");
    
  } catch (error) {
    logger.error("💥 Error general en comando play", error);
    
    try {
      const errorMessage = "❌ An error occurred while processing your request";
      
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