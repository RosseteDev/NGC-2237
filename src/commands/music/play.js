import { SlashCommandBuilder } from "discord.js";
import { useLang } from "../../localization/useLang.js";
import {
  queues,
  buildSearchIdentifier,
  createNowPlayingEmbed,
  createQueuedEmbed
} from "./utils.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setNameLocalizations({
    "es-ES": "reproducir",
    "es-419": "reproducir"
  })
  .setDescription("Play music")
  .setDescriptionLocalizations({
    "es-ES": "Reproduce música",
    "es-419": "Reproduce música"
  })
  .addStringOption(option =>
    option
      .setName("query")
      .setNameLocalizations({
        "es-ES": "busqueda",
        "es-419": "busqueda"
      })
      .setDescription("Song name or URL")
      .setDescriptionLocalizations({
        "es-ES": "Nombre o URL de la canción",
        "es-419": "Nombre o URL de la canción"
      })
      .setRequired(true)
  );

// ✅ Aliases para prefix commands
export const aliases = ["p", "tocar", "poner", "reproducir"];

export async function execute(interaction) {
  const { member, guild, client } = interaction;
  const t = await useLang(interaction);

  try {
    const query = interaction.options.getString("query", true);

    if (!member?.voice?.channel) {
      return interaction.reply({
        content: t("utility.music.errors.voice_required"), // ✅ Cambiado
        ephemeral: true
      });
    }

    const shoukaku = client.lavalink?.shoukaku;
    if (!shoukaku) {
      return interaction.reply({
        content: t("utility.music.errors.system_unavailable"), // ✅ Cambiado
        ephemeral: true
      });
    }

    const node = shoukaku.getIdealNode();
    
    if (!node) {
      return interaction.reply({
        content: t("utility.music.errors.no_nodes"), // ✅ Cambiado
        ephemeral: true
      });
    }

    await interaction.deferReply();

    let result;
    const identifier = buildSearchIdentifier(query);

    try {
      result = await node.rest.resolve(identifier);
    } catch (error) {
      console.error("Error en búsqueda:", error);
      
      if (!/^https?:\/\//.test(query)) {
        try {
          result = await node.rest.resolve(`scsearch:${query}`);
        } catch (scError) {
          console.error("Error en SoundCloud:", scError);
        }
      }
    }

    let tracks = [];

    switch (result?.loadType) {
      case "track":
        tracks = [result.data];
        break;
      case "search":
        tracks = result.data;
        break;
      case "playlist":
        tracks = result.data.tracks;
        break;
    }

    if (!tracks.length) {
      return interaction.editReply({
        content: t("utility.music.errors.no_results", { query }) // ✅ Cambiado
      });
    }

    const track = tracks[0];

    let player = shoukaku.players.get(guild.id);

    if (!player) {
      try {
        player = await shoukaku.joinVoiceChannel({
          guildId: guild.id,
          channelId: member.voice.channel.id,
          shardId: guild.shardId ?? 0,
          deaf: true
        });
        
        console.log(`🔊 Conectado al canal de voz en ${guild.name}`);
      } catch (error) {
        console.error("Error al conectar al canal de voz:", error);
        return interaction.editReply({
          content: t("utility.music.errors.system_unavailable") // ✅ Cambiado
        });
      }
    }

    let queue = queues.get(guild.id);

    if (!queue) {
      queue = {
        playing: false,
        tracks: [],
        textChannel: interaction.channel,
        originalInteraction: interaction,
        interactionHandled: false
      };
      queues.set(guild.id, queue);
      
      console.log(`📋 Nueva cola creada para ${guild.name}`);
    }

    queue.tracks.push(track);
    console.log(`➕ Canción añadida a la cola. Total en cola: ${queue.tracks.length}`);

    if (queue.playing) {
      const embed = createQueuedEmbed(track, queue.tracks.length, t);
      await interaction.editReply({ embeds: [embed] });
      queue.interactionHandled = true;
      return;
    }

    // ✅ Función playNext dentro del scope
    async function playNext() {
      console.log(`🎵 playNext() llamado. Canciones en cola: ${queue.tracks.length}`);
      
      const next = queue.tracks.shift();

      if (!next) {
        console.log(`ℹ️ Cola vacía. Deteniendo reproducción.`);
        queue.playing = false;
        return;
      }

      queue.playing = true;
      console.log(`▶️ Reproduciendo: ${next.info.title}`);

      try {
        await player.playTrack({ 
          track: { 
            encoded: next.encoded 
          } 
        });

        const embed = createNowPlayingEmbed(next, t);

        if (!queue.interactionHandled && queue.originalInteraction) {
          await queue.originalInteraction.editReply({ embeds: [embed] });
          queue.interactionHandled = true;
        } else {
          queue.textChannel?.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error("❌ Error al reproducir:", error);
        queue.playing = false;
        
        if (!queue.interactionHandled && queue.originalInteraction) {
          await queue.originalInteraction.editReply({
            content: t("utility.music.errors.playback_failed") // ✅ Cambiado
          });
          queue.interactionHandled = true;
        } else {
          queue.textChannel?.send({
            content: `⚠️ Error reproduciendo: **${next.info.title}**\nIntentando siguiente...`
          });
        }
        
        await playNext();
      }
    }

    // ✅ Limpiar listeners anteriores
    player.removeAllListeners("end");
    player.removeAllListeners("exception");

    // ✅ CORREGIDO: Evento END ahora maneja "stopped" correctamente
    player.on("end", async (data) => {
      console.log(`🎵 Evento END recibido. Razón: ${data.reason}`);
      
      if (data.reason === "finished" || 
          data.reason === "loadFailed" || 
          data.reason === "stopped") {
        
        if (queue.tracks.length > 0) {
          console.log(`▶️ Continuando a la siguiente canción...`);
          await playNext();
        } else {
          console.log(`ℹ️ No hay más canciones en cola.`);
          queue.playing = false;
        }
      } else {
        console.log(`⸻ Reproducción detenida. Razón: ${data.reason}`);
        queue.playing = false;
      }
    });

    // ✅ Evento EXCEPTION
    player.on("exception", async (data) => {
      console.error("⚠️ Playback exception:", {
        track: data.track?.info?.title,
        error: data.exception?.message
      });
      
      queue.textChannel?.send({
        content: `⚠️ Error reproduciendo: **${data.track?.info?.title || 'Desconocido'}**\nIntentando siguiente canción...`
      });
      
      await playNext();
    });

    // ✅ Iniciar reproducción
    console.log(`🚀 Iniciando reproducción...`);
    await playNext();

  } catch (error) {
    console.error("💥 Error en /play:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: t("utility.music.errors.unexpected") // ✅ Cambiado
      });
    }
  }
}