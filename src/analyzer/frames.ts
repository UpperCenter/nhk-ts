import { Logger } from '../logger.js';
import { ProgramOptions } from '../types.js';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import pLimit from 'p-limit';

export async function extractFramesToBuffers(
    filePath: string,
    referenceImage: string,
    ss: number,
    windowSeconds: number,
    maskArgs: string,
    frameRate: number,
    logger: Logger
): Promise<Buffer[]> {
    const args = [
        '-ss', ss.toString(),
        '-i', filePath,
        '-i', referenceImage,
        '-t', windowSeconds.toString(),
        '-filter_complex', maskArgs,
        '-map', '[diff]',
        '-f', 'image2pipe',
        '-vcodec', 'png',
        '-q:v', '2',
        'pipe:1',
    ];
    logger.debug(`[FFMPEG] Extracting frames to memory: ffmpeg ${args.map(a => `'${a}'`).join(' ')}`);
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks: Buffer[] = [];
        if (proc.stdout) {
            proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        }
        proc.on('close', (code) => {
            if (code === 0) {
                const all = Buffer.concat(chunks);
                const frames = splitPngFrames(all);
                logger.info(`[FFMPEG] Extracted ${frames.length} frames to memory.`);
                resolve(frames);
            } else {
                reject(new Error('ffmpeg failed'));
            }
        });
        proc.on('error', reject);
    });
}

export function splitPngFrames(buffer: Buffer): Buffer[] {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const indices: number[] = [];
    let idx = 0;
    while ((idx = buffer.indexOf(PNG_SIGNATURE, idx)) !== -1) {
        indices.push(idx);
        idx += PNG_SIGNATURE.length;
    }
    const frames: Buffer[] = [];
    for (let i = 0; i < indices.length; ++i) {
        const start = indices[i];
        const end = i + 1 < indices.length ? indices[i + 1] : buffer.length;
        frames.push(buffer.slice(start, end));
    }
    return frames;
}

export async function getFrameMeansFromBuffers(
    frameBuffers: Buffer[],
    label: string,
    options: ProgramOptions,
    logger: Logger
): Promise<number[]> {
    const means: number[] = [];
    const debugLines: string[] = [];
    const keepDebug = options.keepDebug;
    const parallelism = options.parallelism || 8;
    const limit = pLimit(parallelism);

    logger.info(`[${label}] Calculating similarity for ${frameBuffers.length} frames (parallelism: ${parallelism})...`);

    const tasks = frameBuffers.map((buf, idx) => limit(async () => {
        try {
            const { stdout } = await new Promise<{ stdout?: string }>((resolve, reject) => {
                let out = '';
                const proc = spawn('magick', ['-', '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:'], { stdio: ['pipe', 'pipe', 'ignore'] });
                proc.stdout.on('data', d => out += d.toString());
                proc.on('close', code => code === 0 ? resolve({ stdout: out }) : reject(new Error('magick failed')));
                proc.on('error', reject);
                proc.stdin.write(buf);
                proc.stdin.end();
            });
            const mean = parseFloat((stdout ?? '').trim());
            means[idx] = isNaN(mean) ? 1 : mean;
            debugLines[idx] = `frame_${String(idx).padStart(5, '0')}: mean=${mean.toFixed(4)}, similarity=${((1 - mean) * 100).toFixed(2)}%`;
        } catch (err) {
            logger.error(`[${label}] Magick error for frame ${idx}: ${err}`);
            means[idx] = 1;
            debugLines[idx] = `frame_${String(idx).padStart(5, '0')}: ERROR`;
        }
    }));

    await Promise.all(tasks);

    if (keepDebug) {
        const debugFile = `debug_means_${label}.txt`;
        await fs.writeFile(debugFile as string, debugLines.join('\n'), 'utf8');
        logger.debug(`[${label}] Debug means written to ${debugFile}`);
    }

    // Optionally log first/last 5
    if (means.length > 0) {
        const first5 = means.slice(0, 5).map((m, i) => `frame_${i} (mean=${m.toFixed(4)}, sim=${((1 - m) * 100).toFixed(2)}%)`).join(', ');
        const last5 = means.slice(-5).map((m, i) => `frame_${means.length - 5 + i} (mean=${m.toFixed(4)}, sim=${((1 - m) * 100).toFixed(2)}%)`).join(', ');
        logger.debug(`[${label}] First 5: [${first5}]`);
        logger.debug(`[${label}] Last 5: [${last5}]`);
    }

    return means;
} 