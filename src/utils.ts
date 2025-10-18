import * as readline from 'readline';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { ProgramOptions } from './types.js';

export function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export async function askQuestion(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

export async function checkDependencies() {
    const deps = [
        { name: 'ffmpeg', args: ['-version'] },
        { name: 'magick', args: ['-version'] },
    ];
    for (const dep of deps) {
        try {
            await new Promise((resolve, reject) => {
                const proc = spawn(dep.name, dep.args, { stdio: 'ignore' });
                proc.on('error', reject);
                proc.on('exit', (code) => (code === 0 ? resolve(null) : reject(new Error())));
            });
        } catch {
            console.error(chalk.red(`Dependency missing: ${dep.name}. Please install it and ensure it is in your PATH.`));
            process.exit(1);
        }
    }
}

/** Sleep for given milliseconds */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitize a string to be safe as a filename by replacing illegal characters
 */
export function sanitizeFilename(name: string): string {
    // Remove or replace characters not allowed in filenames
    return name.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Detect available hardware encoders on the system
 */
export async function detectHardwareEncoders(): Promise<string[]> {
    const availableEncoders: string[] = [];
    const encodersToTest = [
        'h264_nvenc',    // NVIDIA NVENC H.264
        'hevc_nvenc',    // NVIDIA NVENC HEVC
        'h264_qsv',      // Intel Quick Sync H.264
        'hevc_qsv',      // Intel Quick Sync HEVC
        'h264_vaapi',    // VA-API H.264
        'hevc_vaapi',    // VA-API HEVC
    ];

    for (const encoder of encodersToTest) {
        try {
            await new Promise<void>((resolve, reject) => {
                const proc = spawn('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=1', '-t', '1', '-c:v', encoder, '-f', 'null', '-'], {
                    stdio: 'ignore'
                });
                proc.on('error', reject);
                proc.on('exit', (code) => {
                    if (code === 0) {
                        availableEncoders.push(encoder);
                        resolve();
                    } else {
                        reject(new Error(`Encoder ${encoder} not available`));
                    }
                });
            });
        } catch {
            // Encoder not available, continue
        }
    }

    return availableEncoders;
}

/**
 * Determine the best encoder and settings based on hardware capabilities and options
 */
export async function getBestEncodingSettings(options: ProgramOptions): Promise<{
    encoder: string;
    preset: string;
    crf: number;
    extraArgs: string[];
}> {
    // If --best flag is used, optimize for quality and speed
    if (options.best) {
        const availableEncoders = await detectHardwareEncoders();

        // Prefer NVIDIA NVENC HEVC for best quality with hardware acceleration
        if (availableEncoders.includes('hevc_nvenc')) {
            return {
                encoder: 'hevc_nvenc',
                preset: 'p5',         // NVENC preset p5 (balanced quality/speed)
                crf: 18,              // Lower CRF for better quality
                extraArgs: [
                    '-profile:v', 'main',
                    '-tier', 'high',
                    '-rc', 'vbr',
                    '-cq', '18',
                    '-qmin', '10',
                    '-qmax', '30',
                    '-bf', '4',
                    '-b_ref_mode', 'middle',
                    '-temporal-aq', '1',
                    '-spatial-aq', '1',
                    '-aq-strength', '8',
                    '-surfaces', '64',
                    '-gpu', '0'
                ]
            };
        }

        // Fallback to NVIDIA H.264 NVENC
        if (availableEncoders.includes('h264_nvenc')) {
            return {
                encoder: 'h264_nvenc',
                preset: 'p5',
                crf: 18,
                extraArgs: [
                    '-profile:v', 'high',
                    '-rc', 'vbr',
                    '-cq', '18',
                    '-qmin', '10',
                    '-qmax', '30',
                    '-bf', '4',
                    '-b_ref_mode', 'middle',
                    '-temporal-aq', '1',
                    '-spatial-aq', '1',
                    '-aq-strength', '8',
                    '-surfaces', '64',
                    '-gpu', '0'
                ]
            };
        }

        // Fallback to Intel QSV HEVC
        if (availableEncoders.includes('hevc_qsv')) {
            return {
                encoder: 'hevc_qsv',
                preset: 'slow',
                crf: 18,
                extraArgs: [
                    '-profile:v', 'main',
                    '-preset', 'veryslow',
                    '-global_quality', '18'
                ]
            };
        }

        // Fallback to Intel QSV H.264
        if (availableEncoders.includes('h264_qsv')) {
            return {
                encoder: 'h264_qsv',
                preset: 'slow',
                crf: 18,
                extraArgs: [
                    '-profile:v', 'high',
                    '-preset', 'veryslow',
                    '-global_quality', '18'
                ]
            };
        }

        // Fallback to software x265 for best quality
        return {
            encoder: 'libx265',
            preset: 'slow',
            crf: 16,
            extraArgs: [
                '-profile:v', 'main',
                '-x265-params', 'crf=16:aq-mode=3:aq-strength=0.8:deblock=1,1'
            ]
        };
    }

    // Auto-detect hardware acceleration if requested
    if (options.hwAccel === 'auto') {
        const availableEncoders = await detectHardwareEncoders();

        if (availableEncoders.includes('h264_nvenc')) {
            return {
                encoder: 'h264_nvenc',
                preset: 'p5',  // Balanced preset for auto mode
                crf: options.crf,
                extraArgs: [
                    '-rc', 'vbr',
                    '-cq', options.crf.toString(),
                    '-surfaces', '32',
                    '-gpu', '0'
                ]
            };
        }

        if (availableEncoders.includes('h264_qsv')) {
            return {
                encoder: 'h264_qsv',
                preset: options.preset,
                crf: options.crf,
                extraArgs: ['-global_quality', options.crf.toString()]
            };
        }
    }

    // Use explicitly specified encoder
    if (options.encoder) {
        const extraArgs: string[] = [];

        if (options.encoder.includes('nvenc')) {
            extraArgs.push(
                '-rc', 'vbr',
                '-cq', options.crf.toString(),
                '-surfaces', '32',
                '-gpu', '0'
            );
        } else if (options.encoder.includes('qsv')) {
            extraArgs.push('-global_quality', options.crf.toString());
        } else if (options.encoder.includes('vaapi')) {
            extraArgs.push('-qp', options.crf.toString());
        }

        return {
            encoder: options.encoder,
            preset: options.preset,
            crf: options.crf,
            extraArgs
        };
    }

    // Default to software encoding
    return {
        encoder: 'libx264',
        preset: options.preset,
        crf: options.crf,
        extraArgs: []
    };
} 