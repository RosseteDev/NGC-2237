// commands/cachestats.js - Ver rendimiento del cache

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { db } from "../../database/manager.js";

export const data = new SlashCommandBuilder()
  .setName("cachestats")
  .setDescription("View cache performance statistics");

export async function execute(interaction) {
  const stats = await db.getSystemStats();
  
  const embed = new EmbedBuilder()
    .setTitle("📊 Cache Statistics")
    .setColor(0x00ff00)
    .addFields(
      { 
        name: "Hit Rate", 
        value: `${stats.cache.hitRate} (${stats.cache.hits}/${stats.cache.total})`,
        inline: true
      },
      {
        name: "Cache Misses",
        value: `${stats.cache.misses}`,
        inline: true
      },
      {
        name: "Guild Settings Cached",
        value: `${stats.cache.caches.guildSettings.size} servers`,
        inline: true
      },
      {
        name: "User Settings Cached",
        value: `${stats.cache.caches.userSettings.size} users`,
        inline: true
      },
      {
        name: "Economy Cached",
        value: `${stats.cache.caches.economy.size} users`,
        inline: true
      },
      {
        name: "Levels Cached",
        value: `${stats.cache.caches.levels.size} users`,
        inline: true
      },
      {
        name: "Pending Analytics",
        value: `${stats.analytics.total} records (${stats.analytics.messages} msgs, ${stats.analytics.commands} cmds)`
      }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}