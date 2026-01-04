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
  MIN_IMAGES: 20,      // Mínimo de imágenes antes de buscar más
  FETCH_LIMIT: 100,    // Cuántas imágenes buscar en cada request
  MAX_CACHE: 500       // Máximo de imágenes a mantener en cache por tag
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
    
    // ✅ Asegurar que sea un array
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
    
    // ✅ Limitar el tamaño del cache
    const limitedImages = images.slice(-CACHE_CONFIG.MAX_CACHE);
    
    await fs.writeFile(cacheFile, JSON.stringify(limitedImages, null, 2));
    
    console.log(`💾 Cache guardado: ${combinedTag} (${limitedImages.length} imágenes)`);
  } catch (error) {
    console.error("Error guardando caché:", error);
  }
}

// ✅ NUEVA: Buscar imágenes en Rule34 API con offset
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

// ✅ NUEVA: Sistema inteligente de gestión de cache
async function getImages(tags, userId, apiKey) {
  const combinedTag = tags.join("_");
  
  // 1️⃣ Cargar cache existente
  let cachedImages = await loadCache(combinedTag);
  
  console.log(`📦 Cache actual: ${cachedImages.length} imágenes para "${combinedTag}"`);
  
  // 2️⃣ Si hay suficientes imágenes en cache, usar esas
  if (cachedImages.length >= CACHE_CONFIG.MIN_IMAGES) {
    console.log(`✅ Usando ${cachedImages.length} imágenes del cache`);
    return {
      images: cachedImages,
      fromCache: true,
      newCount: 0
    };
  }
  
  // 3️⃣ Si no hay suficientes, buscar más
  console.log(`🔍 Cache insuficiente (${cachedImages.length}/${CACHE_CONFIG.MIN_IMAGES}), buscando nuevas...`);
  
  try {
    // Calcular qué página buscar (basado en cuántas ya tenemos)
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
    
    // 4️⃣ Filtrar solo las nuevas (que no estén en cache)
    const existingUrls = new Set(cachedImages.map(img => img.url));
    const newImages = results.filter(img => !existingUrls.has(img.url));
    
    console.log(`✨ Encontradas ${newImages.length} imágenes nuevas`);
    
    // 5️⃣ Agregar nuevas imágenes al cache
    const updatedCache = [...cachedImages, ...newImages];
    await saveCache(combinedTag, updatedCache);
    
    return {
      images: updatedCache,
      fromCache: false,
      newCount: newImages.length
    };
    
  } catch (error) {
    console.error("Error buscando nuevas imágenes:", error);
    
    // Si falla la búsqueda pero hay cache, usar el cache
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

// Crear botones de navegación
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

// Crear embed para una imagen
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

// Autocompletado de tags
async function autocompleteTags(interaction, current) {
  const tags = await loadTags();
  return tags
    .filter(tag => tag.toLowerCase().includes(current.toLowerCase()))
    .slice(0, 25)
    .map(tag => ({ name: tag, value: tag }));
}

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

export async function autocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  
  if (focusedOption.name === "tags") {
    const choices = await autocompleteTags(interaction, focusedOption.value);
    await interaction.respond(choices);
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

    const tagsInput = interaction.options.getString("tags");
    const tagList = tagsInput
      .split(",")
      .map(tag => tag.trim().replace(/\s+/g, "_"))
      .filter(tag => tag.length > 0);

    if (tagList.length === 0) {
      return interaction.editReply({
        content: t("rule34.no_tags")
      });
    }

    // ✅ Usar el nuevo sistema inteligente de cache
    const result = await getImages(tagList, userId, apiKey);

    if (result.images.length === 0) {
      return interaction.editReply({
        content: `❌ No se encontraron imágenes para: ${tagList.join(", ")}`
      });
    }

    // ✅ Actualizar tags exitosas
    const savedTags = await loadTags();
    const updatedTags = [...new Set([...savedTags, ...tagList])];
    await saveTags(updatedTags);

    // Sistema de paginación
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

    // Collector para los botones (15 minutos de timeout)
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

      // ✅ Si presiona stop, cerrar el collector
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