import type { ProgramOptions } from '../types.js';
import { Logger } from '../logger.js';
import { loadCache, saveCache } from './cache.js';
import { retrieveEpisodeList } from './scrapeEpisodes.js';
import { fetchAllEpisodes } from './tmdbClient.js';
import { sleep } from '../utils.js';
import type { EpisodeMetadata, ResolvedSeries } from './types.js';

const cacheTTL = 1000 * 60 * 60 * 24; // 1 day

/**
 * Load episodes for a series slug, using caching and rate-limiting
 */
export async function loadEpisodes(
    slug: string,
    options: ProgramOptions,
    logger: Logger
): Promise<EpisodeMetadata[]> {
    const cachePath = options.metadataCache!;
    const rateLimit = options.metadataRateLimit || 1;

    // Load existing cache
    const cache = await loadCache(cachePath);
    const entry = cache[slug];
    if (entry && Date.now() - entry.timestamp < cacheTTL) {
        logger.info(`[METADATA] Using cached episode list for series ${slug}`);
        return entry.episodes as EpisodeMetadata[];
    }

    // Rate limit
    const delayMs = 1000 / rateLimit;
    await sleep(delayMs);

    // Fetch fresh
    logger.info(`[METADATA] Fetching episode list for series ${slug} from TVDB scraper`);
    const episodes = await retrieveEpisodeList(slug, options.metadataUserAgent!);

    // Update cache
    cache[slug] = { timestamp: Date.now(), episodes };
    await saveCache(cachePath, cache);

    return episodes;
}

/**
 * Load episodes for a resolved series (TVDB slug scrape or TMDB API), using caching and rate-limiting.
 */
export async function loadEpisodesForSeries(
    resolved: ResolvedSeries,
    options: ProgramOptions,
    logger: Logger
): Promise<EpisodeMetadata[]> {
    if (resolved.source === 'tvdb') {
        return loadEpisodes(resolved.slug, options, logger);
    }

    const cachePath = options.metadataCache!;
    const rateLimit = options.metadataRateLimit || 1;
    const delayMs = 1000 / rateLimit;
    const cacheKey = `tmdb:${resolved.tmdbSeriesId}`;

    const cache = await loadCache(cachePath);
    const entry = cache[cacheKey];
    if (entry && Date.now() - entry.timestamp < cacheTTL) {
        logger.info(`[METADATA] Using cached episode list for TMDB series ${resolved.tmdbSeriesId}`);
        return entry.episodes as EpisodeMetadata[];
    }

    if (!options.tmdbApiKey) {
        throw new Error('TMDB API key required for TMDB episode fetch');
    }

    await sleep(delayMs);
    logger.info(`[METADATA] Fetching episode list for TMDB series ${resolved.tmdbSeriesId}`);
    const episodes = await fetchAllEpisodes(
        resolved.tmdbSeriesId,
        options.tmdbApiKey,
        options.metadataUserAgent!,
        delayMs,
        sleep,
        logger
    );

    cache[cacheKey] = { timestamp: Date.now(), episodes };
    await saveCache(cachePath, cache);

    return episodes;
} 