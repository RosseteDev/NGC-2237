import { Client, Collection, GatewayIntentBits } from "discord.js";
import "dotenv/config";
import path from "path";

import { loadCommands } from "./utils/loadCommands.js";
import LavalinkManager from "./music/LavalinkManager.js";
// ✅ NUEVO: Importar el handler de prefijos
import { handlePrefixCommand } from "./handlers/prefixHandler.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    // ✅ IMPORTANTE: Necesario para leer mensajes con prefijos
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// ✅ Conectar a nodos públicos de Lavalink
client.lavalink = new LavalinkManager(client);

await loadCommands(path.resolve("src/commands"), client.commands);

// ✅ Event handlers
import("./events/ready.js").then(m => m.default(client));
import("./events/interactionCreate.js").then(m => m.default(client));

// ✅ NUEVO: Event handler para prefix commands
client.on("messageCreate", async (message) => {
  await handlePrefixCommand(message, client);
});

client.login(process.env.DISCORD_TOKEN);