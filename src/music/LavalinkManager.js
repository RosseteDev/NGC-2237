import { Shoukaku, Connectors } from "shoukaku";

export default class LavalinkManager {
  constructor(client) {
    // ✅ SOLO NODOS VERIFICADOS Y FUNCIONALES
    const nodes = [
      {
        name: "ajiedev-v4",
        url: "lava-v4.ajieblogs.eu.org:443",
        auth: "ajieblogs",
        secure: true
      },
      {
        name: "jirayu-stable",
        url: "lavalink.jirayu.net:13592",
        auth: "youshallnotpass",
        secure: false
      }
    ];

    this.shoukaku = new Shoukaku(
      new Connectors.DiscordJS(client),
      nodes,
      {
        moveOnDisconnect: true,
        resume: true,
        resumeByLibrary: true,
        resumeTimeout: 30,
        reconnectTries: 2,
        reconnectInterval: 5,
        restTimeout: 60000,
        userAgent: "Discord Bot (Shoukaku)"
      }
    );

    this.shoukaku.on("ready", (name) => {
      console.log(`✅ Nodo Lavalink conectado: ${name}`);
    });

    this.shoukaku.on("error", (name, error) => {
      console.error(`❌ Error en nodo ${name}:`, error.message);
    });

    this.shoukaku.on("disconnect", (name, count) => {
      console.log(`⚠️ Nodo ${name} desconectado (intentos: ${count})`);
    });

    this.shoukaku.on("reconnecting", (name, tries, left) => {
      console.log(`🔄 Reconectando a ${name}... (${tries}/${tries + left})`);
    });

    this.shoukaku.on("close", (name, code, reason) => {
      console.log(`🚪 Nodo ${name} cerrado: ${code} - ${reason || 'Sin razón'}`);
    });
  }
}