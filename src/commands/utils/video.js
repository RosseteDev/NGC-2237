import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType 
} from "discord.js";
import { useLang } from "../../localization/useLang.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FOLDER = path.join(__dirname, "..", "..", "video_cache");

// ✅ Configuración de cache
const CACHE_CONFIG = {
  MIN_VIDEOS: 10,
  FETCH_LIMIT: 1000,
  MAX_CACHE: 500
};

// ============================================
// FUNCIONES DE CACHE
// ============================================

async function ensureCacheFolder() {
  try {
    await fs.mkdir(CACHE_FOLDER, { recursive: true });
  } catch (error) {
    console.error("Error creando carpeta de caché:", error);
  }
}

async function loadCache(combinedTag) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const fileData = await fs.readFile(cacheFile, "utf-8");
    const parsed = JSON.parse(fileData);
    
    if (parsed && typeof parsed === 'object') {
      if (parsed.videos && Array.isArray(parsed.videos)) {
        return {
          videos: parsed.videos,
          lastPage: parsed.lastPage || 0
        };
      }
      if (Array.isArray(parsed)) {
        return {
          videos: parsed,
          lastPage: 0
        };
      }
    }
    
    return { videos: [], lastPage: 0 };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { videos: [], lastPage: 0 };
    }
    console.warn(`⚠️ Error leyendo cache ${combinedTag}:`, error.message);
    return { videos: [], lastPage: 0 };
  }
}

async function saveCache(combinedTag, videos, lastPage) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const limitedVideos = videos.slice(-CACHE_CONFIG.MAX_CACHE);
    const cacheData = {
      videos: limitedVideos,
      lastPage: lastPage,
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
    console.log(`💾 Cache guardado: ${combinedTag} (${limitedVideos.length} videos)`);
  } catch (error) {
    console.error("Error guardando caché:", error);
  }
}

// ============================================
// BÚSQUEDA DE VIDEOS
// ============================================

async function searchRule34Videos(tags, userId, apiKey, page = 0) {
  const tagsQuery = tags.join("+");
  const pid = page * CACHE_CONFIG.FETCH_LIMIT;
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tagsQuery}&limit=${CACHE_CONFIG.FETCH_LIMIT}&pid=${pid}&json=1&user_id=${userId}&api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    
    if (!text || text.trim() === '') {
      return [];
    }
    
    let apiData;
    try {
      apiData = JSON.parse(text);
    } catch (parseError) {
      console.error(`❌ Error parseando JSON`);
      return [];
    }
    
    if (!Array.isArray(apiData) || apiData.length === 0) {
      return [];
    }
    
    const videos = apiData
      .filter(post => {
        if (!post.file_url) return false;
        const videoExtensions = /\.(mp4|webm|mov|avi|mkv|flv|wmv)(\?.*)?$/i;
        const isVideo = videoExtensions.test(post.file_url);
        const isGif = post.file_url.includes('.gif');
        return isVideo || isGif;
      })
      .map(post => ({
        url: post.file_url,
        preview: post.preview_url || post.sample_url,
        id: post.id,
        score: post.score || 0,
        width: post.width || 0,
        height: post.height || 0,
        tags: post.tags || ''
      }));
    
    console.log(`✅ Encontrados ${videos.length} videos`);
    return videos;
    
  } catch (error) {
    console.error(`❌ Error en búsqueda:`, error.message);
    throw error;
  }
}

async function getVideos(tags, userId, apiKey) {
  const combinedTag = tags.join("_");
  const cache = await loadCache(combinedTag);
  const cachedVideos = cache.videos;
  const lastPage = cache.lastPage || 0;
  
  if (cachedVideos.length >= CACHE_CONFIG.MIN_VIDEOS) {
    return {
      videos: cachedVideos,
      fromCache: true,
      newCount: 0
    };
  }
  
  try {
    const results = await searchRule34Videos(tags, userId, apiKey, lastPage);
    
    if (results.length === 0) {
      return {
        videos: cachedVideos,
        fromCache: true,
        newCount: 0,
        exhausted: true
      };
    }
    
    const existingUrls = new Set(cachedVideos.map(v => v.url));
    const newVideos = results.filter(v => !existingUrls.has(v.url));
    const updatedCache = [...cachedVideos, ...newVideos];
    
    await saveCache(combinedTag, updatedCache, lastPage + 1);
    
    return {
      videos: updatedCache,
      fromCache: false,
      newCount: newVideos.length
    };
    
  } catch (error) {
    if (cachedVideos.length > 0) {
      return {
        videos: cachedVideos,
        fromCache: true,
        newCount: 0,
        error: error.message
      };
    }
    throw error;
  }
}

// ============================================
// AUTOCOMPLETADO - MEJORADO CON RETRY
// ============================================

async function autocompleteTags(interaction, current) {
  try {
    console.log(`🔍 [AUTOCOMPLETE] Buscando: "${current}"`);
    
    const parts = current.split(',').map(s => s.trim());
    const lastTag = parts[parts.length - 1];
    const previousTags = parts.slice(0, -1);
    
    if (!lastTag || lastTag.length < 2) {
      console.log(`⚠️ [AUTOCOMPLETE] Input muy corto`);
      return [];
    }
    
    // ✅ SOLUCIÓN: Múltiples intentos con diferentes métodos
    const suggestions = await fetchSuggestionsWithRetry(lastTag);
    
    if (!suggestions || suggestions.length === 0) {
      console.log(`📭 [AUTOCOMPLETE] Sin sugerencias`);
      return [];
    }
    
    const prefix = previousTags.length > 0 ? previousTags.join(', ') + ', ' : '';
    
    const choices = suggestions
      .slice(0, 25)
      .map(item => {
        const tag = typeof item === 'string' ? item : (item.value || item.label);
        const label = typeof item === 'object' && item.label ? item.label : tag;
        
        return {
          name: label.substring(0, 100),
          value: (prefix + tag).substring(0, 100)
        };
      });
    
    console.log(`✅ [AUTOCOMPLETE] ${choices.length} sugerencias listas`);
    return choices;
      
  } catch (error) {
    console.error('❌ [AUTOCOMPLETE] Error:', error.message);
    return [];
  }
}

// ✅ NUEVA FUNCIÓN: Intentar múltiples métodos para obtener sugerencias
async function fetchSuggestionsWithRetry(tag) {
  // Método 1: API oficial de autocomplete
  try {
    console.log(`🌐 [MÉTODO 1] Intentando API oficial...`);
    const url = `https://ac.rule34.xxx/autocomplete.php?q=${encodeURIComponent(tag)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://rule34.xxx/',
        'Origin': 'https://rule34.xxx'
      },
      signal: AbortSignal.timeout(3000) // 3 segundos timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0 && data[0] !== "error") {
        console.log(`✅ [MÉTODO 1] Éxito: ${data.length} sugerencias`);
        return data;
      }
    }
  } catch (error) {
    console.log(`⚠️ [MÉTODO 1] Falló: ${error.message}`);
  }
  
  // Método 2: Buscar tags populares que coincidan localmente
  try {
    console.log(`🌐 [MÉTODO 2] Usando tags populares...`);
    return getPopularTagsSuggestions(tag);
  } catch (error) {
    console.log(`⚠️ [MÉTODO 2] Falló: ${error.message}`);
  }
  
  return [];
}

// ✅ NUEVA FUNCIÓN: Fallback con tags populares
function getPopularTagsSuggestions(input) {
  const popularTags = [
    'animated', 'video', '3d', '2d', 'sound', 'loop',
    'anal', 'oral', 'vaginal', 'pov', 'first_person_view',
    'big_breasts', 'small_breasts', 'ass', 'pussy', 'penis',
    'cum', 'creampie', 'facial', 'handjob', 'blowjob',
    'lesbian', 'yuri', 'yaoi', 'futanari', 'trap',
    'milf', 'teen', 'young', 'old', 'mature',
    'furry', 'anthro', 'feral', 'pokemon', 'digimon',
    'overwatch', 'league_of_legends', 'final_fantasy', 'zelda',
    'naruto', 'one_piece', 'dragon_ball', 'bleach', 'fairy_tail',
    'ahegao', 'bdsm', 'bondage', 'tentacles', 'monster',
    'elf', 'demon', 'angel', 'catgirl', 'doggirl',
    'blonde', 'brunette', 'redhead', 'black_hair', 'white_hair',
    'long_hair', 'short_hair', 'ponytail', 'twin_tails',
    'glasses', 'stockings', 'lingerie', 'nude', 'clothed'
  ];
  
  const lowerInput = input.toLowerCase();
  const matches = popularTags
    .filter(tag => tag.includes(lowerInput))
    .map(tag => ({ value: tag, label: tag }));
  
  console.log(`📋 [FALLBACK] ${matches.length} tags populares encontradas`);
  return matches;
}

// ============================================
// UI HELPERS
// ============================================

function createNavigationButtons(currentPage, totalPages, disabled = false) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("first")
        .setEmoji("⏮️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || currentPage === 1),
      new ButtonBuilder()
        .setCustomId("prev")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || currentPage === 1),
      new ButtonBuilder()
        .setCustomId("next")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || currentPage === totalPages),
      new ButtonBuilder()
        .setCustomId("last")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || currentPage === totalPages)
    );
}

function createVideoMessage(video, currentPage, totalPages, tags) {
  return [
    `[Video ${currentPage} de ${totalPages}](${video.url})`,
    `Tags: ${tags.join(", ")}`,
    `Score: ${video.score} | ID: ${video.id}`
  ].join("\n");
}

// ============================================
// EXPORTS DEL COMANDO
// ============================================

export const data = new SlashCommandBuilder()
  .setName("video")
  .setDescription("Search videos by tags")
  .addStringOption(option =>
    option
      .setName("tags")
      .setDescription("Tags to search (comma separated)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .setNSFW(true);

// ✅ CRÍTICO: Esta función DEBE estar exportada
export async function autocomplete(interaction) {
  try {
    console.log(`🎯 [AUTOCOMPLETE] Triggered for: ${interaction.commandName}`);
    
    const focusedOption = interaction.options.getFocused(true);
    console.log(`📝 [AUTOCOMPLETE] Option: ${focusedOption.name}`);
    
    if (focusedOption.name === "tags") {
      const choices = await autocompleteTags(interaction, focusedOption.value);
      await interaction.respond(choices);
      console.log(`✅ [AUTOCOMPLETE] Sent ${choices.length} choices`);
    } else {
      await interaction.respond([]);
    }
  } catch (error) {
    console.error(`❌ [AUTOCOMPLETE] Error:`, error);
    try {
      await interaction.respond([]);
    } catch {}
  }
}

export async function execute(interaction) {
  const t = await useLang(interaction);

  if (!interaction.guild) {
    return interaction.reply({
      content: t("common.errors.guild_only"),
      ephemeral: true
    });
  }

  if (!interaction.channel.nsfw) {
    return interaction.reply({
      content: t("common.errors.nsfw_only"),
      ephemeral: true
    });
  }

  await interaction.deferReply();

  try {
    await ensureCacheFolder();

    const userId = process.env.RULE34_USER_ID;
    const apiKey = process.env.RULE34_API_KEY;

    if (!userId || !apiKey) {
      return interaction.editReply({
        content: "⚠️ Credenciales de API no configuradas"
      });
    }

    const tagsInput = interaction.options.getString("tags");
    const tagList = tagsInput
      .split(",")
      .map(tag => tag.trim().replace(/\s+/g, "_"))
      .filter(tag => tag.length > 0);

    if (tagList.length === 0) {
      return interaction.editReply({
        content: "⚠️ Debes proporcionar al menos una etiqueta"
      });
    }

    const result = await getVideos(tagList, userId, apiKey);

    if (result.videos.length === 0) {
      return interaction.editReply({
        content: `❌ No se encontraron videos para: ${tagList.join(", ")}`
      });
    }
    
    let currentPage = 1;
    const totalPages = result.videos.length;

    const content = createVideoMessage(
      result.videos[0], 
      currentPage, 
      totalPages, 
      tagList
    );

    const buttons = createNavigationButtons(currentPage, totalPages);

    const message = await interaction.editReply({
      content: content,
      components: [buttons]
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 900_000
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "❌ Esta no es tu interacción",
          ephemeral: true
        });
      }

      await i.deferUpdate();

      switch (i.customId) {
        case "first": currentPage = 1; break;
        case "prev": if (currentPage > 1) currentPage--; break;
        case "next": if (currentPage < totalPages) currentPage++; break;
        case "last": currentPage = totalPages; break;
      }

      const newContent = createVideoMessage(
        result.videos[currentPage - 1],
        currentPage,
        totalPages,
        tagList
      );
      const newButtons = createNavigationButtons(currentPage, totalPages);

      await i.editReply({
        content: newContent,
        components: [newButtons]
      });
    });

    collector.on("end", () => {
      const disabledButtons = createNavigationButtons(currentPage, totalPages, true);
      message.edit({ components: [disabledButtons] }).catch(() => {});
    });

  } catch (error) {
    console.error("❌ Error ejecutando comando:", error);
    const errorMsg = error.message || "Error inesperado";
    
    if (interaction.deferred) {
      return interaction.editReply({ content: `❌ ${errorMsg}` });
    } else {
      return interaction.reply({ content: `❌ ${errorMsg}`, ephemeral: true });
    }
  }
}