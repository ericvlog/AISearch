import { Context } from "../config/deps.ts";
import { getTrendingMovies, getTrendingSeries } from "../utils/getTrending.ts";

export const handleTrendingRequest = async (ctx: Context): Promise<void> => {
  const { type, rpdbKey } = ctx.state;
  console.log(`rpdbKey: ${rpdbKey}`);

  if (!type) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Trending type is required." };
    return;
  }

  // Wrap the trending functions in arrow functions
  const trendingHandlers: Record<string, () => Promise<unknown>> = {
    movie: () => getTrendingMovies(rpdbKey),
    series: () => getTrendingSeries(rpdbKey),
  };

  const getTrending = trendingHandlers[type];

  if (!getTrending) {
    ctx.response.status = 400;
    ctx.response.body = { error: `Invalid trending type: ${type}` };
    return;
  }

  try {
    const trendingResponse = await getTrending();
    //ctx.response.headers.set("Cache-Control", "max-age=3600");
    ctx.response.body = trendingResponse;
  } catch (error) {
    console.error("Error handling trending request:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: `Failed to fetch trending ${type}` };
  }
};