import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class EventManager {
  constructor(client) {
    this.client = client;
    this.events = new Map();
  }

  async loadAll() {
    const eventsPath = path.join(__dirname, "../events");
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));

    for (const file of eventFiles) {
      try {
        const eventPath = path.join(eventsPath, file);
        const eventModule = await import(`file://${eventPath}`);
        const event = eventModule.default;

        if (!event || !event.name || !event.execute) {
          Logger.warn(`Evento inválido: ${file}`);
          continue;
        }

        this.register(event);
        Logger.debug(`Evento cargado: ${event.name}`);
      } catch (error) {
        Logger.error(`Error cargando evento ${file}:`, error);
      }
    }

    Logger.success(`✅ ${this.events.size} eventos cargados`);
  }

  register(event) {
    const execute = (...args) => {
      try {
        event.execute(this.client, ...args);
      } catch (error) {
        Logger.error(`Error en evento ${event.name}:`, error);
      }
    };

    if (event.once) {
      this.client.once(event.name, execute);
    } else {
      this.client.on(event.name, execute);
    }

    this.events.set(event.name, event);
  }

  unregister(eventName) {
    if (!this.events.has(eventName)) return false;

    this.client.removeAllListeners(eventName);
    this.events.delete(eventName);
    return true;
  }
}