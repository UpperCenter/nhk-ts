import type { EpisodeMetadata } from './types.js';
import { compareTwoStrings } from 'string-similarity';

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