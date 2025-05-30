import { Logger } from '../logger.js';
import { ProgramOptions } from '../types.js';
import { detectSilencePeriods } from './silence.js';
import { detectAudioLevels } from './audioLevels.js';
import { extractFramesToBuffers, getFrameMeansFromBuffers } from './frames.js';
import { getAudioLevelAt, isFrameSilent } from './helpers.js';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import pLimit from 'p-limit';

export async function detectBlackBoundariesWithMagick(
    filePath: string,
    options: ProgramOptions,
    logger: Logger
): Promise<{ programStart: number | null, programEnd: number | null, notes: string[] }> {
    const MASK_X = 13, MASK_Y = 60, MASK_W = 400, MASK_H = 54;
    const SIMILARITY_THRESHOLD = 0.92;
    const N_CONSECUTIVE = 2;
    const FRAME_RATE = 5;
    const notes: string[] = [];
    const referenceImage = options.reference || 'data/black_logo.png';
    const keepDebug = options.keepDebug;
    const startWindow = typeof options.startWindow === 'number' ? options.startWindow : 90;
    const endWindow = typeof options.endWindow === 'number' ? options.endWindow : 210;

    const maskArgs =
        `[0:v]drawbox=x=${MASK_X}:y=${MASK_Y}:w=${MASK_W}:h=${MASK_H}:color=black@1:t=fill,extractplanes=y[vid]; ` +
        `[1:v]drawbox=x=${MASK_X}:y=${MASK_Y}:w=${MASK_W}:h=${MASK_H}:color=black@1:t=fill,format=gray,extractplanes=y[ref]; ` +
        `[vid][ref]blend=all_mode=difference,fps=${FRAME_RATE}[diff]`;

    const getTotalDuration = async (filePath: string): Promise<number> => {
        const args = ['-i', filePath, '-f', 'null', '-'];
        const output = await new Promise<string>((resolve, reject) => {
            let stderr = '';
            const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });
            proc.on('close', (code) => code === 0 ? resolve(stderr) : reject(new Error('ffmpeg failed')));
            proc.on('error', reject);
        });
        const match = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (!match) throw new Error('Could not determine video duration');
        const hours = parseInt(match[1] ?? '0');
        const minutes = parseInt(match[2] ?? '0');
        const seconds = parseFloat(match[3] ?? '0');
        return hours * 3600 + minutes * 60 + seconds;
    };

    const duration = await getTotalDuration(filePath);
    let silencePeriods: { start: number, end: number }[] = [];
    try {
        silencePeriods = await detectSilencePeriods(filePath, logger, keepDebug);
    } catch (err) {
        // Cleanup and hard fail if no audio
        logger.error(`[SILENCE] Fatal: ${err}`);
        if (keepDebug) {
            try { await fs.unlink('debug_silence.txt'); } catch { }
        }
        throw err;
    }

    let audioLevels: { ts: number, meanDb: number }[] = [];
    try {
        audioLevels = await detectAudioLevels(filePath, logger, keepDebug);
    } catch (err) {
        logger.error(`[AUDIO] Fatal: ${err}`);
        if (keepDebug) {
            try { await fs.unlink('debug_audio_levels.txt'); } catch { }
        }
        throw err;
    }
    let startMeans: number[] = [];
    let endMeans: number[] = [];

    if (keepDebug) {
        // Use old temp file method for debug mode
        const tmpBase = path.join(os.tmpdir(), `nhk_magick_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        const startDir = `${tmpBase}_start`;
        const endDir = `${tmpBase}_end`;
        await fs.mkdir(startDir, { recursive: true });
        await fs.mkdir(endDir, { recursive: true });
        logger.debug(`[DEBUG] Temp directories:\n  START: ${startDir}\n  END:   ${endDir}`);
        // Extract frames to disk in parallel
        const extractDiffFrames = async (ss: number, dir: string, label: string, windowSeconds: number) => {
            const args = [
                '-ss', ss.toString(),
                '-i', filePath,
                '-i', referenceImage,
                '-t', windowSeconds.toString(),
                '-filter_complex', maskArgs,
                '-map', '[diff]',
                '-q:v', '2',
                path.join(dir, 'frame_%05d.png'),
            ];
            try {
                logger.debug(`[${label}] FFmpeg command: ffmpeg ${args.map(a => `'${a}'`).join(' ')}`);
                await new Promise((resolve, reject) => {
                    const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
                    proc.on('close', (code) => code === 0 ? resolve(null) : reject(new Error('ffmpeg failed')));
                    proc.on('error', reject);
                });
                logger.success(`[${label}] Frame extraction complete.`);
            } catch (err) {
                logger.error(`[${label}] FFmpeg extraction error: ${err}`);
            }
        };
        // Parallel extraction
        await Promise.all([
            extractDiffFrames(0, startDir, 'START', startWindow),
            extractDiffFrames(Math.max(0, duration - endWindow), endDir, 'END', endWindow)
        ]);
        // Parallel mean calculation
        const getFrameMeans = async (dir: string, label: string) => {
            let files: string[] = [];
            try {
                const dirFiles = await fs.readdir(dir);
                files = Array.isArray(dirFiles) ? dirFiles.filter(f => typeof f === 'string' && f.endsWith('.png')).sort() : [];
            } catch {
                files = [];
            }
            logger.info(`[${label}] Found ${files.length} frames for similarity analysis.`);
            const means: number[] = [];
            const debugLines: string[] = [];
            logger.progress(`[${label}] Calculating similarity for ${files.length} frames...`);
            for (const file of files) {
                const imgPath = path.join(dir, file);
                try {
                    const { stdout } = await new Promise<{ stdout?: string }>((resolve, reject) => {
                        let out = '';
                        const proc = spawn('magick', [imgPath, '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:'], { stdio: ['ignore', 'pipe', 'ignore'] });
                        proc.stdout.on('data', d => out += d.toString());
                        proc.on('close', code => code === 0 ? resolve({ stdout: out }) : reject(new Error('magick failed')));
                        proc.on('error', reject);
                    });
                    const mean = parseFloat((stdout ?? '').trim());
                    means.push(isNaN(mean) ? 1 : mean);
                    debugLines.push(`${file}: mean=${mean.toFixed(4)}, similarity=${((1 - mean) * 100).toFixed(2)}%`);
                } catch (err) {
                    logger.error(`[${label}] Magick error for ${file}: ${err}`);
                    means.push(1);
                    debugLines.push(`${file}: ERROR`);
                }
            }
            if (means.length > 0) {
                const first5 = files.slice(0, 5).map((f, i) => {
                    const m = means[i];
                    return m !== undefined ? `${f} (mean=${m.toFixed(4)}, sim=${((1 - m) * 100).toFixed(2)}%)` : `${f} (mean=N/A, sim=N/A)`;
                }).join(', ');
                const last5 = files.slice(-5).map((f, i) => {
                    const idx = means.length - 5 + i;
                    const m = means[idx];
                    return m !== undefined ? `${f} (mean=${m.toFixed(4)}, sim=${((1 - m) * 100).toFixed(2)}%)` : `${f} (mean=N/A, sim=N/A)`;
                }).join(', ');
                logger.debug(`[${label}] First 5: [${first5}]`);
                logger.debug(`[${label}] Last 5: [${last5}]`);
            }
            await fs.writeFile(path.join(dir, 'debug_means.txt') as string, debugLines.join('\n'), 'utf8');
            return means;
        };
        const [startMeansResult, endMeansResult] = await Promise.all([
            getFrameMeans(startDir, 'START'),
            getFrameMeans(endDir, 'END')
        ]);
        startMeans = startMeansResult;
        endMeans = endMeansResult;
        // After startMeans and endMeans are calculated, add per-frame debug logging if keepDebug is set
        if (keepDebug) {
            // Helper to write per-frame status
            async function writeFrameStatus(
                means: number[],
                label: string,
                dir: string,
                silencePeriods: { start: number, end: number }[],
                audioLevels: { ts: number, meanDb: number }[],
                windowStartMs: number = 0
            ) {
                const lines: string[] = [];
                for (let i = 0; i < means.length; ++i) {
                    const relTsMs = Math.round((i / FRAME_RATE) * 1000); // frame timestamp in ms (relative to window)
                    const tsMs = relTsMs + windowStartMs; // absolute timestamp in ms
                    const mean = means[i];
                    const audioDbVal = getAudioLevelAt(i / FRAME_RATE, audioLevels);
                    const audioDb: string = (audioDbVal === null || audioDbVal === undefined) ? 'N/A' : audioDbVal.toString();
                    let matchedInterval: { start: number, end: number } | null = null;
                    const silent = isFrameSilent(tsMs, silencePeriods, (interval: { start: number, end: number } | null) => { matchedInterval = interval; });
                    const intervalStr = (matchedInterval && typeof (matchedInterval as { start: number, end: number }).start === 'number' && typeof (matchedInterval as { start: number, end: number }).end === 'number')
                        ? `[${(matchedInterval as { start: number, end: number }).start}ms-${(matchedInterval as { start: number, end: number }).end}ms]`
                        : 'NONE';
                    if (typeof mean !== 'number' || isNaN(mean)) {
                        lines.push(`frame_${String(i + 1).padStart(5, '0')}.png: ts=${(tsMs / 1000).toFixed(2)}s, mean=N/A, sim=N/A, black=NO, silent=${silent ? 'YES' : 'NO'}, valid=NO, audio_level=${audioDb}dB, silence_interval=${intervalStr}`);
                        continue;
                    }
                    const sim = 1 - mean;
                    const isBlack = sim >= SIMILARITY_THRESHOLD;
                    const isValid = isBlack && silent;
                    lines.push(`frame_${String(i + 1).padStart(5, '0')}.png: ts=${(tsMs / 1000).toFixed(2)}s, mean=${mean.toFixed(4)}, sim=${(sim * 100).toFixed(2)}%, black=${isBlack ? 'YES' : 'NO'}, silent=${silent ? 'YES' : 'NO'}, valid=${isValid ? 'YES' : 'NO'}, audio_level=${audioDb}dB, silence_interval=${intervalStr}`);
                }
                const filePath: string = (dir ? path.join(dir, `debug_frame_status_${label}.txt`) : `debug_frame_status_${label}.txt`);
                await fs.writeFile(filePath as string, lines.join('\n'), 'utf8');
            }
            // Write for start and end, using correct window offset
            await writeFrameStatus(startMeans, 'START', startDir, silencePeriods, audioLevels, 0);
            const endWindowStartMs = Math.round((duration - endWindow) * 1000);
            await writeFrameStatus(endMeans, 'END', endDir, silencePeriods, audioLevels, endWindowStartMs);
        }
    } else {
        // In-memory, parallelized pipeline
        logger.info('Analyzing start and end boundaries for black frames (in-memory, parallel)...');
        const startPromise = (async () => {
            const startFrames = await extractFramesToBuffers(
                filePath,
                referenceImage,
                0,
                startWindow,
                maskArgs,
                FRAME_RATE,
                logger
            );
            return getFrameMeansFromBuffers(startFrames, 'START', options, logger);
        })();
        const endPromise = (async () => {
            const endFrames = await extractFramesToBuffers(
                filePath,
                referenceImage,
                Math.max(0, duration - endWindow),
                endWindow,
                maskArgs,
                FRAME_RATE,
                logger
            );
            return getFrameMeansFromBuffers(endFrames, 'END', options, logger);
        })();
        const [startMeansResult, endMeansResult] = await Promise.all([startPromise, endPromise]);
        startMeans = startMeansResult;
        endMeans = endMeansResult;
    }

    function findConsecutive(
        means: number[],
        threshold: number,
        n: number,
        mode: 'last' | 'first',
        label: string,
        logger: Logger,
        validMask: boolean[],
        debugLines: string[]
    ): number | null {
        let count = 0;
        if (mode === 'last') {
            for (let i = means.length - 1; i >= 0; --i) {
                const similarity = 1 - (means[i] ?? 1);
                if (means[i] !== undefined && similarity >= threshold && validMask[i]) {
                    count++;
                    if (count === n) {
                        const values = means.slice(i, i + n).map((v, j) => `${v.toFixed(4)} (${((1 - v) * 100).toFixed(2)}%) [${validMask[i + j] ? 'B+S' : (similarity >= threshold ? 'B' : 'S')}]`).join(', ');
                        logger.success(`[${label}] Found ${n} consecutive frames above threshold and silent at indices ${i} to ${i + n - 1}. Means/Sim: ${values}`);
                        return i + n - 1;
                    }
                } else {
                    count = 0;
                }
            }
        } else {
            for (let i = 0; i < means.length; ++i) {
                const similarity = 1 - (means[i] ?? 1);
                if (means[i] !== undefined && similarity >= threshold && validMask[i]) {
                    count++;
                    if (count === n) {
                        const values = means.slice(i - n + 1, i + 1).map((v, j) => `${v.toFixed(4)} (${((1 - v) * 100).toFixed(2)}%) [${validMask[i - n + 1 + j] ? 'B+S' : (similarity >= threshold ? 'B' : 'S')}]`).join(', ');
                        logger.success(`[${label}] Found ${n} consecutive frames above threshold and silent at indices ${i - n + 1} to ${i}. Means/Sim: ${values}`);
                        return i - n + 1;
                    }
                } else {
                    count = 0;
                }
            }
        }
        logger.warn(`[${label}] No run of ${n} consecutive frames above threshold (${threshold}) and silent found.`);
        return null;
    }

    const frameToSec = (idx: number | null) => idx !== null ? idx / FRAME_RATE : 0;
    const startIdx = findConsecutive(
        startMeans,
        SIMILARITY_THRESHOLD,
        N_CONSECUTIVE,
        'last',
        'START',
        logger,
        startMeans.map((_, i) => isFrameSilent(Math.round((i / FRAME_RATE) * 1000), silencePeriods)),
        []
    );
    const endWindowStartMs = Math.round((duration - endWindow) * 1000);
    const endIdx = findConsecutive(
        endMeans,
        SIMILARITY_THRESHOLD,
        N_CONSECUTIVE,
        'first',
        'END',
        logger,
        endMeans.map((_, i) => isFrameSilent(Math.round((i / FRAME_RATE) * 1000) + endWindowStartMs, silencePeriods)),
        []
    );
    const programStart = startIdx !== null ? frameToSec(startIdx - N_CONSECUTIVE + 1) : null;
    const programEnd = endIdx !== null ? duration - endWindow + frameToSec(endIdx) : null;

    if (programStart === null) notes.push('No valid black period found at start');
    if (programEnd === null) notes.push('No valid black period found at end');

    return { programStart, programEnd, notes };
} 