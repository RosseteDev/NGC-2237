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

export async function execute(interaction) {
  const { member, guild, client } = interaction;
  const t = await useLang(interaction);

  try {
    const query = interaction.options.getString("query", true);

    if (!member?.voice?.channel) {
      return interaction.reply({
        content: t("music.errors.voice_required"),
        ephemeral: true
      });
    }

    const shoukaku = client.lavalink?.shoukaku;
    if (!shoukaku) {
      return interaction.reply({
        content: t("music.errors.system_unavailable"),
        ephemeral: true
      });
    }

    const node = shoukaku.getIdealNode();
    
    if (!node) {
      return interaction.reply({
        content: t("music.errors.no_nodes"),
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
        content: t("music.errors.no_results", { query })
      });
    }

    const track = tracks[0];

    let player = shoukaku.players.get(guild.id);

    if (!player) {
      player = await shoukaku.joinVoiceChannel({
        guildId: guild.id,
        channelId: member.voice.channel.id,
        shardId: guild.shardId ?? 0,
        deaf: true
      });
    }

    let queue = queues.get(guild.id);

    if (!queue) {
      queue = {
        playing: false,
        tracks: [],
        textChannel: interaction.channel,
        // ✅ NUEVO: Guardar la interacción original
        originalInteraction: interaction,
        interactionHandled: false
      };
      queues.set(guild.id, queue);
    }

    queue.tracks.push(track);

    // ✅ Si ya está reproduciendo, responde y marca como manejado
    if (queue.playing) {
      const embed = createQueuedEmbed(track, queue.tracks.length, t);
      await interaction.editReply({ embeds: [embed] });
      queue.interactionHandled = true;
      return;
    }

    async function playNext() {
      const next = queue.tracks.shift();

      if (!next) {
        queue.playing = false;
        return;
      }

      queue.playing = true;

      try {
        await player.playTrack({ 
          track: { 
            encoded: next.encoded 
          } 
        });

        const embed = createNowPlayingEmbed(next, t);

        // ✅ CLAVE: Editar la interacción diferida la primera vez
        if (!queue.interactionHandled && queue.originalInteraction) {
          await queue.originalInteraction.editReply({ embeds: [embed] });
          queue.interactionHandled = true;
        } else {
          // Para canciones subsecuentes, enviar nuevo mensaje
          queue.textChannel?.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error("Error al reproducir:", error);
        queue.playing = false;
        
        // ✅ Si falla la primera canción, manejar la interacción
        if (!queue.interactionHandled && queue.originalInteraction) {
          await queue.originalInteraction.editReply({
            content: t("music.errors.playback_failed")
          });
          queue.interactionHandled = true;
        }
        
        await playNext();
      }
    }

    player.removeAllListeners("end");
    player.removeAllListeners("exception");

    player.on("end", async (data) => {
      if (data.reason !== "replaced" && data.reason !== "stopped") {
        await playNext();
      }
    });

    player.on("exception", async (data) => {
      console.error("Playback exception:", data);
      await playNext();
    });

    await playNext();

  } catch (error) {
    console.error("💥 Error en /play:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: t("music.errors.unexpected")
      });
    }
  }
}