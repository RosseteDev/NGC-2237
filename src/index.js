// src/index.js

import { Client, Collection, GatewayIntentBits } from "discord.js";
import "dotenv/config";
import path from "path";

import { loadCommands } from "./utils/loadCommands.js";
import LavalinkManager from "./music/LavalinkManager.js";
import { handlePrefixCommand } from "./handlers/prefixHandler.js";
import CommandHandler from "./utils/CommandHandler.js";
import { createLogger } from "./utils/Logger.js";
import { db } from "./database/manager.js";

const logger = createLogger("main");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
client.commandHandler = new CommandHandler(client);
client.lavalink = new LavalinkManager(client);

// Cargar comandos
logger.info("Cargando comandos...");
await loadCommands(path.resolve("src/commands"), client.commands);
logger.info(`✅ ${client.commands.size} comandos cargados`);

// Inicializar base de datos
await db.init();

// Event handlers
import("./events/ready.js").then(m => m.default(client));
import("./events/interactionCreate.js").then(m => m.default(client));

// Prefix commands
client.on("messageCreate", async (message) => {
  await handlePrefixCommand(message, client);
});

// Manejo de errores globales
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled Promise Rejection", error);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", error);
  process.exit(1);
});

logger.info("Iniciando bot...");
client.login(process.env.DISCORD_TOKEN);