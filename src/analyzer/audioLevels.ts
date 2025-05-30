import { Logger } from '../logger.js';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

export async function detectAudioLevels(
    filePath: string,
    logger: Logger,
    keepDebug: boolean
): Promise<{ ts: number, meanDb: number }[]> {
    const debugLines: string[] = [];
    return new Promise((resolve, reject) => {
        const args = [
            '-hide_banner',
            '-vn',
            '-i', filePath,
            '-af', `astats=metadata=1:reset=1`,
            '-f', 'null',
            '-'
        ];
        let stderr = '';
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logger.error(`[AUDIO] FFmpeg astats failed`);
                return reject(new Error('ffmpeg astats failed'));
            }
            // Parse output for pts_time and RMS_level pairs
            const audioLevels: { ts: number, meanDb: number }[] = [];
            let curTs: number | null = null;
            for (const line of stderr.split('\n')) {
                const tsMatch = line.match(/pts_time:([0-9.]+)/);
                if (tsMatch && typeof tsMatch[1] === 'string') {
                    curTs = parseFloat(tsMatch[1]);
                }
                const dbMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=([\-0-9.]+)/);
                if (dbMatch && typeof dbMatch[1] === 'string' && curTs !== null) {
                    const meanDb = parseFloat(dbMatch[1]);
                    audioLevels.push({ ts: curTs, meanDb });
                    debugLines.push(`audio: ts=${curTs.toFixed(3)}: RMS_level=${meanDb.toFixed(2)}dB`);
                    curTs = null;
                }
            }
            if (keepDebug) {
                fs.writeFile('debug_audio_levels.txt' as string, debugLines.join('\n'), 'utf8').catch(() => { });
            }
            logger.info(`[AUDIO] Detected ${audioLevels.length} audio level frames.`);
            resolve(audioLevels);
        });
        proc.on('error', reject);
    });
} 