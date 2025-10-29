import { Logger } from '../logger.js';
import { loadCache, saveCache } from './cache.js';
import { NhkEpgData, NhkEpgEntry } from './types.js';

const EPG_BASE_URL = 'https://masterpl.hls.nhkworld.jp/epg/w';

/**
 * Fetches the NHK World EPG for a given date.
 * To account for timezone differences (NFO is UTC, EPG is JST), it fetches
 * the EPG for the given date and the next day.
 * It caches each day's EPG data separately for efficiency.
 *
 * @param nfoDate - The date from the NFO file (e.g., "2025-10-27").
 * @param logger - The logger instance.
 * @returns A combined list of EPG entries for the two days.
 */
export async function fetchEpgForDate(nfoDate: string, logger: Logger): Promise<NhkEpgEntry[]> {
    const cachePath = 'epg-cache.json';
    const cacheTTL = 1000 * 60 * 60 * 24; // 1 day
    const cache = await loadCache(cachePath);

    const date = new Date(nfoDate);
    const datePlusOne = new Date(date);
    datePlusOne.setDate(date.getDate() + 1);

    const dateStr = nfoDate.replace(/-/g, '');
    const year = datePlusOne.getFullYear();
    const month = String(datePlusOne.getMonth() + 1).padStart(2, '0');
    const day = String(datePlusOne.getDate()).padStart(2, '0');
    const datePlusOneStr = `${year}${month}${day}`;

    const datesToFetch = [dateStr, datePlusOneStr];
    const allEntries: NhkEpgEntry[] = [];
    let cacheNeedsUpdate = false;

    logger.info(`[METADATA] Checking EPG cache for ${datesToFetch.join(' and ')}...`);

    for (const dateKey of datesToFetch) {
        const entry = cache[dateKey];
        if (entry && Date.now() - entry.timestamp < cacheTTL) {
            logger.debug(`[METADATA] Using cached EPG data for ${dateKey}`);
            allEntries.push(...(entry.episodes as NhkEpgEntry[]));
        } else {
            const url = `${EPG_BASE_URL}/${dateKey}.json`;
            logger.info(`[METADATA] Fetching fresh EPG data from ${url}`);
            try {
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
                        'Accept': '*/*',
                        'Referer': 'https://www3.nhk.or.jp/',
                        'Origin': 'https://www3.nhk.or.jp',
                    },
                });
                if (res.ok) {
                    const data: NhkEpgData = await res.json();
                    if (data && data.data) {
                        allEntries.push(...data.data);
                        cache[dateKey] = { timestamp: Date.now(), episodes: data.data };
                        cacheNeedsUpdate = true;
                    }
                } else {
                    logger.warning(`[METADATA] Failed to fetch EPG from ${url}: ${res.statusText}`);
                }
            } catch (error) {
                logger.warning(`[METADATA] Error fetching EPG from ${url}: ${error}`);
            }
        }
    }

    if (cacheNeedsUpdate) {
        await saveCache(cachePath, cache);
    }

    return allEntries;
}
