import pool from "../database/pool.js";

export async function getGuildLang(guildId) {
  const res = await pool.query(
    "SELECT language FROM guild_settings WHERE guild_id = $1",
    [guildId]
  );

  return res.rows[0]?.language || "en";
}

export async function setGuildLang(guildId, lang) {
  await pool.query(
    `
    INSERT INTO guild_settings (guild_id, language)
    VALUES ($1, $2)
    ON CONFLICT (guild_id)
    DO UPDATE SET language = EXCLUDED.language
    `,
    [guildId, lang]
  );
}
