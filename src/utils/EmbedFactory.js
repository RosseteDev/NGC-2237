// src/utils/EmbedFactory.js

import { EmbedBuilder } from "discord.js";

export default class EmbedFactory {
  // ========================================
  // EMBEDS BÁSICOS (80% de casos)
  // ========================================
  
  static success(title, description, fields = []) {
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`✅ ${title}`)
      .setTimestamp();
    
    if (description) embed.setDescription(description);
    if (fields.length > 0) embed.addFields(fields);
    
    return embed;
  }
  
  static error(title, description, fields = []) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`❌ ${title}`)
      .setTimestamp();
    
    if (description) embed.setDescription(description);
    if (fields.length > 0) embed.addFields(fields);
    
    return embed;
  }
  
  static warning(title, description, fields = []) {
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`⚠️ ${title}`)
      .setTimestamp();
    
    if (description) embed.setDescription(description);
    if (fields.length > 0) embed.addFields(fields);
    
    return embed;
  }
  
  static info(title, description, fields = []) {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`ℹ️ ${title}`)
      .setTimestamp();
    
    if (description) embed.setDescription(description);
    if (fields.length > 0) embed.addFields(fields);
    
    return embed;
  }
  
  // ========================================
  // EMBEDS ESPECIALIZADOS (casos complejos)
  // ========================================
  
  /**
   * Embed para música (Now Playing)
   */
  static music(track, queuePosition = null) {
    const isStream = track.info.isStream;
    const duration = isStream 
      ? "🔴 EN VIVO" 
      : this.formatDuration(track.info.length);
    
    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle(queuePosition ? "🎵 Añadido a la cola" : "🎵 Reproduciendo")
      .setDescription(`**[${track.info.title}](${track.info.uri})**`)
      .addFields(
        { name: "Autor", value: track.info.author || "Desconocido", inline: true },
        { name: "Duración", value: duration, inline: true }
      )
      .setTimestamp();
    
    if (queuePosition) {
      embed.addFields({ 
        name: "Posición", 
        value: `#${queuePosition}`, 
        inline: true 
      });
    }
    
    // Thumbnail de YouTube
    if (track.info.uri?.includes("youtube.com") || track.info.uri?.includes("youtu.be")) {
      const videoId = track.info.identifier || track.info.uri.split("v=")[1]?.split("&")[0];
      if (videoId) {
        embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`);
      }
    }
    
    return embed;
  }
  
  /**
   * Embed para cola de música
   */
  static queue(tracks, currentTrack, page = 1, perPage = 10) {
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageItems = tracks.slice(start, end);
    const totalPages = Math.ceil(tracks.length / perPage);
    
    let description = `**🎵 Reproduciendo:**\n[${currentTrack.info.title}](${currentTrack.info.uri})\n\n`;
    
    if (pageItems.length > 0) {
      description += `**📋 En cola (${tracks.length} canciones):**\n`;
      description += pageItems.map((t, i) => {
        const pos = start + i + 1;
        return `\`${pos}.\` [${t.info.title}](${t.info.uri}) - ${this.formatDuration(t.info.length)}`;
      }).join("\n");
    } else {
      description += "\n*La cola está vacía*";
    }
    
    return new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle("🎶 Cola de Reproducción")
      .setDescription(description)
      .setFooter({ text: `Página ${page}/${totalPages}` })
      .setTimestamp();
  }
  
  /**
   * Embed para perfil de usuario
   */
  static userProfile(user, data) {
    const { level, xp, nextLevelXP, balance, rank } = data;
    
    return new EmbedBuilder()
      .setColor(0x7289da)
      .setTitle(`📊 Perfil de ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { 
          name: "💰 Dinero", 
          value: `${balance.toLocaleString()} monedas`, 
          inline: true 
        },
        { 
          name: "⭐ Nivel", 
          value: `${level}`, 
          inline: true 
        },
        { 
          name: "🏆 Ranking", 
          value: `#${rank}`, 
          inline: true 
        },
        { 
          name: "📈 Experiencia", 
          value: `${xp}/${nextLevelXP} XP\n${this.progressBar(xp, nextLevelXP)}` 
        }
      )
      .setFooter({ text: `ID: ${user.id}` })
      .setTimestamp();
  }
  
  /**
   * Embed para comandos de ayuda
   */
  static help(commands, prefix) {
    const categories = {};
    
    // Agrupar por categoría
    for (const [name, cmd] of commands) {
      const category = cmd.category || "General";
      if (!categories[category]) categories[category] = [];
      
      categories[category].push({
        name: name,
        description: cmd.data.description,
        aliases: cmd.aliases || []
      });
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("📚 Lista de Comandos")
      .setDescription(`Usa \`${prefix}help <comando>\` para más info`)
      .setTimestamp();
    
    // Agregar cada categoría como field
    for (const [category, cmds] of Object.entries(categories)) {
      const cmdList = cmds.map(c => `\`${c.name}\``).join(", ");
      embed.addFields({
        name: `${this.getCategoryEmoji(category)} ${category}`,
        value: cmdList,
        inline: false
      });
    }
    
    return embed;
  }
  
  /**
   * Embed para comando específico
   */
  static commandHelp(command, prefix) {
    const aliases = command.aliases?.length 
      ? command.aliases.map(a => `\`${a}\``).join(", ")
      : "Ninguno";
    
    const usage = command.data.options?.map(opt => {
      const name = opt.name;
      return opt.required ? `<${name}>` : `[${name}]`;
    }).join(" ") || "";
    
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📖 ${command.data.name}`)
      .setDescription(command.data.description)
      .addFields(
        { name: "Uso", value: `\`${prefix}${command.data.name} ${usage}\``, inline: false },
        { name: "Aliases", value: aliases, inline: true },
        { name: "Categoría", value: command.category || "General", inline: true }
      )
      .setTimestamp();
  }
  
  // ========================================
  // UTILIDADES
  // ========================================
  
  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}:${remainMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  
  static progressBar(current, max, length = 15) {
    const percentage = Math.min(current / max, 1);
    const filled = Math.floor(percentage * length);
    const empty = length - filled;
    
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${(percentage * 100).toFixed(1)}%`;
  }
  
  static getCategoryEmoji(category) {
    const emojis = {
      "music": "🎵",
      "moderation": "🛡️",
      "utility": "🔧",
      "fun": "🎮",
      "economy": "💰",
      "settings": "⚙️"
    };
    
    return emojis[category.toLowerCase()] || "📁";
  }
}