import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../logger.js';
import type { NfoData } from './types.js';

/**
 * Parse the .nfo file corresponding to a .ts recording
 */
export async function parseNfo(filePath: string, logger: Logger): Promise<NfoData> {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, '.ts');
    const corrected = base.endsWith('_') ? base.slice(0, -1) : base;
    const nfoPath = path.join(dir, `${corrected}.nfo`);
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
    return { title, date, description };
} 