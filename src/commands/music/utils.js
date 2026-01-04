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
    .setTitle(t("music.embed.now_playing_title"))
    .setDescription(`**[${track.info.title}](${track.info.uri})**`)
    .addFields(
      {
        name: t("music.embed.author"),
        value: track.info.author || t("music.embed.unknown"),
        inline: true
      },
      {
        name: t("music.embed.duration"),
        value: track.info.isStream 
          ? t("music.embed.live") 
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
    .setTitle(t("music.embed.added_title"))
    .setDescription(`**[${track.info.title}](${track.info.uri})**`)
    .addFields(
      {
        name: t("music.embed.author"),
        value: track.info.author || t("music.embed.unknown"),
        inline: true
      },
      {
        name: t("music.embed.duration"),
        value: track.info.isStream 
          ? t("music.embed.live") 
          : formatDuration(track.info.length),
        inline: true
      },
      {
        name: t("music.embed.position"),
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
