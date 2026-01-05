import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} from "discord.js";

import { useLang } from "../../localization/useLang.js";
import { getGuildLang } from "../../localization/getGuildLang.js";
import { t } from "../../localization/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("purge")
  .setNameLocalizations({
    "es-ES": "purga",
    "es-419": "purga"
  })
  .setDescription("Delete messages from a user")
  .setDescriptionLocalizations({
    "es-ES": "Borra mensajes de un usuario",
    "es-419": "Borra mensajes de un usuario"
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addUserOption(opt =>
    opt.setName("user")
      .setNameLocalizations({
        "es-ES": "usuario",
        "es-419": "usuario"
      })
      .setDescription("Target user")
      .setDescriptionLocalizations({
        "es-ES": "Usuario objetivo",
        "es-419": "Usuario objetivo"
      })
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName("limit")
      .setNameLocalizations({
        "es-ES": "limite",
        "es-419": "limite"
      })
      .setDescription("Messages to scan")
      .setDescriptionLocalizations({
        "es-ES": "Mensajes a escanear",
        "es-419": "Mensajes a escanear"
      })
      .setMinValue(1)
      .setMaxValue(100)
  );

/* =========================
   Helpers
========================= */
async function fetchMessages(channel, totalLimit) {
  let fetched = [];
  let lastId;

  while (fetched.length < totalLimit) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    fetched.push(...messages.values());
    lastId = messages.last().id;
  }

  return fetched.slice(0, totalLimit);
}

/* =========================
   Command logic
========================= */
export async function execute(interaction) {
  const lang = await getGuildLang(interaction.guildId);
  
  // ✅ Permitir canales de texto Y canales de voz (que tienen chat de texto)
  const allowedChannels = [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.PublicThread,
    ChannelType.PrivateThread
  ];

  if (!allowedChannels.includes(interaction.channel.type)) {
    return interaction.reply({
      content: t(lang, "errors.no_messages_channel"),
      flags: MessageFlags.Ephemeral
    });
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: t(lang, "errors.user_permission"),
      flags: MessageFlags.Ephemeral
    });
  }

  const user = interaction.options.getUser("user");
  const limit = interaction.options.getInteger("limit") ?? 500;

  const botMember = interaction.guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: t(lang, "errors.bot_permission"),
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.reply({
    content: t(lang, "purge.start"),
    flags: MessageFlags.Ephemeral
  });

  try {
    const messages = await fetchMessages(interaction.channel, limit);
    const userMessages = messages.filter(m => m.author.id === user.id);

    console.log(`🔍 Purge: Total encontrados: ${userMessages.length} mensajes de ${user.tag}`);

    let deleted = 0;

    // ✅ Separar mensajes recientes (< 14 días) y antiguos (>= 14 días)
    const recent = userMessages.filter(
      m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    const old = userMessages.filter(
      m => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000
    );

    console.log(`📊 Purge: ${recent.length} recientes, ${old.length} antiguos`);

    // ✅ BULK DELETE solo si hay 2 o más mensajes recientes
    if (recent.length >= 2) {
      // Discord permite máximo 100 mensajes por bulkDelete
      const chunks = [];
      for (let i = 0; i < recent.length; i += 100) {
        chunks.push(recent.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        if (chunk.length < 2) {
          // Si queda 1 solo, borrarlo individualmente
          try {
            await chunk[0].delete();
            deleted++;
          } catch (err) {
            console.error("Error borrando mensaje individual:", err.message);
          }
          continue;
        }

        try {
          console.log(`🗑️ bulkDelete: Intentando borrar ${chunk.length} mensajes`);
          const bulk = await interaction.channel.bulkDelete(chunk, true);
          deleted += bulk.size;
          console.log(`✅ bulkDelete: ${bulk.size} mensajes borrados`);
        } catch (err) {
          console.error(`❌ bulkDelete falló:`, err.message);
          // Si falla, intentar borrar uno por uno
          for (const msg of chunk) {
            try {
              await msg.delete();
              deleted++;
            } catch {}
          }
        }
      }
    } else if (recent.length === 1) {
      // Solo 1 mensaje reciente, borrar individualmente
      try {
        await recent[0].delete();
        deleted++;
        console.log(`✅ 1 mensaje reciente borrado individualmente`);
      } catch (err) {
        console.error("Error borrando mensaje reciente:", err.message);
      }
    }

    // ✅ Borrar mensajes antiguos uno por uno (no se puede usar bulkDelete)
    if (old.length > 0) {
      console.log(`🕰️ Borrando ${old.length} mensajes antiguos...`);
      for (const msg of old) {
        try {
          await msg.delete();
          deleted++;
        } catch (err) {
          console.error("Error borrando mensaje antiguo:", err.message);
        }
      }
    }

    await interaction.editReply(
      `${t(lang, "purge.done")}\n\n` +
      t(lang, "purge.stats", {
        user: user.tag,
        checked: messages.length,
        deleted
      })
    );

  } catch (error) {
    console.error("Error en purge:", error);
    await interaction.editReply({
      content: t(lang, "errors.unexpected")
    });
  }
}