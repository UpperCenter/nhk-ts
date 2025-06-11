/**
 * Hardcoded TVDB mappings for shows that don't search well due to generic/short titles
 * Maps NFO title (case-insensitive) to TVDB series information
 */
export interface HardcodedSeriesMapping {
    tvdb_id: string;
    slug: string;
    name: string;
    year: string;
}

/**
 * Hardcoded mappings for problematic titles
 * Key should be the exact title from NFO (case will be ignored during lookup)
 */
export const HARDCODED_SERIES_MAPPINGS: Record<string, HardcodedSeriesMapping> = {
    "Yokai": {
        tvdb_id: "424910",
        slug: "424910-series",
        name: "Time and Tide",
        year: "2020"
    },
    "Lunch On": {
        tvdb_id: "270769",
        slug: "lunch-on",
        name: "Lunch On",
        year: "2013"
    },
};

/**
 * Check if a title has a hardcoded mapping
 */
export function getHardcodedMapping(title: string): HardcodedSeriesMapping | null {
    const normalizedTitle = title.trim().toLowerCase();

    for (const [mappedTitle, mapping] of Object.entries(HARDCODED_SERIES_MAPPINGS)) {
        if (mappedTitle.toLowerCase() === normalizedTitle) {
            return mapping;
        }
    }

    return null;
} 