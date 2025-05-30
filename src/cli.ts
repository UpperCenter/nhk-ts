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
    .option('--metadata-user-agent <ua>', 'User-Agent for metadata requests', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0')
    .option('--transcode', 'Enable transcoding of trimmed files to selected container', false)
    .option('--preset <preset>', 'Transcode preset (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo)', 'medium')
    .option('--crf <number>', 'CRF value for quality (lower = better quality, 18-23 recommended)', '18')
    .option('--audio-copy', 'Force copy of all audio streams instead of encoding', false)
    .option('--format <format>', 'Output container format: mkv or mp4', 'mkv')
    .option('--delete-original', 'Delete original .ts and .nfo files after successful processing', false);

program.parse();

if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
}

(async () => {
    const options = program.opts() as ProgramOptions;
    const logger = new Logger(options.verbosity, options.quiet);

    logger.section('NHK TVHeadEnd Recording Trimmer');
    logger.info(chalk.bold(`Version: ${program.version()}`));
    logger.info(chalk.gray('https://github.com/UpperCenter/nhk-ts'));
    logger.info('');
    logger.info('Important: This tool is in ALPHA and uses a lot of CPU/RAM. Use at your own risk.');
    logger.info('');
    logger.info(chalk.cyan('Configuration:'));
    logger.table([
        ['Input', options.input],
        ['File', options.file || '(all .ts in input)'],
        ['Output Directory', options.output],
        ['Min Black Duration', String(options.minBlack)],
        ['Pixel Threshold', String(options.pixThreshold)],
        ['Reference Image', options.reference],
        ['Keep Debug', String(options.keepDebug)],
        ['Start Window', String(options.startWindow)],
        ['End Window', String(options.endWindow)],
        ['Parallelism', String(options.parallelism)],
        ['Verbosity', options.verbosity],
        ['Quiet', String(options.quiet)],
        ['Test Mode', String(options.test)],
        ['Auto-Confirm', String(options.yes)],
        ['Metadata Lookup', String(options.metadata)],
        ['TVDB API Key', options.tvdbApiKey || '(none)'],
        ['Metadata Cache', options.metadataCache || '(none)'],
        ['Metadata Rate Limit', String(options.metadataRateLimit)],
        ['Metadata User-Agent', options.metadataUserAgent || '(none)'],
        ['Delete Originals', String(options.deleteOriginal)],
        ['Transcode', String(options.transcode)],
        ['Preset', options.preset],
        ['CRF', String(options.crf)],
        ['Audio Copy', String(options.audioCopy)],
        ['Format', options.format],
    ], ['Option', 'Value']);
    logger.info('');

    try {
        await checkDependencies();
    } catch (err) {
        logger.error('Dependency check failed.');
        process.exit(1);
    }

    // Validate preset
    if (options.transcode) {
        const validPresets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];
        if (!validPresets.includes(options.preset)) {
            console.error(chalk.red(`Invalid preset: ${options.preset}. Valid options: ${validPresets.join(', ')}`));
            process.exit(1);
        }
    }

    const trimmer = new TVHeadEndTrimmer(options);
    trimmer.run().catch((error) => {
        logger.error(`Fatal error: ${error}`);
        process.exit(1);
    });
})(); 