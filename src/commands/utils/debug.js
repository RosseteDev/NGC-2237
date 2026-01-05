// src/commands/utils/debug.js

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { Logger, createLogger } from "../../utils/Logger.js"; // ✅ Importar clase

const logger = createLogger("debug");

export const data = new SlashCommandBuilder()
  .setName("debug")
  .setDescription("Control debug mode (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("enable")
      .setDescription("Enable debug mode")
      .addStringOption(opt =>
        opt
          .setName("modules")
          .setDescription("Modules to debug (comma separated, * for all)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName("disable").setDescription("Disable debug mode")
  )
  .addSubcommand(sub =>
    sub.setName("status").setDescription("Show debug status")
  )
  .addSubcommand(sub =>
    sub
      .setName("level")
      .setDescription("Change log level")
      .addStringOption(opt =>
        opt
          .setName("level")
          .setDescription("Log level")
          .setRequired(true)
          .addChoices(
            { name: "Error", value: "error" },
            { name: "Warn", value: "warn" },
            { name: "Info", value: "info" },
            { name: "Debug", value: "debug" }
          )
      )
  );

export async function execute(context) {
  const subcommand = context.source.options.getSubcommand();
  
  switch (subcommand) {
    case "enable": {
      const modules = context.options.getString("modules") || "*";
      Logger.enableDebug(modules); // ✅ Ahora funciona
      
      logger.info(`Debug habilitado por ${context.user.tag}`);
      
      await context.success(
        "Debug Activado",
        `**Módulos:** ${modules}\n\n` +
        `⚠️ Esto solo afecta esta instancia del bot.\n` +
        `Los logs estarán más verbosos.`
      );
      break;
    }
    
    case "disable": {
      Logger.disableDebug(); // ✅ Ahora funciona
      
      logger.info(`Debug deshabilitado por ${context.user.tag}`);
      
      await context.success(
        "Debug Desactivado",
        "Los mensajes de debug ya no se mostrarán."
      );
      break;
    }
    
    case "status": {
      const status = Logger.getStatus(); // ✅ Ahora funciona
      const statusIcon = status.debugEnabled ? "✅ Activado" : "❌ Desactivado";
      const modules = status.debugModules.join(", ");
      
      await context.info(
        "Estado del Logger",
        `**Estado:** ${statusIcon}\n` +
        `**Módulos:** ${modules}\n` +
        `**Nivel de Log:** ${status.logLevel}\n` +
        `**Timestamp:** ${status.showTimestamp ? "Sí" : "No"}\n` +
        `**Colores:** ${status.colorize ? "Sí" : "No"}`
      );
      break;
    }
    
    case "level": {
      const level = context.options.getString("level");
      Logger.setLevel(level); // ✅ Ahora funciona
      
      logger.info(`Nivel de log cambiado a ${level} por ${context.user.tag}`);
      
      await context.success(
        "Nivel Actualizado",
        `Nivel de log cambiado a: **${level}**`
      );
      break;
    }
  }
}