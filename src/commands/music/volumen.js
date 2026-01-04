import { buildCommand } from "../../utils/commandBuilder.js";
import { useLang } from "../../localization/useLang.js";

export const data = buildCommand({
  name: "volume",
  description: "Adjust volume",
  category: "music",
  aliases: ["vol"], // Alias manual
  autoLocalizeAliases: true, // Auto: volumen
  options: [
    {
      type: "integer",
      name: "level",
      description: "Volume level (0-100)",
      required: true,
      min: 0,
      max: 100
    }
  ]
});

export async function execute(interaction) {
  const t = await useLang(interaction);
  const { guild, client } = interaction;

  const level = interaction.options.getInteger("level");

  if (!guild.voiceConnection) {
    return interaction.reply({
      content: t("music.errors.not_playing"),
      ephemeral: true
    });
  }

  const shoukaku = client.lavalink?.shoukaku;
  const player = shoukaku?.players.get(guild.id);

  if (!player) {
    return interaction.reply({
      content: t("music.errors.not_playing"),
      ephemeral: true
    });
  }

  await player.setGlobalVolume(level);

  await interaction.reply({
    content: t("music.messages.volume_changed", { volume: level })
  });
}