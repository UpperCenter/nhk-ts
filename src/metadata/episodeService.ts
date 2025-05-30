import { promises as fs } from 'fs';
import type { ProgramOptions } from '../types.js';
import { Logger } from '../logger.js';
import { loadCache, saveCache } from './cache.js';
import { retrieveEpisodeList } from './scrapeEpisodes.js';
import { sleep } from '../utils.js';
import type { EpisodeMetadata } from './types.js';

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
    const cacheTTL = 1000 * 60 * 60 * 24; // 1 day

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