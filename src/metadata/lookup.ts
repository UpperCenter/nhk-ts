import type { EpisodeMetadata } from './types.js';
import { compareTwoStrings } from 'string-similarity';
import { Logger } from '../logger.js';

/**
 * Given a list of episodes and an NFO description, return the best-matching episode
 */
export function lookupEpisodeByDescription(
    episodes: EpisodeMetadata[],
    description: string
): EpisodeMetadata | null {
    const desc = description.toLowerCase();
    let bestScore = 0;
    let bestEpisode: EpisodeMetadata | null = null;
    for (const ep of episodes) {
        const overview = ep.overview.toLowerCase();
        const score = compareTwoStrings(desc, overview);
        if (score > bestScore) {
            bestScore = score;
            bestEpisode = ep;
        }
    }
    // Change this if we aren't getting good matches
    const THRESHOLD = 0.8;
    if (bestScore >= THRESHOLD && bestEpisode) {
        return bestEpisode;
    }
    return null;
}

/**
 * Given a list of episodes and an EPG episode title, return the best-matching episode.
 * This is more reliable than description matching when an accurate episode title is available.
 */
export function lookupEpisodeByTitle(
    episodes: EpisodeMetadata[],
    episodeTitle: string,
    logger: Logger,
): EpisodeMetadata | null {
    if (!episodeTitle) {
        return null;
    }

    const title = episodeTitle.toLowerCase();
    let bestScore = 0;
    let bestEpisode: EpisodeMetadata | null = null;
    const comparisons: { name: string; score: number }[] = [];

    for (const ep of episodes) {
        const score = compareTwoStrings(title, ep.name.toLowerCase());
        comparisons.push({ name: ep.name, score });
        if (score > bestScore) {
            bestScore = score;
            bestEpisode = ep;
        }
    }

    // Sort by score for logging
    comparisons.sort((a, b) => b.score - a.score);

    logger.debug(`[METADATA] EPG title lookup: "${episodeTitle}"`);
    logger.debug(`[METADATA] Top 5 TVDB matches:`);
    comparisons.slice(0, 5).forEach(c => {
        logger.debug(`  - "${c.name}" (Score: ${c.score.toFixed(2)})`);
    });

    // Use a higher threshold for title matching to ensure accuracy
    const THRESHOLD = 0.85;
    if (bestScore >= THRESHOLD && bestEpisode) {
        logger.debug(`[METADATA] Best match found: "${bestEpisode.name}" with score ${bestScore.toFixed(2)}`);
        return bestEpisode;
    }

    logger.debug(`[METADATA] No match found above threshold ${THRESHOLD}. Best score was ${bestScore.toFixed(2)}.`);
    return null;
} 