import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../logger.js';
import { stripNHKTimestampSuffix } from '../utils.js';
import type { NfoData } from './types.js';

/**
 * Parse the .nfo file corresponding to a .ts recording
 */
export async function parseNfo(filePath: string, logger: Logger): Promise<NfoData> {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, '.ts');
    // Prefer exact match with timestamped name
    const candidates: string[] = [
        path.join(dir, `${base}.nfo`),
        // Legacy: trailing underscore
        path.join(dir, `${base.endsWith('_') ? base.slice(0, -1) : base}.nfo`),
    ];
    const stripped = stripNHKTimestampSuffix(base);
    if (!candidates.some(p => p.endsWith(`${stripped}.nfo`))) {
        candidates.push(path.join(dir, `${stripped}.nfo`));
    }
    let nfoPath: string | null = null;
    for (const c of candidates) {
        try {
            await fs.access(c);
            nfoPath = c;
            break;
        } catch {}
    }
    if (!nfoPath) {
        throw new Error(`NFO not found for ${filePath}`);
    }
    logger.debug(`Parsing NFO: ${nfoPath}`);
    const content = await fs.readFile(nfoPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    let title = '';
    let date = '';
    let description = '';
    for (const line of lines) {
        if (line.startsWith('Title:')) title = line.replace('Title:', '').trim();
        if (line.startsWith('Date:')) date = line.replace('Date:', '').trim();
        if (line.startsWith('Description:')) description = line.replace('Description:', '').trim();
    }

    // Try to parse recording end time from the .ts filename
    let recordingEndUTC: Date | undefined;
    const match = base.match(/_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2}:\d{2})$/);
    if (match && match[1] && match[2]) {
        const dateTimeString = `${match[1]}T${match[2]}Z`; // Assume UTC
        const parsedDate = new Date(dateTimeString);
        if (!isNaN(parsedDate.getTime())) {
            recordingEndUTC = parsedDate;
        }
    }

    const nfoData: NfoData = { title, date, description };
    if (recordingEndUTC) {
        nfoData.recordingEndUTC = recordingEndUTC;
    }

    return nfoData;
} 