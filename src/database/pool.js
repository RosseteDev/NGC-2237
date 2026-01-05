import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: false }
    : false
});

pool.on("connect", () => {
  console.log("🗄️ PostgreSQL connected");
});

pool.on("error", err => {
  console.error("❌ PostgreSQL error:", err);
});

export default pool;
