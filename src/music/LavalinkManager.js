import { Shoukaku, Connectors } from "shoukaku";

export default class LavalinkManager {
  constructor(client) {
    // ✅ SOLO el nodo que funciona
    const nodes = [
      {
        name: "lavalink-jirayu",
        url: "lavalink.jirayu.net:13592",
        auth: "youshallnotpass",
        secure: false
      }
    ];

    this.shoukaku = new Shoukaku(
      new Connectors.DiscordJS(client),
      nodes,
      {
        moveOnDisconnect: false, // Solo hay 1 nodo
        resume: true,
        resumeByLibrary: true,
        resumeTimeout: 30,
        reconnectTries: 3,
        reconnectInterval: 10,
        restTimeout: 60000
      }
    );

    this.shoukaku.on("ready", (name) => {
      console.log(`✅ Nodo Lavalink conectado: ${name}`);
    });

    this.shoukaku.on("error", (name, error) => {
      console.error(`❌ Error en nodo ${name}:`, error.message);
    });

    this.shoukaku.on("disconnect", (name) => {
      console.log(`⚠️ Nodo ${name} desconectado`);
    });

    this.shoukaku.on("reconnecting", (name, tries) => {
      if (tries === 1) {
        console.log(`🔄 Reconectando a ${name}...`);
      }
    });
  }
}