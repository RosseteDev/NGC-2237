// db-diagnostic.js - Script de diagnóstico completo para PostgreSQL

import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

// ============================================
// COLORES PARA LOGS
// ============================================
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

function log(color, icon, message) {
  console.log(`${colors[color]}${icon} ${message}${colors.reset}`);
}

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log("=".repeat(60));
}

// ============================================
// DIAGNÓSTICO 1: VERIFICAR VARIABLES DE ENTORNO
// ============================================
function checkEnvironmentVariables() {
  section("1️⃣  VERIFICANDO VARIABLES DE ENTORNO");
  
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_PORT"];
  const optional = ["DB_SSL"];
  
  let allPresent = true;
  
  required.forEach(key => {
    const value = process.env[key];
    if (!value) {
      log("red", "❌", `${key} NO ESTÁ DEFINIDO`);
      allPresent = false;
    } else {
      // Ocultar password
      const display = key === "DB_PASSWORD" 
        ? "*".repeat(value.length) 
        : value;
      log("green", "✅", `${key} = ${display}`);
    }
  });
  
  optional.forEach(key => {
    const value = process.env[key];
    if (value) {
      log("green", "ℹ️", `${key} = ${value}`);
    } else {
      log("yellow", "⚠️", `${key} no está definido (opcional)`);
    }
  });
  
  if (!allPresent) {
    log("red", "💥", "Faltan variables de entorno críticas");
    return false;
  }
  
  log("green", "✅", "Todas las variables de entorno presentes");
  return true;
}

// ============================================
// DIAGNÓSTICO 2: PROBAR DIFERENTES CONFIGURACIONES SSL
// ============================================
async function testSSLConfigurations() {
  section("2️⃣  PROBANDO CONFIGURACIONES SSL");
  
  const configurations = [
    {
      name: "SSL deshabilitado",
      ssl: false
    },
    {
      name: "SSL con rejectUnauthorized: false",
      ssl: {
        rejectUnauthorized: false
      }
    },
    {
      name: "SSL estricto (rejectUnauthorized: true)",
      ssl: {
        rejectUnauthorized: true
      }
    },
    {
      name: "SSL según variable DB_SSL",
      ssl: process.env.DB_SSL === "true"
        ? { rejectUnauthorized: false }
        : false
    }
  ];
  
  for (const config of configurations) {
    console.log(`\n${colors.blue}Probando: ${config.name}${colors.reset}`);
    
    try {
      const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT) || 5432,
        ssl: config.ssl,
        connectionTimeoutMillis: 5000 // 5 segundos timeout
      });
      
      const start = Date.now();
      const result = await pool.query("SELECT NOW() as time, version() as version");
      const elapsed = Date.now() - start;
      
      log("green", "✅", `ÉXITO en ${elapsed}ms`);
      log("cyan", "ℹ️", `Hora del servidor: ${result.rows[0].time}`);
      log("cyan", "ℹ️", `Versión: ${result.rows[0].version.substring(0, 50)}...`);
      
      await pool.end();
      
      console.log(`${colors.green}╔${"═".repeat(58)}╗${colors.reset}`);
      console.log(`${colors.green}║  🎉 CONFIGURACIÓN CORRECTA ENCONTRADA:              ║${colors.reset}`);
      console.log(`${colors.green}║     ${config.name.padEnd(48)} ║${colors.reset}`);
      console.log(`${colors.green}╚${"═".repeat(58)}╝${colors.reset}`);
      
      return config;
      
    } catch (error) {
      log("red", "❌", `FALLÓ: ${error.message}`);
      
      // Detalles adicionales del error
      if (error.code) {
        log("yellow", "📋", `Código de error: ${error.code}`);
      }
      if (error.routine) {
        log("yellow", "📋", `Rutina: ${error.routine}`);
      }
    }
  }
  
  log("red", "💥", "Ninguna configuración SSL funcionó");
  return null;
}

// ============================================
// DIAGNÓSTICO 3: PROBAR CONEXIÓN CON URL COMPLETA
// ============================================
async function testConnectionString() {
  section("3️⃣  PROBANDO CON CONNECTION STRING");
  
  // Render.com proporciona DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    log("yellow", "⚠️", "DATABASE_URL no está definida");
    log("cyan", "ℹ️", "Construyendo URL desde variables individuales...");
    
    const constructedUrl = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    
    log("cyan", "🔗", `URL: ${constructedUrl.replace(process.env.DB_PASSWORD, "***")}`);
    
    try {
      const pool = new Pool({
        connectionString: constructedUrl,
        ssl: { rejectUnauthorized: false }
      });
      
      const result = await pool.query("SELECT 1 as test");
      log("green", "✅", "Conexión exitosa con URL construida");
      await pool.end();
      return true;
    } catch (error) {
      log("red", "❌", `Error: ${error.message}`);
      return false;
    }
  }
  
  // Ocultar password en la URL
  const safeUrl = databaseUrl.replace(/:[^:@]+@/, ":***@");
  log("cyan", "🔗", `DATABASE_URL encontrada: ${safeUrl}`);
  
  try {
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    });
    
    const result = await pool.query("SELECT NOW()");
    log("green", "✅", `Conexión exitosa: ${result.rows[0].now}`);
    await pool.end();
    return true;
  } catch (error) {
    log("red", "❌", `Error: ${error.message}`);
    return false;
  }
}

// ============================================
// DIAGNÓSTICO 4: VERIFICAR CONECTIVIDAD DE RED
// ============================================
async function testNetworkConnectivity() {
  section("4️⃣  VERIFICANDO CONECTIVIDAD DE RED");
  
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT) || 5432;
  
  log("cyan", "ℹ️", `Probando conexión TCP a ${host}:${port}...`);
  
  return new Promise((resolve) => {
    const net = require("net");
    const socket = new net.Socket();
    
    const timeout = setTimeout(() => {
      socket.destroy();
      log("red", "❌", "Timeout: No se pudo conectar en 5 segundos");
      log("yellow", "💡", "Posibles causas:");
      log("yellow", "   ", "• Firewall bloqueando la conexión");
      log("yellow", "   ", "• Host o puerto incorrecto");
      log("yellow", "   ", "• Red privada (requiere VPN)");
      resolve(false);
    }, 5000);
    
    socket.on("connect", () => {
      clearTimeout(timeout);
      log("green", "✅", `Puerto ${port} está abierto y accesible`);
      socket.destroy();
      resolve(true);
    });
    
    socket.on("error", (error) => {
      clearTimeout(timeout);
      log("red", "❌", `Error de red: ${error.message}`);
      
      if (error.code === "ENOTFOUND") {
        log("yellow", "💡", "Host no encontrado - verifica DB_HOST");
      } else if (error.code === "ECONNREFUSED") {
        log("yellow", "💡", "Conexión rechazada - verifica que PostgreSQL esté corriendo");
      } else if (error.code === "ETIMEDOUT") {
        log("yellow", "💡", "Timeout - posible problema de firewall");
      }
      
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

// ============================================
// DIAGNÓSTICO 5: INFORMACIÓN DEL ENTORNO
// ============================================
function displayEnvironmentInfo() {
  section("5️⃣  INFORMACIÓN DEL ENTORNO");
  
  log("cyan", "🖥️", `Node.js: ${process.version}`);
  log("cyan", "🖥️", `Platform: ${process.platform}`);
  log("cyan", "🖥️", `Architecture: ${process.arch}`);
  log("cyan", "🖥️", `CWD: ${process.cwd()}`);
  
  // Detectar si estamos en Render.com
  if (process.env.RENDER) {
    log("green", "🌐", "Detectado: Render.com");
    log("cyan", "ℹ️", `Render Service: ${process.env.RENDER_SERVICE_NAME || "N/A"}`);
    log("cyan", "ℹ️", `Render Region: ${process.env.RENDER_REGION || "N/A"}`);
  } else {
    log("yellow", "⚠️", "No se detectó Render.com (ejecutando localmente?)");
  }
  
  // Variables de entorno relacionadas con la base de datos
  const dbEnvVars = Object.keys(process.env)
    .filter(key => key.includes("DB") || key.includes("DATABASE"))
    .filter(key => !key.includes("PASSWORD")); // Excluir passwords
  
  if (dbEnvVars.length > 0) {
    console.log(`\n${colors.cyan}Variables DB encontradas:${colors.reset}`);
    dbEnvVars.forEach(key => {
      log("cyan", "  •", `${key} = ${process.env[key]}`);
    });
  }
}

// ============================================
// DIAGNÓSTICO 6: PROBAR QUERIES BÁSICAS
// ============================================
async function testBasicQueries(pool) {
  section("6️⃣  PROBANDO QUERIES BÁSICAS");
  
  const queries = [
    {
      name: "SELECT 1",
      query: "SELECT 1 as test",
      description: "Query más simple posible"
    },
    {
      name: "Versión de PostgreSQL",
      query: "SELECT version()",
      description: "Obtener versión del servidor"
    },
    {
      name: "Listar schemas",
      query: "SELECT schema_name FROM information_schema.schemata",
      description: "Ver schemas disponibles"
    },
    {
      name: "Listar tablas",
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      description: "Ver tablas en schema public"
    }
  ];
  
  for (const { name, query, description } of queries) {
    console.log(`\n${colors.blue}${name}${colors.reset}`);
    log("cyan", "📋", description);
    
    try {
      const start = Date.now();
      const result = await pool.query(query);
      const elapsed = Date.now() - start;
      
      log("green", "✅", `Éxito en ${elapsed}ms`);
      
      if (result.rows.length <= 5) {
        console.log(JSON.stringify(result.rows, null, 2));
      } else {
        log("cyan", "ℹ️", `${result.rows.length} filas retornadas`);
      }
    } catch (error) {
      log("red", "❌", `Error: ${error.message}`);
    }
  }
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================
async function runDiagnostics() {
  console.clear();
  console.log(`
${colors.cyan}╔${"═".repeat(58)}╗
║                                                          ║
║         🔍 DIAGNÓSTICO PostgreSQL - Render.com          ║
║                                                          ║
╚${"═".repeat(58)}╝${colors.reset}
`);
  
  // Paso 1: Variables de entorno
  const envOk = checkEnvironmentVariables();
  if (!envOk) {
    log("red", "💥", "Abortando: Variables de entorno faltantes");
    process.exit(1);
  }
  
  // Paso 2: Información del entorno
  displayEnvironmentInfo();
  
  // Paso 3: Conectividad de red
  const networkOk = await testNetworkConnectivity();
  
  // Paso 4: Probar configuraciones SSL
  const workingConfig = await testSSLConfigurations();
  
  // Paso 5: Probar con connection string
  await testConnectionString();
  
  // Paso 6: Si encontramos una configuración que funciona, probar queries
  if (workingConfig) {
    const pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT) || 5432,
      ssl: workingConfig.ssl
    });
    
    await testBasicQueries(pool);
    await pool.end();
  }
  
  // Resumen final
  section("📊 RESUMEN");
  
  if (workingConfig) {
    console.log(`
${colors.green}✅ DIAGNÓSTICO EXITOSO${colors.reset}

${colors.cyan}Configuración recomendada para tu pool.js:${colors.reset}

${colors.yellow}const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: ${JSON.stringify(workingConfig.ssl, null, 2).split('\n').join('\n  ')}
});${colors.reset}
`);
  } else {
    console.log(`
${colors.red}❌ NO SE PUDO CONECTAR${colors.reset}

${colors.yellow}Posibles soluciones:${colors.reset}

1. ${colors.cyan}Verifica las credenciales en Render.com:${colors.reset}
   • Dashboard → tu servicio → Environment
   • Copia EXACTAMENTE los valores de la base de datos

2. ${colors.cyan}Si usas Render PostgreSQL:${colors.reset}
   • Usa la variable DATABASE_URL en vez de separadas
   • En .env: DATABASE_URL=postgresql://...

3. ${colors.cyan}Verifica que la base de datos esté en la misma región:${colors.reset}
   • Render → Database → Settings
   • Debe estar en la misma región que tu web service

4. ${colors.cyan}Whitelist IP (si es base de datos externa):${colors.reset}
   • Render usa IPs dinámicas
   • La base de datos debe permitir todas las IPs (0.0.0.0/0)

5. ${colors.cyan}Revisa los logs de Render:${colors.reset}
   • Dashboard → tu servicio → Logs
   • Busca errores específicos de conexión
`);
  }
  
  process.exit(workingConfig ? 0 : 1);
}

// ============================================
// EJECUTAR
// ============================================
runDiagnostics().catch(error => {
  console.error(`${colors.red}💥 Error fatal:${colors.reset}`, error);
  process.exit(1);
});