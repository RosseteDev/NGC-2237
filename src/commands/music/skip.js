import { SlashCommandBuilder } from "discord.js";
import { useLang } from "../../localization/useLang.js";
import { queues } from "./utils.js";

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

// ✅ Aliases para prefix commands
export const aliases = ["s", "next", "saltar", "siguiente"];

export async function execute(interaction) {
  const t = await useLang(interaction);
  const { guild, member, client } = interaction;

  // ✅ Verificar que el usuario esté en un canal de voz
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

  // ✅ Obtener el player
  const player = shoukaku.players.get(guild.id);

  // ✅ Verificar si hay algo reproduciéndose
  if (!player) {
    return interaction.reply({
      content: t("music.errors.not_playing"),
      ephemeral: true
    });
  }

  // ✅ Obtener la cola
  const queue = queues.get(guild.id);

  // ✅ Verificar si hay algo reproduciéndose o en cola
  if (!queue || !queue.playing) {
    return interaction.reply({
      content: t("music.errors.not_playing"),
      ephemeral: true
    });
  }

  // ✅ Verificar si hay más canciones en la cola
  if (queue.tracks.length === 0) {
    // No hay más canciones, detener completamente
    player.stopTrack();
    queue.playing = false;
    
    return interaction.reply({
      content: "⏭️ **Canción saltada.** No hay más canciones en la cola."
    });
  }

  // ✅ Hay más canciones: detener para que el evento "end" reproduzca la siguiente
  player.stopTrack();

  // ✅ Responder al usuario
  await interaction.reply({
    content: t("music.messages.skip")
  });
}