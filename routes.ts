import { Context, Router } from "./config/deps.ts";
import { ROOT_URL, DEV_MODE, NO_CACHE } from "./config/env.ts";
import { log } from "./utils/utils.ts";
import { manifest } from "./config/manifest.ts";
import { handleTrendingRequest } from "./handlers/handleTrendingMoviesRequest.ts";
import { handleCatalogRequest } from "./handlers/handleCatalogRequest.ts";
import { googleKeyMiddleware } from "./middleware/googleKeyMiddleware.ts";
import { searchParamMiddleware } from "./middleware/searchParamMiddleware.ts";
import { setMovieType, setSeriesType } from "./middleware/setTypeMiddleware.ts";
import type {
  AppContext,
  CatalogContext,
  ConfigureContext,
  ManifestContext,
  MovieCatalogParams,
  TrendingParams,
  ManifestParams,
} from "./config/types/types.ts";

import { redis } from "./config/redisCache.ts";
import { index } from "./config/semanticCache.ts";
import { tmdbHealthCheck } from "./services/tmdb.ts";
import { cinemetaHealthCheck } from "./services/cinemeta.ts";
import { rpdbHealthCheck } from "./services/rpdb.ts";
import { handleTraktWatchlistRequest } from "./handlers/handleWatchlistRequest.ts";

const useCache = NO_CACHE !== "true";


const catalogMiddleware = [
  googleKeyMiddleware,
  searchParamMiddleware,
];

const handleSearch = async (ctx: CatalogContext) => {
  const { searchQuery, googleKey, rpdbKey, tmdbKey, type } = ctx.state;
  if (!searchQuery || !googleKey || !tmdbKey || !type) {
    return ctx.response.status = 500, ctx.response.body = { error: "Internal server error: missing required state." };
  }
  log(`Received catalog request for query: ${searchQuery} and type: ${type}`);
  await handleCatalogRequest(ctx, searchQuery, type, googleKey, tmdbKey, rpdbKey);
};

const handleTrending = (ctx: AppContext<TrendingParams>) => handleTrendingRequest(ctx);
const handleTraktRecent = (ctx: Context) => handleTraktWatchlistRequest(ctx);

const handleManifest = async (ctx: ManifestContext) => {
  log("Serving manifest");
  if (useCache && redis) {
    await redis.incr("manifest_requests");
  }
  ctx.response.headers.set("Content-Type", "application/json");
  ctx.response.body = manifest;
};

const handleConfigure = async (ctx: ConfigureContext) => {
  try {
    let installs: string = "NO CACHE";
    let dbSize: string = "NO CACHE";
    let vectorCount: string = "NO CACHE";

    if (useCache && redis && index) {
      installs = await redis.get("manifest_requests") || "0";
      dbSize = String(await redis.dbsize());
      vectorCount = String((await index.info()).vectorCount);
    }
    const htmlContent = await Deno.readTextFile("./views/configure.html");
    const html = htmlContent
      .replace("{{ROOT_URL}}", ROOT_URL)
      .replace("{{VERSION}}", manifest.version)
      .replace("{{INSTALLS}}", installs)
      .replace("{{DB_SIZE}}", dbSize)
      .replace("{{VECTOR_COUNT}}", vectorCount)
      .replace("{{DEV_MODE}}", DEV_MODE ? "DEVELOPMENT MODE" : "");

    ctx.response.headers.set("Content-Type", "text/html");
    ctx.response.body = html;
  } catch (error) {
    console.error("Error serving configure page:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
};

const router = new Router();

router.get<MovieCatalogParams>(
  "/:keys?/catalog/movie/ai-movies/:searchParam",
  setMovieType,
  ...catalogMiddleware,
  handleSearch as unknown as (ctx: AppContext<MovieCatalogParams>) => Promise<void>,
);
router.get<MovieCatalogParams>(
  "/:keys?/catalog/series/ai-tv/:searchParam",
  setSeriesType,
  ...catalogMiddleware,
  handleSearch as unknown as (ctx: AppContext<MovieCatalogParams>) => Promise<void>,
);

router.get<TrendingParams>(
  "/:keys?/catalog/movie/ai-trending-movies.json",
  setMovieType,
  googleKeyMiddleware,
  handleTrending,
);
router.get<TrendingParams>(
  "/:keys?/catalog/series/ai-trending-tv.json",
  setSeriesType,
  googleKeyMiddleware,
  handleTrending,
);

router.get(
  "/:keys?/catalog/movie/ai-trakt-recent-movie.json",
  setMovieType,
  googleKeyMiddleware,
  handleTraktRecent);

  router.get(
    "/:keys?/catalog/series/ai-trakt-recent-tv.json",
    setSeriesType,
    googleKeyMiddleware,
    handleTraktRecent);

router.get<ManifestParams>("/:keys?/manifest.json", googleKeyMiddleware, handleManifest);

router.get("/:keys?/configure", handleConfigure);
router.get("/", (ctx) => ctx.response.redirect("/configure"));

router.get("/health", async (ctx) => {
  const health = {
    redis: true,
    vector: true,
    tmdb: true,
    cinemeta: true,
    ratePosters: true,
  };

  // Internal checks: Redis and Vector index
  if (useCache && redis && index) {
    const [redisResult, indexResult] = await Promise.allSettled([
      redis.ping(),
      index.info(),
    ]);

    if (redisResult.status === "fulfilled") {
      health.redis = redisResult.value === "PONG";
    } else {
      console.error("Redis health check failed:", redisResult.reason);
      health.redis = false;
    }

    if (indexResult.status === "fulfilled") {
      health.vector = indexResult.value.vectorCount !== null;
    } else {
      console.error("Vector index health check failed:", indexResult.reason);
      health.vector = false;
    }
  }

  // External checks run concurrently
  const [tmdbResult, cinemetaResult, ratePostersResult] = await Promise.allSettled([
    tmdbHealthCheck(),
    cinemetaHealthCheck(),
    rpdbHealthCheck(),
  ]);

  health.tmdb = tmdbResult.status === "fulfilled" ? tmdbResult.value : false;
  if (tmdbResult.status !== "fulfilled") {
    console.error("TMDB health check failed:", tmdbResult.reason);
  }

  health.cinemeta = cinemetaResult.status === "fulfilled" ? cinemetaResult.value : false;
  if (cinemetaResult.status !== "fulfilled") {
    console.error("Cinemeta health check failed:", cinemetaResult.reason);
  }

  health.ratePosters = ratePostersResult.status === "fulfilled" ? ratePostersResult.value : false;
  if (ratePostersResult.status !== "fulfilled") {
    console.error("RatePosters health check failed:", ratePostersResult.reason);
  }

  // Overall health status: all services must be healthy
  const allHealthy = Object.values(health).every(status => status);

  if (allHealthy) {
    ctx.response.status = 200;
    ctx.response.headers.set("Content-Type", "text/plain");
    ctx.response.body = "OK";
  } else {
    ctx.response.status = 500;
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = JSON.stringify({
      status: "unhealthy",
      redis: health.redis ? "ok" : "failed",
      vector: health.vector ? "ok" : "failed",
      tmdb: health.tmdb ? "ok" : "failed",
      cinemeta: health.cinemeta ? "ok" : "failed",
      ratePosters: health.ratePosters ? "ok" : "failed",
    });
  }
});

router.get("/favicon.ico", (ctx) => {
  ctx.response.status = 200;
  ctx.response.headers.set("Content-Type", "text/plain");
  ctx.response.body = "Not Found";
});
router.get("/images/logo.webp", (ctx) => {
  ctx.response.status = 200;
  ctx.response.headers.set("Content-Type", "image/webp");
  ctx.response.body = Deno.readFileSync("./views/images/filmwhisper.webp");
});
router.get("/images/background.webp", (ctx) => {
  ctx.response.status = 200;
  ctx.response.headers.set("Content-Type", "image/webp");
  ctx.response.body = Deno.readFileSync("./views/images/fw-background.webp");
});

export default router;