// src/commands/music/play.js

import { buildCommand } from "../../utils/CommandBuilder.js";
import { useLang } from "../../localization/useLang.js";
import { createLogger } from "../../utils/Logger.js"; // ✨ NUEVO
import { queues, buildSearchIdentifier } from "./utils.js";

// ✨ Crear logger específico para este comando
const logger = createLogger("music:play");

export const data = buildCommand({
  name: "play",
  category: "music",
  cooldown: 3,
  options: [
    { type: "string", name: "query", required: true }
  ]
});

export async function execute(context) {
  logger.debug("Iniciando comando");
  logger.debug(`Usuario: ${context.user.tag}`);
  logger.debug(`Servidor: ${context.guild?.name}`);
  
  const { member, guild, client, channel } = context;
  const t = await useLang(context);

  try {
    const query = context.options.getString("query", true);
    logger.debug(`Query: "${query}"`);

    // ========================================
    // VALIDACIONES
    // ========================================
    
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

    const node = shoukaku.getIdealNode();
    if (!node) {
      logger.error("Sin nodos de Lavalink");
      return context.reply({
        content: t("music.errors.no_nodes"),
        ephemeral: true
      });
    }

    await context.deferReply();

    // ========================================
    // BÚSQUEDA
    // ========================================
    
    logger.time("Búsqueda en Lavalink");
    
    let result;
    const identifier = buildSearchIdentifier(query);
    logger.debug(`Identificador: ${identifier}`);

    try {
      result = await node.rest.resolve(identifier);
      logger.timeEnd("Búsqueda en Lavalink");
      logger.debug(`Tipo resultado: ${result?.loadType}`);
    } catch (error) {
      logger.error("Error en búsqueda Lavalink", error);
      
      if (!/^https?:\/\//.test(query)) {
        try {
          logger.debug("Intentando SoundCloud...");
          result = await node.rest.resolve(`scsearch:${query}`);
        } catch (scError) {
          logger.error("Error en SoundCloud", scError);
        }
      }
    }

    // ========================================
    // PROCESAR RESULTADOS
    // ========================================
    
    let tracks = [];
    switch (result?.loadType) {
      case "track":
        tracks = [result.data];
        logger.debug("1 track encontrado");
        break;
      case "search":
        tracks = result.data;
        logger.debug(`${tracks.length} tracks encontrados`);
        break;
      case "playlist":
        tracks = result.data.tracks;
        logger.debug(`Playlist: ${tracks.length} tracks`);
        break;
    }

    if (!tracks.length) {
      logger.debug("Sin resultados");
      return context.editReply({
        content: t("music.errors.no_results", { query })
      });
    }

    const track = tracks[0];
    
    // ✨ Grupo para mostrar detalles del track
    logger.group("Track seleccionado", () => {
      logger.debug(`Título: ${track.info.title}`);
      logger.debug(`Autor: ${track.info.author}`);
      logger.debug(`Duración: ${track.info.length}ms`);
      logger.debug(`URL: ${track.info.uri}`);
    });

    // ========================================
    // CONECTAR A VOZ
    // ========================================
    
    let player = shoukaku.players.get(guild.id);
    if (!player) {
      try {
        logger.debug("Conectando a canal de voz...");
        player = await shoukaku.joinVoiceChannel({
          guildId: guild.id,
          channelId: member.voice.channel.id,
          shardId: guild.shardId ?? 0,
          deaf: true
        });
        logger.info(`🔊 Conectado en ${guild.name}`);
      } catch (error) {
        logger.error("Error conectando a voz", error);
        return context.editReply({
          content: t("music.errors.system_unavailable")
        });
      }
    }

    // ========================================
    // GESTIÓN DE COLA
    // ========================================
    
    let queue = queues.get(guild.id);
    if (!queue) {
      logger.debug("Creando cola nueva");
      queue = {
        playing: false,
        tracks: [],
        textChannel: channel,
        originalContext: context,
        contextHandled: false
      };
      queues.set(guild.id, queue);
    }

    queue.tracks.push(track);
    logger.debug(`Cola: ${queue.tracks.length} tracks`);

    // Si ya está reproduciendo, solo añadir a la cola
    if (queue.playing) {
      logger.debug("Añadiendo a cola existente");
      const embed = context.embeds.music(track, queue.tracks.length);
      await context.editReply({ embeds: [embed] });
      queue.contextHandled = true;
      return;
    }

    // ========================================
    // FUNCIÓN DE REPRODUCCIÓN
    // ========================================
    
    async function playNext() {
      logger.debug(`playNext() - Cola: ${queue.tracks.length}`);
      
      const next = queue.tracks.shift();
      if (!next) {
        logger.debug("Cola vacía, deteniendo");
        queue.playing = false;
        return;
      }

      queue.playing = true;
      logger.info(`▶️ ${next.info.title}`);

      try {
        await player.playTrack({ 
          track: { encoded: next.encoded } 
        });

        const embed = context.embeds.music(next);

        if (!queue.contextHandled && queue.originalContext) {
          await queue.originalContext.editReply({ embeds: [embed] });
          queue.contextHandled = true;
        } else {
          queue.textChannel?.send({ embeds: [embed] });
        }
      } catch (error) {
        logger.error("Error reproduciendo", error);
        queue.playing = false;
        
        if (!queue.contextHandled && queue.originalContext) {
          await queue.originalContext.editReply({
            content: t("music.errors.playback_failed")
          });
          queue.contextHandled = true;
        } else {
          queue.textChannel?.send({
            content: `⚠️ Error: **${next.info.title}**`
          });
        }
        
        // Intentar siguiente canción
        await playNext();
      }
    }

    // ========================================
    // EVENT LISTENERS
    // ========================================
    
    player.removeAllListeners("end");
    player.removeAllListeners("exception");

    player.on("end", async (data) => {
      logger.debug(`Evento END: ${data.reason}`);
      
      if (["finished", "loadFailed", "stopped"].includes(data.reason)) {
        if (queue.tracks.length > 0) {
          logger.debug("Continuando con siguiente track");
          await playNext();
        } else {
          logger.debug("Cola terminada");
          queue.playing = false;
        }
      } else {
        logger.debug(`Reproducción detenida: ${data.reason}`);
        queue.playing = false;
      }
    });

    player.on("exception", async (data) => {
      logger.error("Excepción en playback", data.exception);
      
      queue.textChannel?.send({
        content: `⚠️ Error: **${data.track?.info?.title || 'Desconocido'}**`
      });
      
      await playNext();
    });

    // ========================================
    // INICIAR REPRODUCCIÓN
    // ========================================
    
    logger.debug("Iniciando reproducción");
    await playNext();

  } catch (error) {
    logger.error("Error general en comando play", error);
    
    if (context.deferred || context.replied) {
      await context.editReply({
        content: t("music.errors.unexpected")
      });
    }
  }
}