// localization/getGuildLang.js
// ✅ Usa el pool compartido con cache

import pool from "../database/pool.js";

// Cache simple en memoria (30 minutos)
const langCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

export async function getGuildLang(guildId) {
  // 1️⃣ Verificar cache
  const cached = langCache.get(guildId);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  // 2️⃣ Si no está en cache, buscar en DB
  const res = await pool.query(
    "SELECT lang FROM guild_settings WHERE guild_id = $1",
    [guildId]
  );

  const lang = res.rows[0]?.lang || "en";

  // 3️⃣ Guardar en cache
  langCache.set(guildId, {
    value: lang,
    expires: Date.now() + CACHE_TTL
  });

  return lang;
}

export async function setGuildLang(guildId, lang) {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, lang, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET lang = EXCLUDED.lang, updated_at = NOW()`,
    [guildId, lang]
  );

  // ✅ Actualizar cache inmediatamente
  langCache.set(guildId, {
    value: lang,
    expires: Date.now() + CACHE_TTL
  });
}

// Limpiar cache expirado cada 5 minutos
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, data] of langCache.entries()) {
    if (now > data.expires) {
      langCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Lang cache cleanup: ${cleaned} items expirados`);
  }
}, 5 * 60 * 1000);