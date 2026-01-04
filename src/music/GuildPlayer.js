export default class GuildPlayer {
  constructor(node, guildId) {
    this.node = node;
    this.guildId = guildId;
    this.player = null;
    this.queue = [];
  }

  async connect(voiceChannelId, textChannelId) {
    this.player = await this.node.joinChannel({
      guildId: this.guildId,
      channelId: voiceChannelId,
      shardId: 0,
      deaf: true
    });

    this.player.on("end", () => {
      this.playNext();
    });
  }

  async play(track) {
    this.queue.push(track);
    if (!this.player.playing) {
      this.playNext();
    }
  }

  async playNext() {
    const next = this.queue.shift();
    if (!next) return this.player.stop();

    await this.player.playTrack({ track: next.encoded });
  }

  stop() {
    this.queue = [];
    this.player.stop();
  }

  disconnect() {
    this.queue = [];
    this.player.disconnect();
  }
}
