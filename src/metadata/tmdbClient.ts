import { compareTwoStrings } from 'string-similarity';
import type { EpisodeMetadata, NfoData } from './types.js';
import type { Logger } from '../logger.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';

interface TmdbSearchTvResult {
    id: number;
    name: string;
    original_name: string;
    first_air_date?: string;
}

interface TmdbSearchTvResponse {
    results?: TmdbSearchTvResult[];
}

interface TmdbTvDetails {
    id: number;
    name: string;
    first_air_date?: string;
    networks?: { id: number; name: string }[];
    seasons?: { season_number: number }[];
    number_of_seasons?: number;
}

interface TmdbSeasonEpisode {
    id: number;
    name: string;
    overview: string;
    air_date: string | null;
    episode_number: number;
    season_number: number;
}

interface TmdbSeasonResponse {
    episodes?: TmdbSeasonEpisode[];
}

function authHeaders(accessToken: string, userAgent: string): HeadersInit {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': userAgent,
    };
}

async function tmdbGet<T>(
    path: string,
    accessToken: string,
    userAgent: string
): Promise<T> {
    const url = path.startsWith('http') ? path : `${TMDB_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetch(url, { headers: authHeaders(accessToken, userAgent) });
    if (!res.ok) {
        throw new Error(`TMDB ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
}

function yearFromFirstAirDate(firstAirDate: string | undefined): string {
    if (!firstAirDate) return '';
    const y = firstAirDate.slice(0, 4);
    return /^\d{4}$/.test(y) ? y : '';
}

function scoreResult(titleLower: string, item: TmdbSearchTvResult): number {
    const name = (item.name || '').toLowerCase();
    const original = (item.original_name || '').toLowerCase();
    return Math.max(compareTwoStrings(titleLower, name), compareTwoStrings(titleLower, original));
}

function hasNhkNetwork(details: TmdbTvDetails): boolean {
    const nets = details.networks || [];
    return nets.some(n => /nhk/i.test(n.name || ''));
}

/**
 * Search TMDB for a TV series matching the NFO title.
 * Does not pass first_air_date_year: NFO `date` is the episode/recording day, not the series
 * premiere year; TMDB would filter out long-running shows (e.g. Asia Insight premiered 2012).
 * Ranks by title similarity; if top scores are close, prefers NHK network when present.
 */
export async function searchTvSeries(
    nfoData: NfoData,
    accessToken: string,
    userAgent: string,
    logger: Logger
): Promise<{ tmdbSeriesId: number; name: string; year: string } | null> {
    const titleLower = nfoData.title.trim().toLowerCase();
    const params = new URLSearchParams({ query: nfoData.title.trim(), include_adult: 'false' });

    const path = `/search/tv?${params.toString()}`;
    let data: TmdbSearchTvResponse;
    try {
        data = await tmdbGet<TmdbSearchTvResponse>(path, accessToken, userAgent);
    } catch (e) {
        logger.warning(`[METADATA] TMDB search failed: ${e}`);
        return null;
    }

    const results = data.results || [];
    if (results.length === 0) {
        logger.warning(`[METADATA] TMDB: no results for "${nfoData.title}"`);
        return null;
    }

    const scored = results
        .map(item => ({ item, score: scoreResult(titleLower, item) }))
        .sort((a, b) => b.score - a.score);

    const top = scored[0]!;
    let chosen = top.item;

    const second = scored[1];
    if (second && Math.abs(top.score - second.score) < 0.03) {
        const candidates = scored.slice(0, 3).filter(s => Math.abs(top.score - s.score) < 0.05);
        let bestNhk: TmdbSearchTvResult | null = null;
        let bestNhkScore = -1;
        for (const { item, score } of candidates) {
            try {
                const details = await tmdbGet<TmdbTvDetails>(`/tv/${item.id}`, accessToken, userAgent);
                if (hasNhkNetwork(details) && score > bestNhkScore) {
                    bestNhkScore = score;
                    bestNhk = item;
                }
            } catch {
                /* skip */
            }
        }
        if (bestNhk) {
            chosen = bestNhk;
            logger.debug(`[METADATA] TMDB: chose NHK network match among close title scores`);
        }
    }

    const yearStr = yearFromFirstAirDate(chosen.first_air_date);
    logger.info(`[METADATA] TMDB: matched series "${chosen.name}" (id ${chosen.id})`);
    return {
        tmdbSeriesId: chosen.id,
        name: chosen.name,
        year: yearStr,
    };
}

/**
 * Load all episodes for a TMDB series (all seasons from series details).
 */
export async function fetchAllEpisodes(
    seriesId: number,
    accessToken: string,
    userAgent: string,
    delayMs: number,
    sleepFn: (ms: number) => Promise<void>,
    logger: Logger
): Promise<EpisodeMetadata[]> {
    let details: TmdbTvDetails;
    try {
        details = await tmdbGet<TmdbTvDetails>(`/tv/${seriesId}`, accessToken, userAgent);
    } catch (e) {
        logger.warning(`[METADATA] TMDB: failed to load series ${seriesId}: ${e}`);
        throw e;
    }

    const yearFromDetails = yearFromFirstAirDate(details.first_air_date);
    if (yearFromDetails) {
        logger.debug(`[METADATA] TMDB: series first air year ${yearFromDetails}`);
    }

    const seasonNumbers = new Set<number>();
    if (details.seasons && details.seasons.length > 0) {
        for (const s of details.seasons) {
            seasonNumbers.add(s.season_number);
        }
    } else {
        const n = details.number_of_seasons ?? 0;
        for (let s = 0; s <= n; s++) {
            seasonNumbers.add(s);
        }
    }

    const sortedSeasons = [...seasonNumbers].sort((a, b) => a - b);
    const episodes: EpisodeMetadata[] = [];
    let firstRequest = true;

    for (const seasonNum of sortedSeasons) {
        if (!firstRequest) {
            await sleepFn(delayMs);
        }
        firstRequest = false;

        let seasonData: TmdbSeasonResponse;
        try {
            seasonData = await tmdbGet<TmdbSeasonResponse>(
                `/tv/${seriesId}/season/${seasonNum}`,
                accessToken,
                userAgent
            );
        } catch {
            logger.debug(`[METADATA] TMDB: no data for season ${seasonNum} (skipping)`);
            continue;
        }

        const eps = seasonData.episodes || [];
        for (const ep of eps) {
            let firstAired = '';
            if (ep.air_date) {
                const d = new Date(ep.air_date);
                firstAired = isNaN(d.getTime()) ? ep.air_date : d.toISOString().split('T')[0]!;
            }
            episodes.push({
                id: String(ep.id),
                season: ep.season_number,
                episodeNumber: ep.episode_number,
                name: ep.name || '',
                overview: (ep.overview || '').trim().replace(/\s+/g, ' '),
                firstAired,
            });
        }
    }

    return episodes;
}
