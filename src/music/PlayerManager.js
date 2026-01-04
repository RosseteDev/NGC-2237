import GuildPlayer from "./GuildPlayer.js";

export default class PlayerManager {
  constructor(client) {
    this.client = client;
    this.players = new Map();
  }

  async get(interaction) {
    const guildId = interaction.guild.id;
    const node = this.client.lavalink.getNode();

    let player = this.players.get(guildId);
    if (player) return player;

    player = new GuildPlayer(node, guildId);
    this.players.set(guildId, player);

    await player.connect(
      interaction.member.voice.channel.id,
      interaction.channel.id
    );

    return player;
  }

  destroy(guildId) {
    const player = this.players.get(guildId);
    if (!player) return;

    player.disconnect();
    this.players.delete(guildId);
  }
}
