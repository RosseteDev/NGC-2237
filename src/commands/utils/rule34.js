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
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Guardar caché de imágenes
async function saveCache(combinedTag, images) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    await fs.writeFile(cacheFile, JSON.stringify(images, null, 2));
  } catch (error) {
    console.error("Error guardando caché:", error);
  }
}

// Buscar en Rule34 API
async function searchRule34(tags, userId, apiKey) {
  const tagsQuery = tags.join("+");
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tagsQuery}&limit=100&json=1&user_id=${userId}&api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data.filter(post => 
        post.file_url && 
        (post.file_url.endsWith('.jpg') || 
         post.file_url.endsWith('.jpeg') || 
         post.file_url.endsWith('.png') || 
         post.file_url.endsWith('.gif'))
      );
    }
    
    return [];
  } catch (error) {
    console.error("Error buscando en Rule34:", error);
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
function createImageEmbed(result, currentPage, totalPages, tags) {
  return new EmbedBuilder()
    .setTitle(`Página ${currentPage} de ${totalPages}`)
    .setDescription(`**Tags:** ${tags.join(", ")}`)
    .setImage(result.file_url)
    .setColor(0x0099FF)
    .setFooter({ text: `Score: ${result.score || 0} | ID: ${result.id}` })
    .setURL(result.file_url);
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

    const combinedTag = tagList.join("_");
    const cachedImages = await loadCache(combinedTag);
    const results = await searchRule34(tagList, userId, apiKey);

    if (results.length === 0) {
      return interaction.editReply({
        content: t("rule34.no_results", { tags: tagList.join(", ") })
      });
    }

    const newResults = results.filter(
      result => !cachedImages.includes(result.file_url)
    );

    if (newResults.length === 0) {
      return interaction.editReply({
        content: t("rule34.no_new_results", { tags: tagList.join(", ") })
      });
    }

    // Guardar las nuevas imágenes en caché
    const updatedCache = [
      ...cachedImages,
      ...newResults.map(r => r.file_url)
    ];
    await saveCache(combinedTag, updatedCache);

    // Actualizar tags exitosas
    const savedTags = await loadTags();
    const updatedTags = [...new Set([...savedTags, ...tagList])];
    await saveTags(updatedTags);

    // Sistema de paginación
    let currentPage = 1;
    const totalPages = newResults.length;

    const embed = createImageEmbed(newResults[0], currentPage, totalPages, tagList);
    const buttons = createNavigationButtons(currentPage, totalPages);

    const message = await interaction.editReply({
      embeds: [embed],
      components: [buttons]
    });

    // Collector para los botones (15 minutos de timeout)
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 900_000 // 15 minutos
    });

    collector.on("collect", async (i) => {
      // Verificar que quien presiona el botón es quien ejecutó el comando
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: t("common.errors.not_your_interaction"),
          ephemeral: true
        });
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
        case "stop":
          collector.stop("user_stopped");
          return;
      }

      const newEmbed = createImageEmbed(
        newResults[currentPage - 1],
        currentPage,
        totalPages,
        tagList
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