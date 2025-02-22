import { AppContext, Keys } from "../config/types/types.ts";
import { isValidGeminiApiKey } from "../utils/isValidGeminiApiKey.ts";
import { GEMINI_API_KEY, TMDB_API_KEY } from "../config/env.ts";
import { decodeUrlSafeBase64 } from "../utils/urlSafe.ts";
import { encryptKeys, decryptKeys } from "../utils/encryptDecrypt.ts";
import { redis } from "../config/redisCache.ts";
import { refreshTraktToken } from "../services/trakt.ts";

// Parse old-style keysParam
function parseKeysParam(keysParam: string | undefined): Keys {
  const defaultKeys: Keys = {
    googleKey: String(GEMINI_API_KEY),
    tmdbKey: String(TMDB_API_KEY),
    rpdbKey: "",
    traktKey: "",
    traktRefresh: "",
    traktExpiresAt: "",
    userId: "",
  };

  if (!keysParam) {
    return defaultKeys;
  }

  try {
    const decodedFromUrl = decodeURIComponent(keysParam);
    const decodedBase64 = decodeUrlSafeBase64(decodedFromUrl);
    const parsed = JSON.parse(decodedBase64);
    console.log("[parseKeysParam] Parsed keys:", parsed);

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Parsed keys must be an object");
    }

    let googleKey = parsed.googleKey || GEMINI_API_KEY;
    let tmdbKey = parsed.tmdbKey || TMDB_API_KEY;
    const rpdbKey = parsed.rpdbKey || "";
    const traktKey = parsed.traktKey || "";
    const traktRefresh = parsed.traktRefresh || "";
    const traktExpiresAt = parsed.traktExpiresAt || "";

    if (googleKey === "default") googleKey = GEMINI_API_KEY;
    if (tmdbKey === "default") tmdbKey = TMDB_API_KEY;

    return { googleKey, tmdbKey, rpdbKey, traktKey, traktRefresh, traktExpiresAt };
  } catch (error) {
    console.error("[parseKeysParam] Error parsing keys:", error);
    return defaultKeys;
  }
}


export const googleKeyMiddleware = async <
  P extends Record<string, string | undefined>,
>(ctx: AppContext<P>, next: () => Promise<unknown>) => {

  try {
    let keys: Keys;
    const pathParts = ctx.request.url.pathname.split("/");

    if (pathParts[1]?.startsWith("user:")) {
      const userId = pathParts[1].replace("user:", "");
      const encryptedKeys = await redis?.get(`user:${userId}`);
      
      if (!encryptedKeys) {
        console.error(`[googleKeyMiddleware] No keys found for user:${userId}`);
        ctx.response.status = 404;
        ctx.response.body = { error: "User keys not found" };
        return;
      }

      keys = decryptKeys(encryptedKeys);

      keys.userId = userId;

      if (keys.traktExpiresAt && Date.now() > new Date(keys.traktExpiresAt).getTime()) {
        console.log(`[googleKeyMiddleware] Refreshing expired Trakt token for user:${userId}`);
        const newKeys = await refreshTraktToken(keys.traktRefresh);
        keys = { ...keys, ...newKeys };
        await redis?.set(`user:${userId}`, encryptKeys(keys));
      }
    } else {
      const keysParam = ctx.params.keys;
      keys = parseKeysParam(keysParam);
    }

    const finalGoogleKey = isValidGeminiApiKey(keys.googleKey) ? keys.googleKey : GEMINI_API_KEY;

    ctx.state.googleKey = finalGoogleKey;
    ctx.state.tmdbKey = keys.tmdbKey;
    ctx.state.rpdbKey = keys.rpdbKey;
    ctx.state.traktKey = keys.traktKey;
    ctx.state.userId = keys.userId;

    await next();
  } catch (error) {
    console.error("[googleKeyMiddleware] Error encountered:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
};