import { promises as fs } from 'fs';

interface EpisodeCacheEntry {
    timestamp: number;
    episodes: any;
}
interface CacheFile {
    [slug: string]: EpisodeCacheEntry;
}

/** Load cache JSON from disk or return empty object */
export async function loadCache(path: string): Promise<CacheFile> {
    try {
        const raw = await fs.readFile(path, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/** Save cache JSON to disk, creating directories as needed */
export async function saveCache(path: string, cache: CacheFile): Promise<void> {
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
        await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(path, JSON.stringify(cache, null, 2));
} 