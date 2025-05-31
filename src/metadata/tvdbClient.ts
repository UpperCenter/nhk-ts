import type { MetadataInfo } from './types.js';
import { compareTwoStrings } from 'string-similarity';
import { getHardcodedMapping } from './hardcodedMappings.js';

/**
 * Authenticate with TVDB API and return a bearer token
 */
export async function login(apiKey: string, userAgent: string): Promise<string> {
    const res = await fetch('https://api4.thetvdb.com/v4/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
        },
        body: JSON.stringify({ apikey: apiKey }),
    });
    const json = await res.json();
    if (!json.data?.token) throw new Error('TVDB login failed');
    return json.data.token;
}

/**
 * Search for a series by title; returns tvdb_id, slug, name, year
 */
/**
 * Searches TVDB for a series matching the given title and returns the best match
 * 
 * First checks hardcoded mappings for problematic titles, then falls back to API search.
 * 
 * Prioritization logic for API search:
 * 1. Prefer exact title matches from NHK World network
 * 2. Prefer higher title similarity from NHK networks  
 * 3. Fallback to any NHK-affiliated network series
 * 4. Use first result if no NHK matches found
 * 
 * @param title - Series title to search for (e.g., "NHK Documentary")
 * @param token - TVDB API authentication token from login()
 * @param userAgent - User-Agent string to use for requests
 * @returns Object containing series ID, slug, name, and year, or null if no matches
 */
export async function searchSeries(
    title: string,
    token: string,
    userAgent: string
): Promise<{ tvdb_id: string; slug: string; name: string; year: string } | null> {
    // First check for hardcoded mappings
    const hardcodedMapping = getHardcodedMapping(title);
    if (hardcodedMapping) {
        return {
            tvdb_id: hardcodedMapping.tvdb_id,
            slug: hardcodedMapping.slug,
            name: hardcodedMapping.name,
            year: hardcodedMapping.year
        };
    }

    // Fall back to API search
    // Construct search URL with encoded title and series type filter
    const url = `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(
        title
    )}&type=series`;

    // Make API request with authentication and user agent headers
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': userAgent,
        },
    });

    // Parse response and handle empty data
    const json = await res.json();
    const results = json.data as any[] || []; // Type assertion since TVDB schema is complex
    if (results.length === 0) return null;

    // Enhanced result selection logic with title similarity
    const nhkResults = results.filter(item => {
        const network = (item.network || '').toLowerCase();
        return network === 'nhk world' || network.startsWith('nhk');
    });

    let series: any;
    if (nhkResults.length > 0) {
        // Among NHK results, find the best title match
        let bestScore = 0;
        let bestMatch = nhkResults[0];

        for (const item of nhkResults) {
            const similarity = compareTwoStrings(title.toLowerCase(), (item.name || '').toLowerCase());
            if (similarity > bestScore) {
                bestScore = similarity;
                bestMatch = item;
            }
        }
        series = bestMatch;
    } else {
        // No NHK results, use first available
        series = results[0];
    }

    // Extract and return key series identifiers
    return {
        tvdb_id: series.tvdb_id,  // TVDB's unique identifier
        slug: series.slug,        // URL-friendly identifier
        name: series.name,        // Original series name
        year: series.year,        // Year of first release
    };
}