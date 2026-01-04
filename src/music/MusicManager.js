import GuildPlayer from "./GuildPlayer.js";

class MusicManager {
  static players = new Map();

  static get(guild) {
    if (!this.players.has(guild.id)) {
      this.players.set(guild.id, new GuildPlayer(guild));
    }
    return this.players.get(guild.id);
  }

  static destroy(guildId) {
    this.players.delete(guildId);
  }
}

export default MusicManager;
