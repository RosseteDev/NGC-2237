import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export async function loadCommands(commandsPath, collection) {
  const entries = fs.readdirSync(commandsPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(commandsPath, entry.name);

    if (entry.isDirectory()) {
      await loadCommands(fullPath, collection);
      continue;
    }

    if (!entry.name.endsWith(".js")) continue;

    const module = await import(pathToFileURL(fullPath));

    if (!module.data || typeof module.execute !== "function") {
      console.log(`Skipping non-command file (no exported 'data' or 'execute'): ${fullPath}`);
      continue;
    }

    collection.set(module.data.name, module);
  }
}
