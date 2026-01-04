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

    let deleted = 0;

    const recent = userMessages.filter(
      m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (recent.length > 0) {
      const bulk = await interaction.channel.bulkDelete(recent, true);
      deleted += bulk.size;
    }

    const old = userMessages.filter(
      m => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000
    );

    for (const msg of old) {
      try {
        await msg.delete();
        deleted++;
      } catch {}
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