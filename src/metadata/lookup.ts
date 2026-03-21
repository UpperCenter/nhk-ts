import type { EpisodeMetadata } from './types.js';
import { compareTwoStrings } from 'string-similarity';
import { Logger } from '../logger.js';

/** Normalize titles for fuzzy matching (quotes, dashes, whitespace). */
export function normalizeEpisodeTitleForMatch(s: string): string {
    return s
        .toLowerCase()
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

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

    const title = normalizeEpisodeTitleForMatch(episodeTitle);
    let bestScore = 0;
    let bestEpisode: EpisodeMetadata | null = null;
    const comparisons: { name: string; score: number }[] = [];

    for (const ep of episodes) {
        const epNorm = normalizeEpisodeTitleForMatch(ep.name);
        const score = compareTwoStrings(title, epNorm);
        comparisons.push({ name: ep.name, score });
        if (score > bestScore) {
            bestScore = score;
            bestEpisode = ep;
        }
    }

    // Sort by score for logging
    comparisons.sort((a, b) => b.score - a.score);

    logger.debug(`[METADATA] EPG title lookup: "${episodeTitle}"`);
    logger.debug(`[METADATA] Top 5 episode title matches:`);
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