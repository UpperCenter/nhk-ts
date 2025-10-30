import { NfoData, NhkEpgEntry } from './types.js';
import { compareTwoStrings } from 'string-similarity';
import { Logger } from '../logger.js';

const TITLE_SIMILARITY_THRESHOLD = 0.8;
const TIME_MATCH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Finds the best EPG entry matching the NFO data by finding the program
 * with the most similar title that aired closest in time to the recording's start time.
 *
 * @param nfoData - The parsed data from the .nfo file, must include recordingStartUTC.
 * @param epgEntries - A list of EPG entries to search through.
 * @param logger - The logger instance.
 * @returns The best matching EPG entry, or null if no suitable match is found.
 */
export function findEpgMatch(nfoData: NfoData, epgEntries: NhkEpgEntry[], logger: Logger): NhkEpgEntry | null {
    if (!nfoData.recordingStartUTC) {
        logger.debug('[METADATA] EPG Matcher: No recording start time found in NFO data. Skipping EPG match.');
        return null;
    }

    logger.debug('[METADATA] EPG Matcher: Finding best match by title and time proximity.');
    logger.debug(`[METADATA] Recording start time (UTC): ${nfoData.recordingStartUTC.toISOString()}`);

    const titleMatches = epgEntries
        .map(entry => ({
            entry,
            score: compareTwoStrings(nfoData.title.toLowerCase(), entry.title.toLowerCase()),
        }))
        .filter(item => item.score >= TITLE_SIMILARITY_THRESHOLD);

    if (titleMatches.length === 0) {
        logger.debug(`[METADATA] No EPG entries found with a title similar to "${nfoData.title}" (score >= ${TITLE_SIMILARITY_THRESHOLD}).`);
        return null;
    }

    logger.debug(`[METADATA] Found ${titleMatches.length} EPG entries with similar titles. Now finding the one closest in time.`);

    let closestEntry: NhkEpgEntry | null = null;
    let smallestTimeDiff = Infinity;

    for (const { entry, score } of titleMatches) {
        const epgStartTime = new Date(entry.startTime);
        if (isNaN(epgStartTime.getTime())) continue;

        const timeDiff = Math.abs(epgStartTime.getTime() - nfoData.recordingStartUTC.getTime());

        logger.debug(`  - Comparing with "${entry.title}" (Score: ${score.toFixed(2)}) at ${epgStartTime.toISOString()}. Time diff: ${Math.round(timeDiff / 1000)}s.`);

        if (timeDiff < smallestTimeDiff) {
            smallestTimeDiff = timeDiff;
            closestEntry = entry;
        }
    }

    if (closestEntry && smallestTimeDiff <= TIME_MATCH_THRESHOLD_MS) {
        logger.info(`[METADATA] Closest EPG match is "${closestEntry.title}" with a time difference of ${Math.round(smallestTimeDiff / 1000)}s.`);
        return closestEntry;
    } else {
        if (closestEntry) {
            logger.warning(`[METADATA] Closest match "${closestEntry.title}" was ${Math.round(smallestTimeDiff / 1000)}s away, which is outside the ${TIME_MATCH_THRESHOLD_MS / 1000}s threshold.`);
        } else {
            logger.warning('[METADATA] Could not determine the closest EPG entry among title matches.');
        }
        return null;
    }
}
