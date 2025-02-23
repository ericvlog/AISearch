import { load } from "jsr:@std/dotenv";
import { log, logError } from "../utils/utils.ts";
import { Buffer } from "./deps.ts";

// Load .env file in development mode.
const DEV_MODE = Deno.env.get("DEV_MODE");
if (DEV_MODE === "true") {
  await load({ export: true });
  log("Development mode: .env file loaded.");
}

const NO_CACHE = Deno.env.get("DISABLE_CACHE") ?? "false";
if (NO_CACHE === "true") {
  log("!!! Caching disabled !!!");
}

// Load environment variables.

const GOOGLE_MODEL = Deno.env.get("GOOGLE_MODEL") || 'gemini-2.0-flash-lite-preview-02-05'; // cheapest one with the highest rate limit.. we need it now! hahah
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || 'gpt-4o-mini';
const OMDB_API_KEY = Deno.env.get("OMDB_API_KEY");

const geminiKey = Deno.env.get("GEMINI_API_KEY");
const tmdbKey = Deno.env.get("TMDB_API_KEY");
const upstashRedisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const upstashRedisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
const upstashVectorUrl = Deno.env.get("UPSTASH_VECTOR_REST_URL");
const upstashVectorToken = Deno.env.get("UPSTASH_VECTOR_REST_TOKEN");
const RPDB_FREE_API_KEY = Deno.env.get("RPDB_FREE_API_KEY")!;

const RESET_VECTOR_CRON = Deno.env.get("RESET_VECTOR_CRON") || "0 0 1 * *";

const SEMANTIC_PROXIMITY = Number(Deno.env.get("SEMANTIC_PROXIMITY") || 0.95);
if(SEMANTIC_PROXIMITY > 1.0 || SEMANTIC_PROXIMITY < 0.0) {
  logError("SEMANTIC_PROXIMITY must be a float between 0.0 and 1.0", null);
  throw new Error("Invalid SEMANTIC_PROXIMITY");
}

const SEARCH_COUNT_STR = Deno.env.get("SEARCH_COUNT") || "20";
const SEARCH_COUNT = parseInt(SEARCH_COUNT_STR, 10);
const portStr = Deno.env.get("PORT") || "3000";
const PORT = parseInt(portStr, 10);
const ROOT_URL = Deno.env.get("ROOT_URL") || `http://localhost:${PORT}`;

const TRAKT_CLIENT_ID = String(Deno.env.get("TRAKT_CLIENT_ID"));
const TRAKT_CLIENT_SECRET = String(Deno.env.get("TRAKT_CLIENT_SECRET"));

const ENCRYPTION_KEY = String(Deno.env.get("ENCRYPTION_KEY"));
const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex");
if (keyBuffer.length !== 32) {
  throw new Error(`Invalid ENCRYPTION_KEY length: ${keyBuffer.length} bytes, expected 32 bytes for AES-256. Must be a 64-char hex string.`);
}

if (
  !geminiKey ||
  !OMDB_API_KEY ||
  !RPDB_FREE_API_KEY ||
  !ENCRYPTION_KEY ||
  !TRAKT_CLIENT_ID ||
  !TRAKT_CLIENT_SECRET ||
  !tmdbKey ||
  (NO_CACHE !== "true" && (!upstashRedisUrl || !upstashRedisToken || !upstashVectorUrl || !upstashVectorToken))
) {
  logError(
    "Missing API keys or configuration: Ensure GEMINI_API_KEY, TRAKT_API_KEY, TRAKT_CLIENT_SECRET, TMDB_API_KEY, AI_MODEL, and (if caching is enabled) UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPSTASH_VECTOR_REST_URL, and UPSTASH_VECTOR_REST_TOKEN are set in the environment. If in dev, use DEV_MODE.",
    null,
  );
  throw new Error("Missing required environment variables");
}

const UPSTASH_REDIS_URL_FINAL = NO_CACHE === "true" ? "" : upstashRedisUrl!;
const UPSTASH_REDIS_TOKEN_FINAL = NO_CACHE === "true" ? "" : upstashRedisToken!;
const UPSTASH_VECTOR_URL_FINAL = NO_CACHE === "true" ? "" : upstashVectorUrl!;
const UPSTASH_VECTOR_TOKEN_FINAL = NO_CACHE === "true" ? "" : upstashVectorToken!;

export {
  ROOT_URL,
  ENCRYPTION_KEY,
  DEV_MODE,
  NO_CACHE,
  TRAKT_CLIENT_ID,
  TRAKT_CLIENT_SECRET,
  geminiKey as GEMINI_API_KEY,
  PORT,
  RPDB_FREE_API_KEY,
  OMDB_API_KEY,
  SEARCH_COUNT,
  tmdbKey as TMDB_API_KEY,
  UPSTASH_REDIS_TOKEN_FINAL as UPSTASH_REDIS_TOKEN,
  UPSTASH_REDIS_URL_FINAL as UPSTASH_REDIS_URL,
  UPSTASH_VECTOR_TOKEN_FINAL as UPSTASH_VECTOR_TOKEN,
  UPSTASH_VECTOR_URL_FINAL as UPSTASH_VECTOR_URL,
  RESET_VECTOR_CRON,
  SEMANTIC_PROXIMITY,

  GOOGLE_MODEL,
  OPENAI_MODEL,
};
