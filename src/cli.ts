#!/usr/bin/env node

import { program } from 'commander';
import { promises as fs } from 'fs';
import { checkDependencies } from './utils.js';
import { TVHeadEndTrimmer } from './trimmer.js';
import { ProgramOptions } from './types.js';
import { Logger } from './logger.js';
import chalk from 'chalk';

program
    .name('nhk-ts')
    .description('NHK TVHeadEnd Recording Tool.\n\n'
        + 'Performance: Use --parallelism <n> to control the number of frames analyzed in parallel (default: 12). Higher values use more CPU/RAM but are faster.')
    .version(JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf-8')).version)
    .option('-i, --input <path>', 'Input directory path', '.')
    .option('-f, --file <path>', 'Single file to process')
    .option('-o, --output <path>', 'Output directory path (files will be saved here)', './output')
    .option('--min-black <seconds>', 'Minimum black duration', parseFloat, 0.05)
    .option('--pix-threshold <threshold>', 'Pixel threshold for black detection', parseFloat, 0.1)
    .option('--test', 'Test mode - analyze only, no trimming', false)
    .option('--reference <path>', 'Reference black/logo image for difference', 'data/black_logo.png')
    .option('--keep-debug', 'Keep debug images and temp directories', false)
    .option('--start-window <seconds>', 'Start window duration in seconds', parseFloat, 90)
    .option('--end-window <seconds>', 'End window duration in seconds', parseFloat, 210)
    .option('--quiet', 'Suppress all output except errors', false)
    .option('--verbosity <level>', 'Verbosity level: quiet, normal, verbose', 'normal')
    .option('-y, --yes', 'Automatically confirm trim operation', false)
    .option('--parallelism <n>', 'Number of frames to process in parallel', parseInt, 12)
    .option('--metadata', 'Enable metadata lookup', false)
    .option('--tvdb-api-key <key>', 'TVDB API key', process.env.TVDB_API_KEY)
    .option('--metadata-cache <path>', 'Path to metadata cache JSON', `${process.cwd()}/cache.json`)
    .option('--metadata-rate-limit <n>', 'Max TVDB requests per second', parseFloat, 1)
    .option('--metadata-user-agent <ua>', 'User-Agent for metadata requests', 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0')
    .option('--transcode', 'Enable transcoding of trimmed files to selected container', false)
    .option('--preset <preset>', 'Transcode preset (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo)', 'medium')
    .option('--crf <number>', 'CRF value for quality (lower = better quality, 18-23 recommended)', '18')
    .option('--audio-copy', 'Force copy of all audio streams instead of encoding', false)
    .option('--format <format>', 'Output container format: mkv or mp4', 'mkv')
    .option('--hw-accel <type>', 'Hardware acceleration: none, nvenc, qsv, vaapi, auto', 'none')
    .option('--encoder <encoder>', 'Video encoder: libx264, libx265, h264_nvenc, hevc_nvenc, h264_qsv, hevc_qsv, h264_vaapi, hevc_vaapi')
    .option('--best', 'Use best quality settings optimized for modern systems (overrides preset/crf/encoder)', false)
    .option('--delete-original', 'Delete original .ts and .nfo files after successful processing', false);

program.parse();

if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
}

(async () => {
    const options = program.opts() as ProgramOptions;
    const logger = new Logger({
        verbosity: options.verbosity,
        quiet: options.quiet
    });

    // Enhanced header with charm.sh styling
    logger.section('NHK TVHeadEnd Recording Trimmer', () => {
        logger.info(`Version: ${program.version()}`);
        logger.info('https://github.com/UpperCenter/nhk-ts');
        logger.newline();
        logger.warning('This tool is in ALPHA and uses a lot of CPU/RAM. Use at your own risk.');
    });

    // Configuration display
    const config = {
        'Input': options.input,
        'File': options.file || '(all .ts in input)',
        'Output Directory': options.output,
        'Min Black Duration': `${options.minBlack}s`,
        'Pixel Threshold': options.pixThreshold.toString(),
        'Reference Image': options.reference,
        'Keep Debug': options.keepDebug.toString(),
        'Start Window': `${options.startWindow}s`,
        'End Window': `${options.endWindow}s`,
        'Parallelism': (options.parallelism || 12).toString(),
        'Verbosity': options.verbosity,
        'Quiet': options.quiet.toString(),
        'Test Mode': options.test.toString(),
        'Auto-Confirm': options.yes.toString(),
        'Metadata Lookup': options.metadata.toString(),
        'TVDB API Key': options.tvdbApiKey ? '••••••••' : '(none)',
        'Metadata Cache': options.metadataCache || '(none)',
        'Metadata Rate Limit': `${options.metadataRateLimit}/s`,
        'Delete Originals': options.deleteOriginal.toString(),
        'Transcode': options.transcode.toString(),
        'Preset': options.preset,
        'CRF': options.crf.toString(),
        'Audio Copy': options.audioCopy.toString(),
        'Format': options.format,
        'Hardware Acceleration': options.hwAccel || 'none',
        'Video Encoder': options.encoder || 'auto',
        'Best Quality Mode': (options.best || false).toString(),
    };

    logger.config(config);
    logger.newline();

    try {
        await checkDependencies();
    } catch (err) {
        logger.error('Dependency check failed.');
        process.exit(1);
    }

    // Validate preset and hardware acceleration options
    if (options.transcode) {
        const validPresets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];
        if (!validPresets.includes(options.preset)) {
            console.error(chalk.red(`Invalid preset: ${options.preset}. Valid options: ${validPresets.join(', ')}`));
            process.exit(1);
        }

        const validHwAccel = ['none', 'nvenc', 'qsv', 'vaapi', 'auto'];
        if (options.hwAccel && !validHwAccel.includes(options.hwAccel)) {
            console.error(chalk.red(`Invalid hardware acceleration: ${options.hwAccel}. Valid options: ${validHwAccel.join(', ')}`));
            process.exit(1);
        }

        const validEncoders = ['libx264', 'libx265', 'h264_nvenc', 'hevc_nvenc', 'h264_qsv', 'hevc_qsv', 'h264_vaapi', 'hevc_vaapi'];
        if (options.encoder && !validEncoders.includes(options.encoder)) {
            console.error(chalk.red(`Invalid encoder: ${options.encoder}. Valid options: ${validEncoders.join(', ')}`));
            process.exit(1);
        }

        // Apply --best flag settings
        if (options.best) {
            logger.info(chalk.cyan('Best quality mode enabled - optimizing settings for modern systems...'));
            // Override settings for best quality with hardware acceleration
            if (!options.encoder) {
                options.hwAccel = options.hwAccel || 'auto';
            }
        }
    }

    const trimmer = new TVHeadEndTrimmer(options);
    trimmer.run().catch((error) => {
        logger.error(`Fatal error: ${error}`);
        process.exit(1);
    });
})(); 