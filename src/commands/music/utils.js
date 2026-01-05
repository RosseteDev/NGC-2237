// ==========================================
// FILE: commands/music/utils.js
// ==========================================

import { EmbedBuilder } from "discord.js";

/* ======================
   COLAS POR SERVIDOR (COMPARTIDO)
====================== */
export const queues = new Map();

/* ======================
   UTILIDADES COMPARTIDAS
====================== */

export function cleanYouTubeUrl(input) {
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
    return input;
  } catch {
    return input;
  }
}

export function buildSearchIdentifier(query) {
  if (/^https?:\/\//.test(query)) {
    return cleanYouTubeUrl(query);
  }
  return `ytsearch:${query}`;
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function createNowPlayingEmbed(track, t) {
  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle(t("utility.music.embed.now_playing_title")) // ✅ Cambiado
    .setDescription(`**[${track.info.title}](${track.info.uri})**`)
    .addFields(
      {
        name: t("utility.music.embed.author"), // ✅ Cambiado
        value: track.info.author || t("utility.music.embed.unknown"), // ✅ Cambiado
        inline: true
      },
      {
        name: t("utility.music.embed.duration"), // ✅ Cambiado
        value: track.info.isStream 
          ? t("utility.music.embed.live") // ✅ Cambiado
          : formatDuration(track.info.length),
        inline: true
      }
    )
    .setTimestamp();

  if (track.info.uri?.includes("youtube.com") || track.info.uri?.includes("youtu.be")) {
    const videoId = track.info.identifier || track.info.uri.split("v=")[1]?.split("&")[0];
    if (videoId) {
      embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`);
    }
  }

  return embed;
}

export function createQueuedEmbed(track, position, t) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(t("utility.music.embed.added_title")) // ✅ Cambiado
    .setDescription(`**[${track.info.title}](${track.info.uri})**`)
    .addFields(
      {
        name: t("utility.music.embed.author"), // ✅ Cambiado
        value: track.info.author || t("utility.music.embed.unknown"), // ✅ Cambiado
        inline: true
      },
      {
        name: t("utility.music.embed.duration"), // ✅ Cambiado
        value: track.info.isStream 
          ? t("utility.music.embed.live") // ✅ Cambiado
          : formatDuration(track.info.length),
        inline: true
      },
      {
        name: t("utility.music.embed.position"), // ✅ Cambiado
        value: `${position}`,
        inline: true
      }
    )
    .setTimestamp();

  if (track.info.uri?.includes("youtube.com") || track.info.uri?.includes("youtu.be")) {
    const videoId = track.info.identifier || track.info.uri.split("v=")[1]?.split("&")[0];
    if (videoId) {
      embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`);
    }
  }

  return embed;
}