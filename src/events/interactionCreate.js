// src/events/interactionCreate.js

import { Events } from "discord.js";

export default client => {
  client.on(Events.InteractionCreate, async interaction => {
    
    // ✅ Manejar AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      
      if (!command || !command.autocomplete) {
        return interaction.respond([]).catch(() => {});
      }
      
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`❌ Autocomplete error for ${interaction.commandName}:`, error);
        await interaction.respond([]).catch(() => {});
      }
      
      return;
    }
    
    // ✅ Manejar SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
      // ✅ Usar CommandHandler unificado
      await client.commandHandler.execute(interaction);
      return;
    }
  });
};