import { TMDBDetails } from "../config/types.ts";
import { TMDB_API_KEY } from "../config/env.ts";
import { redis } from "../config/redisCache.ts";

export async function getTmdbDetails(imdbId: string): Promise<TMDBDetails> {
  const redisKey = `movie:${imdbId}`;

  try {
    const cached = await redis.get<TMDBDetails>(redisKey);
    if (cached) {
      console.log(`[${new Date().toISOString()}] Returning cached details for ${imdbId}`);
      return cached;
    }
  } catch (cacheError) {
    console.error(`[${new Date().toISOString()}] Redis cache error for ${imdbId}:`, cacheError);
  }

  console.log(`[${new Date().toISOString()}] Fetching TMDB details for imdbId: ${imdbId}`);
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_API_KEY}`
    );
    if (!response.ok) {
      throw new Error(`TMDB API responded with status ${response.status}`);
    }
    const data = await response.json();
    const movieDetails = data.movie_results?.[0];

    let result: TMDBDetails;
    if (!movieDetails) {
      result = { id: imdbId, poster: null, showName: null, year: null };
    } else {
      result = {
        id: imdbId,
        poster: movieDetails.poster_path
          ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
          : null,
        showName: movieDetails.title,
        year: movieDetails.release_date ? movieDetails.release_date.split("-")[0] : null,
      };
    }

    if (result.poster) {
      try {
        await redis.set(redisKey, JSON.stringify(result));
        await redis.set(`movie:${result.id}`, JSON.stringify(result));
        console.log(`[${new Date().toISOString()}] Cached details for ${imdbId}`);
      } catch (cacheSetError) {
        console.error(`[${new Date().toISOString()}] Error setting cache for ${imdbId}:`, cacheSetError);
      }
    }

    return result;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching TMDB details for ${imdbId}:`, error);
    return { id: imdbId, poster: null, showName: null, year: null };
  }
}

export async function getTmdbDetailsByName(movieName: string): Promise<TMDBDetails> {
  const normalizedName = movieName.toLowerCase().trim();
  const redisKey = `movie:name:${normalizedName}`;

  try {
    const cached = await redis.get<TMDBDetails>(redisKey);
    if (cached) {
      console.log(`[${new Date().toISOString()}] Returning cached details for movie: ${movieName}`);
      return cached;
    }
  } catch (cacheError) {
    console.error(`[${new Date().toISOString()}] Redis cache error for movie: ${movieName}`, cacheError);
  }

  console.log(`[${new Date().toISOString()}] Fetching TMDB details for movie: ${movieName}`);
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movieName)}`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) throw new Error(`TMDB search API responded with status ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const firstResult = searchData.results?.[0];
    if (!firstResult) throw new Error(`No results found for movie name: ${movieName}`);

    const tmdbId = firstResult.id;
    const detailsUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    const detailsResponse = await fetch(detailsUrl);
    if (!detailsResponse.ok) throw new Error(`TMDB details API responded with status ${detailsResponse.status}`);
  
    const detailsData = await detailsResponse.json();
    const imdbId = detailsData.external_ids?.imdb_id;

    let result: TMDBDetails;
    if (!imdbId) {
      result = { id: "", poster: null, showName: null, year: null };
    } else {
      result = {
        id: imdbId,
        poster: detailsData.poster_path
          ? `https://image.tmdb.org/t/p/w500${detailsData.poster_path}`
          : null,
        showName: detailsData.title,
        year: detailsData.release_date ? detailsData.release_date.split("-")[0] : null,
      };
    }

    if (result.poster) {
      try {
        await redis.set(redisKey, JSON.stringify(result));
        await redis.set(`movie:${imdbId}`, JSON.stringify(result));
        console.log(`[${new Date().toISOString()}] Cached details for movie: ${movieName}`);
      } catch (cacheSetError) {
        console.error(`[${new Date().toISOString()}] Error setting cache for movie: ${movieName}`, cacheSetError);
      }
    }

    return result;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching TMDB details for movie: ${movieName}`, error);
    return { id: "", poster: null, showName: null, year: null };
  }
}