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
const CACHE_FOLDER = path.join(__dirname, "..", "..", "image_cache");
const TAGS_FILE = path.join(CACHE_FOLDER, "tags.json");

// ✅ Configuración de cache
const CACHE_CONFIG = {
  MIN_IMAGES: 20,
  FETCH_LIMIT: 100,
  MAX_CACHE: 500
};

// Asegurarse de que la carpeta de caché existe
async function ensureCacheFolder() {
  try {
    await fs.mkdir(CACHE_FOLDER, { recursive: true });
  } catch (error) {
    console.error("Error creando carpeta de caché:", error);
  }
}

// Cargar etiquetas guardadas
async function loadTags() {
  try {
    const data = await fs.readFile(TAGS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Guardar etiquetas
async function saveTags(tags) {
  try {
    await fs.writeFile(TAGS_FILE, JSON.stringify(tags, null, 2));
  } catch (error) {
    console.error("Error guardando tags:", error);
  }
}

// Cargar caché de imágenes para una tag combinada
async function loadCache(combinedTag) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const data = await fs.readFile(cacheFile, "utf-8");
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed)) {
      console.warn(`Cache corrupto para ${combinedTag}, reiniciando`);
      return [];
    }
    
    return parsed;
  } catch {
    return [];
  }
}

// Guardar caché de imágenes
async function saveCache(combinedTag, images) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const limitedImages = images.slice(-CACHE_CONFIG.MAX_CACHE);
    await fs.writeFile(cacheFile, JSON.stringify(limitedImages, null, 2));
    console.log(`💾 Cache guardado: ${combinedTag} (${limitedImages.length} imágenes)`);
  } catch (error) {
    console.error("Error guardando caché:", error);
  }
}

// Buscar imágenes en Rule34 API con offset
async function searchRule34(tags, userId, apiKey, page = 0) {
  const tagsQuery = tags.join("+");
  const pid = page * CACHE_CONFIG.FETCH_LIMIT;
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tagsQuery}&limit=${CACHE_CONFIG.FETCH_LIMIT}&pid=${pid}&json=1&user_id=${userId}&api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data
        .filter(post => 
          post.file_url && 
          (post.file_url.endsWith('.jpg') || 
           post.file_url.endsWith('.jpeg') || 
           post.file_url.endsWith('.png') || 
           post.file_url.endsWith('.gif'))
        )
        .map(post => ({
          url: post.file_url,
          id: post.id,
          score: post.score || 0
        }));
    }
    
    return [];
  } catch (error) {
    console.error("Error buscando en Rule34:", error);
    throw error;
  }
}

// Sistema inteligente de gestión de cache
async function getImages(tags, userId, apiKey) {
  const combinedTag = tags.join("_");
  let cachedImages = await loadCache(combinedTag);
  
  console.log(`📦 Cache actual: ${cachedImages.length} imágenes para "${combinedTag}"`);
  
  if (cachedImages.length >= CACHE_CONFIG.MIN_IMAGES) {
    console.log(`✅ Usando ${cachedImages.length} imágenes del cache`);
    return {
      images: cachedImages,
      fromCache: true,
      newCount: 0
    };
  }
  
  console.log(`🔍 Cache insuficiente (${cachedImages.length}/${CACHE_CONFIG.MIN_IMAGES}), buscando nuevas...`);
  
  try {
    const page = Math.floor(cachedImages.length / CACHE_CONFIG.FETCH_LIMIT);
    const results = await searchRule34(tags, userId, apiKey, page);
    
    if (results.length === 0) {
      console.log(`⚠️ No se encontraron más imágenes en la página ${page}`);
      return {
        images: cachedImages,
        fromCache: true,
        newCount: 0,
        exhausted: true
      };
    }
    
    const existingUrls = new Set(cachedImages.map(img => img.url));
    const newImages = results.filter(img => !existingUrls.has(img.url));
    
    console.log(`✨ Encontradas ${newImages.length} imágenes nuevas`);
    
    const updatedCache = [...cachedImages, ...newImages];
    await saveCache(combinedTag, updatedCache);
    
    return {
      images: updatedCache,
      fromCache: false,
      newCount: newImages.length
    };
    
  } catch (error) {
    console.error("Error buscando nuevas imágenes:", error);
    
    if (cachedImages.length > 0) {
      console.log(`⚠️ Usando cache por error en API`);
      return {
        images: cachedImages,
        fromCache: true,
        newCount: 0,
        error: error.message
      };
    }
    
    throw error;
  }
}

// ============================================
// AUTOCOMPLETADO MEJORADO
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
    
    const suggestions = await fetchSuggestionsWithRetry(lastTag);
    
    if (!suggestions || suggestions.length === 0) {
      console.log(`🔭 [AUTOCOMPLETE] Sin sugerencias`);
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

// Intentar múltiples métodos para obtener sugerencias
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
      signal: AbortSignal.timeout(3000)
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

// Fallback con tags populares
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
        .setCustomId("stop")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
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

function createImageEmbed(image, currentPage, totalPages, tags, cacheInfo) {
  const embed = new EmbedBuilder()
    .setTitle(`Página ${currentPage} de ${totalPages}`)
    .setDescription(`**Tags:** ${tags.join(", ")}`)
    .setImage(image.url)
    .setColor(0x0099FF)
    .setFooter({ 
      text: `Score: ${image.score} | ID: ${image.id}${cacheInfo ? ` | ${cacheInfo}` : ''}` 
    })
    .setURL(image.url);
  
  return embed;
}

// ============================================
// EXPORTS DEL COMANDO
// ============================================

export const data = new SlashCommandBuilder()
  .setName("imagen")
  .setNameLocalizations({
    "es-ES": "imagen",
    "es-419": "imagen"
  })
  .setDescription("Search images by tags")
  .setDescriptionLocalizations({
    "es-ES": "Busca imágenes por etiquetas",
    "es-419": "Busca imágenes por etiquetas"
  })
  .addStringOption(option =>
    option
      .setName("tags")
      .setNameLocalizations({
        "es-ES": "etiquetas",
        "es-419": "etiquetas"
      })
      .setDescription("Tags to search (comma separated)")
      .setDescriptionLocalizations({
        "es-ES": "Etiquetas para buscar (separadas por comas)",
        "es-419": "Etiquetas para buscar (separadas por comas)"
      })
      .setRequired(true)
      .setAutocomplete(true)
  )
  .setNSFW(true);

// ✅ CRÍTICO: Función de autocompletado exportada
export async function autocomplete(interaction) {
  try {
    console.log(`🎯 [AUTOCOMPLETE] Triggered for: ${interaction.commandName}`);
    
    const focusedOption = interaction.options.getFocused(true);
    console.log(`🔍 [AUTOCOMPLETE] Option: ${focusedOption.name}`);
    
    if (focusedOption.name === "tags" || focusedOption.name === "etiquetas") {
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
        content: "❌ API credentials not configured. Add RULE34_USER_ID and RULE34_API_KEY to your .env file."
      });
    }

    const tagsInput = interaction.options.getString("tags") || interaction.options.getString("etiquetas");
    const tagList = tagsInput
      .split(",")
      .map(tag => tag.trim().replace(/\s+/g, "_"))
      .filter(tag => tag.length > 0);

    if (tagList.length === 0) {
      return interaction.editReply({
        content: t("rule34.no_tags")
      });
    }

    const result = await getImages(tagList, userId, apiKey);

    if (result.images.length === 0) {
      return interaction.editReply({
        content: `❌ No se encontraron imágenes para: ${tagList.join(", ")}`
      });
    }

    // Actualizar tags exitosas
    const savedTags = await loadTags();
    const updatedTags = [...new Set([...savedTags, ...tagList])];
    await saveTags(updatedTags);

    let currentPage = 1;
    const totalPages = result.images.length;

    const embed = createImageEmbed(
      result.images[0], 
      currentPage, 
      totalPages, 
      tagList
    );
    
    const buttons = createNavigationButtons(currentPage, totalPages);

    const message = await interaction.editReply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 900_000
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: t("common.errors.not_your_interaction"),
          ephemeral: true
        });
      }

      if (i.customId === "stop") {
        collector.stop("user_stopped");
        
        const disabledButtons = createNavigationButtons(currentPage, totalPages, true);
        await i.update({
          embeds: [i.message.embeds[0]],
          components: [disabledButtons]
        });
        return;
      }

      switch (i.customId) {
        case "first":
          currentPage = 1;
          break;
        case "prev":
          if (currentPage > 1) currentPage--;
          break;
        case "next":
          if (currentPage < totalPages) currentPage++;
          break;
        case "last":
          currentPage = totalPages;
          break;
      }

      const newEmbed = createImageEmbed(
        result.images[currentPage - 1],
        currentPage,
        totalPages,
        tagList,
        `${result.images.length} en cache`
      );
      const newButtons = createNavigationButtons(currentPage, totalPages);

      await i.update({
        embeds: [newEmbed],
        components: [newButtons]
      });
    });

    collector.on("end", async (collected, reason) => {
      const disabledButtons = createNavigationButtons(currentPage, totalPages, true);
      
      try {
        await message.edit({ components: [disabledButtons] });
      } catch (error) {
        console.error("Error deshabilitando botones:", error);
      }
    });

  } catch (error) {
    console.error("💥 Error en /imagen:", error);
    
    const errorMessage = { content: t("common.errors.unexpected") };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply({ ...errorMessage, ephemeral: true });
    }
  }
}