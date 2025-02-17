import { AppContext } from "../config/types/types.ts";
import { isValidGeminiApiKey } from "../utils/isValidGeminiApiKey.ts";
import { GEMINI_API_KEY } from "../config/env.ts";
import { decodeUrlSafeBase64 } from "../utils/urlSafe.ts";

export const googleKeyMiddleware = async <
  P extends Record<string, string | undefined>,
>(ctx: AppContext<P>, next: () => Promise<unknown>) => {
  try {
    const keysParam = ctx.params.keys;
    let googleKey: string;
    let rpdbKey: string;

    if (keysParam) {
      const decodedFromUrl = decodeURIComponent(keysParam);
      const decodedBase64 = decodeUrlSafeBase64(decodedFromUrl);

      try {
        // Try to parse the decoded string as JSON.
        const parsedKeys = JSON.parse(decodedBase64);
        googleKey = parsedKeys.googleKey;
        if (googleKey === "default") googleKey = GEMINI_API_KEY;

        rpdbKey = parsedKeys.rpdbKey || "";
      } catch {
        // Fallback for legacy usage where the key is a simple string.
        googleKey = GEMINI_API_KEY;
        rpdbKey = "";
      }
    } else {
      googleKey = GEMINI_API_KEY;
      rpdbKey = "";
    }

    const finalGoogleKey = getGoogleKey(googleKey);
    ctx.state.googleKey = finalGoogleKey;
    ctx.state.rpdbKey = rpdbKey;
    await next();
  } catch (error) {
    console.error("[googleKeyMiddleware] Error encountered:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
};

function getGoogleKey(providedKey?: string): string {
  const valid = isValidGeminiApiKey(providedKey ?? "");
  return valid ? providedKey! : GEMINI_API_KEY;
}
