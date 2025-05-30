import { Logger } from '../logger.js';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

export async function detectSilencePeriods(
    filePath: string,
    logger: Logger,
    keepDebug: boolean
): Promise<{ start: number, end: number }[]> {
    const SILENCE_THRESHOLD = '-80dB';
    const MIN_SILENCE_DURATION = 1.0;
    const debugLines: string[] = [];
    return new Promise((resolve, reject) => {
        const args = [
            '-hide_banner',
            '-vn',
            '-i', filePath,
            '-map', '0:a:1',
            '-af', `silencedetect=noise=${SILENCE_THRESHOLD}:d=${MIN_SILENCE_DURATION}`,
            '-f', 'null',
            '-'
        ];
        let stderr = '';
        logger.info(`[SILENCE] Using silencedetect params: noise=${SILENCE_THRESHOLD}, duration=${MIN_SILENCE_DURATION}`);
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logger.error(`[SILENCE] FFmpeg silencedetect failed`);
                return reject(new Error('ffmpeg silencedetect failed'));
            }
            // Parse only silence_end lines
            const silencePeriods: { start: number, end: number }[] = [];
            const silenceEndPattern = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/;
            for (const line of stderr.split('\n')) {
                const m = line.match(silenceEndPattern);
                if (m && typeof m[1] === 'string' && typeof m[2] === 'string') {
                    const end = Math.round(parseFloat(m[1]) * 1000); // ms
                    const duration = Math.round(parseFloat(m[2]) * 1000); // ms
                    const start = end - duration;
                    silencePeriods.push({ start, end });
                    debugLines.push(`silence: ${start}ms - ${end}ms (duration: ${duration}ms)`);
                }
            }
            if (keepDebug) {
                fs.writeFile('debug_silence.txt' as string, debugLines.join('\n'), 'utf8').catch(() => { });
            }
            logger.info(`[SILENCE] Detected ${silencePeriods.length} silence periods.`);
            if (silencePeriods.length > 0) {
                logger.info(`[SILENCE] First: ${silencePeriods[0]?.start}ms - ${silencePeriods[0]?.end}ms, Last: ${silencePeriods[silencePeriods.length - 1]?.start}ms - ${silencePeriods[silencePeriods.length - 1]?.end}ms`);
            }
            resolve(silencePeriods);
        });
        proc.on('error', reject);
    });
} 