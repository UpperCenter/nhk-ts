import { load } from 'cheerio';
import type { Element } from 'cheerio';
import type { EpisodeMetadata } from './types.js';

/**
 * Scrape the TheTVDB allseasons page for episode metadata
 */
export async function retrieveEpisodeList(
    slug: string,
    userAgent: string
): Promise<EpisodeMetadata[]> {
    const url = `https://thetvdb.com/series/${slug}/allseasons/official`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
    const html = await res.text();
    const $ = load(html);
    const episodes: EpisodeMetadata[] = [];
    $('h3.mt-4').each((_: number, header: Element) => {
        const seasonRaw = $(header).find('a').text() ?? '';
        const seasonText = seasonRaw.trim();
        const seasonMatch = seasonText.match(/Season\s+(\d+)/i);
        const season = seasonMatch ? parseInt(seasonMatch[1]!, 10) : NaN;
        const list = $(header).next('ul.list-group');
        list.find('li.list-group-item').each((_: number, li: Element) => {
            const labelText = $(li).find('span.episode-label').text() ?? '';
            const label = labelText.trim();
            const epMatch = label.match(/E(\d+)/);
            const episodeNumber = epMatch ? parseInt(epMatch[1]!, 10) : NaN;
            // Extract episode ID from link
            const href = $(li).find('h4.list-group-item-heading a').attr('href') ?? '';
            const idMatch = href.match(/\/episodes\/(\d+)/);
            const id = idMatch ? idMatch[1] : '';
            const nameText = $(li).find('h4.list-group-item-heading a').text() ?? '';
            const name = nameText.trim();
            const dateText = $(li).find('ul.list-inline.text-muted li').first().text() ?? '';
            const rawDate = dateText.trim();
            const firstAired = new Date(rawDate).toISOString().split('T')[0];
            const overviewText = $(li).find('.list-group-item-text p').text() ?? '';
            const overview = overviewText.trim().replace(/\s+/g, ' ');
            episodes.push({ id, season, episodeNumber, name, overview, firstAired } as EpisodeMetadata);
        });
    });
    return episodes;
} 