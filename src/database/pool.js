// src/database/pool.js

import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

// ✅ Si DB está deshabilitada, crear pool dummy
const isDisabled = process.env.DB_DISABLED === "true";

let pool;

if (isDisabled) {
  console.log("⚠️ Base de datos deshabilitada por configuración");
  
  // Pool dummy que retorna valores por defecto
  pool = {
    query: async () => ({ rows: [] }),
    end: async () => {},
    on: () => {}
  };
  
} else {
  // Pool real
  pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 5432,
    ssl: process.env.DB_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
    
    // ✅ Configuración de timeouts optimizada
    connectionTimeoutMillis: 3000,  // 3 segundos para conectar
    idleTimeoutMillis: 30000,       // 30 segundos idle
    max: 10,                         // Máximo 10 conexiones
    
    // ✅ Intentos de reconexión
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  });

  pool.on("connect", () => {
    console.log("🗄️ PostgreSQL connected");
  });

  pool.on("error", (err) => {
    // Solo log de errores críticos, no timeouts normales
    if (!err.message.includes("ETIMEDOUT")) {
      console.error("❌ PostgreSQL error:", err.message);
    }
  });
  
  pool.on("remove", () => {
    // Cliente removido del pool (normal)
  });
}

export default pool;