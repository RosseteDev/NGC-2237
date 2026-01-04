import { REST, Routes } from "discord.js";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];

// ✅ FUNCIÓN readCommands DEFINIDA AQUÍ
async function readCommands(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      await readCommands(fullPath);
      continue;
    }

    if (!file.endsWith(".js")) continue;

    const cmd = await import(`file://${fullPath}`);

    if (!cmd.data) {
      console.log(`Skipping non-command file (no exported 'data'): ${fullPath}`);
      continue;
    }

    commands.push(cmd.data.toJSON());
  }
}

async function main() {
  await readCommands(path.join(__dirname, "commands"));

  // 🔍 Check for duplicates
  const commandNames = commands.map(cmd => cmd.name);
  const duplicates = commandNames.filter((name, index) => 
    commandNames.indexOf(name) !== index
  );

  if (duplicates.length > 0) {
    console.error("❌ Duplicate command names found:", [...new Set(duplicates)]);
    console.log("\nAll commands being registered:");
    commands.forEach((cmd, i) => console.log(`  ${i + 1}. ${cmd.name}`));
    setTimeout(() => process.exit(1), 100);
    return;
  }

  const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("📄 Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ Registered ${commands.length} commands`);
    
    // ✅ Cierra después de 100ms
    setTimeout(() => process.exit(0), 100);
    
  } catch (err) {
    console.error("❌ Error registering commands:", err);
    setTimeout(() => process.exit(1), 100);
  }
}

main().catch(err => {
  console.error("❌ Fatal error:", err);
  setTimeout(() => process.exit(1), 100);
});