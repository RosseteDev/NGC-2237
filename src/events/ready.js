import { Events } from "discord.js";

export default client => {
  client.once(Events.ClientReady, () => {
    console.log(`✅ Bot online as ${client.user.tag}`);
  });
};
