import { Events } from "discord.js";

export default client => {
  client.on(Events.InteractionCreate, async interaction => {
    
    // ✅ Manejar AUTOCOMPLETE (debe ir primero)
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      
      if (!command) {
        console.warn(`⚠️ Autocomplete: Command not found: ${interaction.commandName}`);
        return interaction.respond([]).catch(() => {});
      }
      
      if (!command.autocomplete) {
        console.warn(`⚠️ Autocomplete: No handler for ${interaction.commandName}`);
        return interaction.respond([]).catch(() => {});
      }
      
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`❌ Autocomplete error for ${interaction.commandName}:`, error);
        // Responder con array vacío en caso de error para no bloquear Discord
        await interaction.respond([]).catch(() => {});
      }
      
      return; // ✅ Importante: detener aquí para autocomplete
    }
    
    // ✅ Manejar COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      
      if (!command) {
        console.warn(`❌ Command not found: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`❌ Command execution error for ${interaction.commandName}:`, err);

        const msg = "❌ An unexpected error occurred.";

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg).catch(() => {});
        } else {
          await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
        }
      }
      
      return;
    }
  });
};