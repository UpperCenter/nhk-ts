import { NfoData, NhkEpgEntry } from './types.js';
import { compareTwoStrings } from 'string-similarity';
import { Logger } from '../logger.js';

const TITLE_SIMILARITY_THRESHOLD = 0.8;

/**
 * Finds the best EPG entry matching the NFO data by finding the program
 * with the most similar title that aired closest in time to the recording.
 *
 * @param nfoData - The parsed data from the .nfo file, must include recordingEndUTC.
 * @param epgEntries - A list of EPG entries to search through.
 * @param logger - The logger instance.
 * @returns The best matching EPG entry, or null if no suitable match is found.
 */
export function findEpgMatch(nfoData: NfoData, epgEntries: NhkEpgEntry[], logger: Logger): NhkEpgEntry | null {
    if (!nfoData.recordingEndUTC) {
        logger.debug('[METADATA] EPG Matcher: No recording end time found in NFO data. Skipping EPG match.');
        return null;
    }

    logger.debug('[METADATA] EPG Matcher: Finding best match by title and time proximity.');
    logger.debug(`[METADATA] Recording end time (UTC): ${nfoData.recordingEndUTC.toISOString()}`);

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
        const epgEndTime = new Date(entry.endTime);

        if (isNaN(epgStartTime.getTime()) || isNaN(epgEndTime.getTime())) continue;

        const epgDurationMs = epgEndTime.getTime() - epgStartTime.getTime();
        const estimatedRecordingStart = new Date(nfoData.recordingEndUTC.getTime() - epgDurationMs);

        const timeDiff = Math.abs(epgStartTime.getTime() - estimatedRecordingStart.getTime());

        logger.debug(`  - Comparing with "${entry.title}" (Score: ${score.toFixed(2)}).`);
        logger.debug(`    - EPG Start (JST): ${entry.startTime}`);
        logger.debug(`    - EPG Duration: ${Math.round(epgDurationMs / 1000 / 60)}m`);
        logger.debug(`    - Estimated Recording Start (UTC): ${estimatedRecordingStart.toISOString()}`);
        logger.debug(`    - Actual EPG Start (UTC):      ${epgStartTime.toISOString()}`);
        logger.debug(`    - Time difference: ${Math.round(timeDiff / 1000)}s`);

        if (timeDiff < smallestTimeDiff) {
            smallestTimeDiff = timeDiff;
            closestEntry = entry;
        }
    }

    if (closestEntry) {
        logger.info(`[METADATA] Closest EPG match is "${closestEntry.title}" with an estimated time difference of ${Math.round(smallestTimeDiff / 1000)}s.`);
    } else {
        logger.warning('[METADATA] Could not determine the closest EPG entry among title matches.');
    }

    return closestEntry;
}
