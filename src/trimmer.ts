import * as path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { Logger } from './logger.js';
import { ProgramOptions } from './types.js';
import { detectBlackBoundariesWithMagick } from './analyzer/blackBoundaries.js';
import { formatTime, askQuestion, sanitizeFilename, getBestEncodingSettings } from './utils.js';
import { parseNfo } from './metadata/parseNfo.js';
import { login, searchSeries } from './metadata/tvdbClient.js';
import { loadEpisodes } from './metadata/episodeService.js';
import { lookupEpisodeByDescription } from './metadata/lookup.js';
import { getHardcodedMapping } from './metadata/hardcodedMappings.js';
import type { NfoData, EpisodeMetadata, MetadataInfo } from './metadata/types.js';

export class TVHeadEndTrimmer {
    private options: ProgramOptions;
    private logger: Logger;

    /**
     * @param options ProgramOptions, now includes 'parallelism' for frame analysis concurrency
     */
    constructor(options: ProgramOptions) {
        this.options = options;
        this.logger = new Logger({
            verbosity: options.verbosity,
            quiet: options.quiet
        });
    }

    private async executeTrimCommand(
        inputFile: string,
        startTime: number,
        endTime: number,
        outputFile: string,
    ): Promise<boolean> {
        const duration = endTime - startTime;
        const durationMin = Math.round((duration / 60) * 10) / 10;

        this.logger.info('\nTrim Command:');
        this.logger.info(
            chalk.white(
                `ffmpeg -i "${inputFile}" -ss ${startTime} -to ${endTime} -c copy "${outputFile}"`,
            ),
        );
        this.logger.info(chalk.gray(`Output duration: ${durationMin} minutes`));

        if (this.options.test) {
            this.logger.info(chalk.yellow('TEST MODE: Command not executed'));
            return true;
        }

        if (this.options.yes) {
            this.logger.info(chalk.yellow('Automatically confirming trim operation'));
        } else {
            const response = await askQuestion('\nExecute this trim command? (y/N): ');
            if (response.toLowerCase() !== 'y') {
                this.logger.info(chalk.yellow('Trim operation cancelled'));
                return false;
            }
        }

        this.logger.info(chalk.yellow('Executing trim operation...'));

        try {
            const args = [
                '-i',
                inputFile,
                '-ss',
                startTime.toString(),
                '-to',
                endTime.toString(),
                '-c',
                'copy',
                outputFile,
                '-y',
            ];

            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
                proc.on('close', (code: number) => code === 0 ? resolve(null) : reject(new Error('ffmpeg failed')));
                proc.on('error', reject);
            });

            const stats = await fs.stat(outputFile);
            const outputSize = Math.round((stats.size / (1024 * 1024)) * 10) / 10;
            this.logger.success(`Successfully created: ${outputFile} (${outputSize} MiB)`);
            return true;
        } catch (error) {
            this.logger.error(`Error during trimming: ${error}`);
            return false;
        }
    }

    /**
     * Execute transcoding of a trimmed file to the selected container with metadata and presets.
     */
    private async executeTranscodeCommand(
        inputFile: string,
        metaInfo?: MetadataInfo,
    ): Promise<boolean> {
        const { audioCopy, format } = this.options;
        // Get optimal encoding settings based on hardware and options
        const encodingSettings = await getBestEncodingSettings(this.options);

        // Total duration of input for progress calculation
        const totalDuration = await this.getTotalDuration(inputFile);
        const ext = format;
        let filename: string;
        let season = '', episode = '';
        if (metaInfo) {
            season = String(metaInfo.season).padStart(2, '0');
            episode = String(metaInfo.episodeNumber).padStart(2, '0');
            filename = `${metaInfo.seriesName} - S${season}E${episode} - ${metaInfo.episodeName}.${ext}`;
        } else {
            const base = path.basename(inputFile, path.extname(inputFile));
            filename = `${base}.${ext}`;
        }
        const safeName = sanitizeFilename(filename);
        const outputPath = path.join(this.options.output, safeName);

        // Build ffmpeg arguments with error resilience and accurate seeking
        const args: string[] = ['-err_detect', 'ignore_err', '-ss', '0', '-i', inputFile,
            '-avoid_negative_ts', 'make_zero',
            '-c:v', encodingSettings.encoder];

        // Add preset for software encoders, or hardware-specific settings
        if (encodingSettings.encoder.includes('nvenc')) {
            args.push('-preset', encodingSettings.preset);
            args.push(...encodingSettings.extraArgs);
        } else if (encodingSettings.encoder.includes('qsv')) {
            args.push(...encodingSettings.extraArgs);
        } else if (encodingSettings.encoder.includes('vaapi')) {
            args.push(...encodingSettings.extraArgs);
        } else {
            // Software encoder (libx264/libx265)
            args.push('-preset', encodingSettings.preset, '-crf', encodingSettings.crf.toString());
            args.push(...encodingSettings.extraArgs);
        }

        args.push('-vf', 'yadif=mode=0:parity=0,format=yuv420p');
        if (audioCopy) {
            args.push('-c:a', 'copy');
        } else {
            args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000');
        }
        // Map video and preferred audio stream
        if (audioCopy) {
            // Prefer AC-3 audio (stream index 1) over MP2 (stream index 0)
            args.push('-map', '0:v:0', '-map', '0:a:1', '-movflags', '+faststart');
        } else {
            args.push('-map', '0:v:0', '-map', '0:a:0', '-movflags', '+faststart');
        }
        args.push('-nostats', '-progress', 'pipe:1');
        // Metadata tags if available
        if (metaInfo) {
            args.push('-metadata', `title=${metaInfo.seriesName} - S${season}E${episode} - ${metaInfo.episodeName}`);
            args.push('-metadata:s:v:0', 'title=Video');
            args.push('-metadata:s:a:0', 'title=English');
            args.push('-metadata:s:a:0', 'language=eng');
        }
        args.push(outputPath, '-y');

        // Log command
        this.logger.info('\nTranscode Command:');
        this.logger.info(chalk.white(`ffmpeg ${args.join(' ')}`));

        if (this.options.test) {
            this.logger.info(chalk.yellow('TEST MODE: Transcode command not executed'));
            return true;
        }
        this.logger.info(chalk.yellow('Executing transcode operation...'));

        try {
            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
                let buffer = '';
                let lastPercent = -1;
                proc.stdout.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop()!;
                    for (const line of lines) {
                        const [key, val] = line.split('=');
                        if (key === 'out_time_ms') {
                            const outMs = parseInt(val!);
                            const seconds = outMs / 1e6;
                            const percent = Math.floor((seconds / totalDuration) * 100);
                            if (percent !== lastPercent) {
                                lastPercent = percent;
                                this.logger.progress(`Transcode: ${percent}%`);
                            }
                        }
                    }
                });
                proc.on('close', (code) => code === 0 ? resolve(null) : reject(new Error('ffmpeg failed')));
                proc.on('error', reject);
            });
            const stats = await fs.stat(outputPath);
            const size = Math.round((stats.size / (1024 * 1024)) * 10) / 10;
            this.logger.success(`Successfully transcoded: ${outputPath} (${size} MiB)`);
            return true;
        } catch (error) {
            this.logger.error(`Error during transcoding: ${error}`);
            return false;
        }
    }

    /**
     * Execute trim + transcode in one pass, outputting final container directly.
     */
    private async executeTrimTranscodeCommand(
        inputFile: string,
        startTime: number,
        endTime: number,
        metaInfo?: MetadataInfo,
        showYear?: string,
    ): Promise<boolean> {
        const { audioCopy, format } = this.options;
        // Get optimal encoding settings based on hardware and options
        const encodingSettings = await getBestEncodingSettings(this.options);

        // Clip duration for progress
        const clipDuration = endTime - startTime;
        const ext = format;
        const dir = path.dirname(inputFile);
        // Build filename from metadata or base name
        const rawBase = path.parse(inputFile).name;
        let filename: string;
        let season = '', episode = '';
        if (metaInfo) {
            // Use TVDB series year for filename
            const year = showYear || '';
            season = String(metaInfo.season).padStart(2, '0');
            episode = String(metaInfo.episodeNumber).padStart(2, '0');
            filename = `${metaInfo.seriesName} (${year}) - S${season}E${episode} - ${metaInfo.episodeName}.${ext}`;
        } else {
            // Remove trailing underscore to match processRecording logic
            const baseName = rawBase.endsWith('_') ? rawBase.slice(0, -1) : rawBase;
            filename = `${baseName}.${ext}`;
        }
        const safeName = sanitizeFilename(filename);
        const outputPath = path.join(this.options.output, safeName);

        // Build ffmpeg args with error resilience and accurate seeking
        const duration = endTime - startTime;
        const args: string[] = ['-err_detect', 'ignore_err', '-ss', startTime.toString(), '-i', inputFile, '-t', duration.toString(),
            '-avoid_negative_ts', 'make_zero',
            '-c:v', encodingSettings.encoder];

        // Add preset for software encoders, or hardware-specific settings
        if (encodingSettings.encoder.includes('nvenc')) {
            args.push('-preset', encodingSettings.preset);
            args.push(...encodingSettings.extraArgs);
        } else if (encodingSettings.encoder.includes('qsv')) {
            args.push(...encodingSettings.extraArgs);
        } else if (encodingSettings.encoder.includes('vaapi')) {
            args.push(...encodingSettings.extraArgs);
        } else {
            // Software encoder (libx264/libx265)
            args.push('-preset', encodingSettings.preset, '-crf', encodingSettings.crf.toString());
            args.push(...encodingSettings.extraArgs);
        }

        args.push('-vf', 'yadif=mode=0:parity=0,format=yuv420p');
        if (audioCopy) {
            args.push('-c:a', 'copy');
        } else {
            args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000');
        }
        // Map video and preferred audio stream
        if (audioCopy) {
            // Prefer AC-3 audio (stream index 1) over MP2 (stream index 0)
            args.push('-map', '0:v:0', '-map', '0:a:1', '-movflags', '+faststart');
        } else {
            args.push('-map', '0:v:0', '-map', '0:a:0', '-movflags', '+faststart');
        }
        args.push('-nostats', '-progress', 'pipe:1', outputPath, '-y');

        this.logger.info('\nTrim+Transcode Command:');
        this.logger.info(chalk.white(`ffmpeg ${args.join(' ')}`));
        if (this.options.test) {
            this.logger.info(chalk.yellow('TEST MODE: Command not executed'));
            return true;
        }

        this.logger.info(chalk.yellow('Executing trim+transcode operation...'));
        try {
            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
                let buffer = '';
                let lastPercent = -1;
                proc.stdout.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop()!;
                    for (const line of lines) {
                        const [key, val] = line.split('=');
                        if (key === 'out_time_ms') {
                            const seconds = parseInt(val!) / 1e6;
                            const pct = Math.floor((seconds / clipDuration) * 100);
                            if (pct !== lastPercent) {
                                lastPercent = pct;
                                process.stdout.write(`\r⏳ ${pct}%`);
                            }
                        }
                    }
                });
                proc.on('close', (code) => code === 0 ? resolve(null) : reject(new Error('ffmpeg failed')));
                proc.on('error', reject);
            });
            console.log(''); // newline after progress
            const stats = await fs.stat(outputPath);
            const size = Math.round((stats.size / (1024 * 1024)) * 10) / 10;
            this.logger.success(`Successfully created: ${outputPath} (${size} MiB)`);
            // Delete original if requested
            if (this.options.deleteOriginal && !this.options.test) {
                await fs.unlink(inputFile);
                this.logger.info(`Deleted original file: ${inputFile}`);
            }
            return true;
        } catch (err) {
            this.logger.error(`Error during trim+transcode: ${err}`);
            return false;
        }
    }

    private async getTotalDuration(filePath: string): Promise<number> {
        const args = ['-i', filePath, '-f', 'null', '-'];
        const output = await new Promise<string>((resolve, reject) => {
            let stderr = '';
            const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
            proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
            proc.on('close', (code: number) => code === 0 ? resolve(stderr) : reject(new Error('ffmpeg failed')));
            proc.on('error', reject);
        });
        const match = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (!match) throw new Error('Could not determine video duration');
        const hours = parseInt(match[1] ?? '0');
        const minutes = parseInt(match[2] ?? '0');
        const seconds = parseFloat(match[3] ?? '0');
        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * Recursively collect .ts files under a directory, excluding already trimmed output
     */
    private async collectTsFiles(dir: string): Promise<{ name: string; fullPath: string; size: number }[]> {
        const dirEntries = await fs.readdir(dir, { withFileTypes: true });
        const files: { name: string; fullPath: string; size: number }[] = [];
        for (const entry of dirEntries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await this.collectTsFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.ts')) {
                const stats = await fs.stat(fullPath);
                files.push({ name: entry.name, fullPath, size: stats.size });
            }
        }
        return files;
    }

    private async processRecording(file: {
        name: string;
        fullPath: string;
        size: number;
    }): Promise<boolean> {
        this.logger.section(`Processing: ${file.name}`, () => {
            this.logger.info(`File size: ${this.logger.formatFileSize(file.size)}`);
        });

        const magickResult = await detectBlackBoundariesWithMagick(file.fullPath, this.options, this.logger);
        const totalDuration = await this.getTotalDuration(file.fullPath);

        // Metadata lookup
        let nfoData: NfoData | undefined;
        let seriesInfo: { tvdb_id: string; slug: string; name: string; year: string } | null = null;
        let episodes: EpisodeMetadata[] = [];
        let metaInfo: MetadataInfo | undefined;
        if (this.options.metadata) {
            nfoData = await parseNfo(file.fullPath, this.logger);
            this.logger.info(`[METADATA] Parsed NFO: title="${nfoData.title}", date=${nfoData.date}`);
            // Check blacklist patterns (supports '*' wildcards)
            let skipMetadata = false;
            try {
                const rawList = await fs.readFile(path.resolve(process.cwd(), 'blacklist.json'), 'utf-8');
                const blacklist = JSON.parse(rawList) as string[];
                this.logger.debug(`[METADATA] Blacklist patterns loaded: ${blacklist.join(', ')}`);
                const title = nfoData.title.trim();
                for (const pattern of blacklist) {
                    const patTrim = pattern.trim();
                    // Build regex: escape all regex meta, then turn '*' into '.*'
                    const escaped = patTrim.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
                    const reStr = escaped.replace(/\*/g, '.*');
                    const regex = new RegExp(`^${reStr}$`, 'i');
                    if (regex.test(title)) {
                        this.logger.warning(`[METADATA] Title "${title}" matches blacklist pattern "${pattern}"; skipping metadata lookup`);
                        skipMetadata = true;
                        break;
                    }
                }
            } catch {
                this.logger.debug('[METADATA] No valid blacklist.json found; proceeding with metadata lookup');
            }
            // Only proceed if not blacklisted and API key provided
            if (skipMetadata) {
                this.logger.info('[METADATA] Metadata lookup skipped due to blacklist');
            } else if (!this.options.tvdbApiKey) {
                this.logger.warning('[METADATA] TVDB API key missing; skipping metadata lookup');
            } else {
                this.logger.info('[METADATA] Searching TVDB for series information');

                // Check for hardcoded mapping first
                const hardcodedMapping = getHardcodedMapping(nfoData.title);
                if (hardcodedMapping) {
                    this.logger.info(`[METADATA] Using hardcoded mapping for "${nfoData.title}"`);
                    seriesInfo = {
                        tvdb_id: hardcodedMapping.tvdb_id,
                        slug: hardcodedMapping.slug,
                        name: hardcodedMapping.name,
                        year: hardcodedMapping.year
                    };
                } else {
                    const token = await login(this.options.tvdbApiKey, this.options.metadataUserAgent!);
                    this.logger.debug('[METADATA] TVDB login successful');
                    seriesInfo = await searchSeries(nfoData.title, token, this.options.metadataUserAgent!);
                }

                if (!seriesInfo) {
                    this.logger.warning(`[METADATA] No TVDB series match for "${nfoData.title}"`);
                } else {
                    this.logger.info(`[METADATA] Found series: ${seriesInfo.name} (ID: ${seriesInfo.tvdb_id})`);
                    // Load episodes (will log cache vs fetch)
                    episodes = await loadEpisodes(seriesInfo.slug, this.options, this.logger);
                    // Match episode by description
                    this.logger.info('[METADATA] Attempting to match episode by description');
                    const epMatch = lookupEpisodeByDescription(episodes, nfoData.description);
                    if (!epMatch) {
                        this.logger.warning('[METADATA] No episode match by description; using fallback naming');
                    } else {
                        this.logger.success(`[METADATA] Matched episode S${epMatch.season}E${epMatch.episodeNumber}: ${epMatch.name}`);
                        metaInfo = {
                            seriesName: seriesInfo.name,
                            season: epMatch.season,
                            episodeNumber: epMatch.episodeNumber,
                            episodeName: epMatch.name,
                            firstAired: epMatch.firstAired,
                            tvdbId: epMatch.id,
                        };
                    }
                }
            }
        }

        if (magickResult.programStart === null || magickResult.programEnd === null) {
            this.logger.error('\nSkipping: No usable Magick-based detection results');
            magickResult.notes.forEach((note) => this.logger.info(chalk.gray(`  Note: ${note}`)));
            return false;
        }

        this.logger.section('Analysis Results', () => {
            magickResult.notes.forEach((note) => {
                this.logger.info(note);
            });
        });

        // Determine output filename
        const rawBase = path.parse(file.name).name;
        const baseName = rawBase.endsWith('_') ? rawBase.slice(0, -1) : rawBase;
        let outputFileName: string;
        if (this.options.transcode) {
            // When transcoding, use the appropriate extension
            if (this.options.metadata && metaInfo) {
                const showYear = seriesInfo?.year || '';
                const seasonStr = String(metaInfo.season).padStart(2, '0');
                const episodeStr = String(metaInfo.episodeNumber).padStart(2, '0');
                outputFileName = `${metaInfo.seriesName} (${showYear}) - S${seasonStr}E${episodeStr} - ${metaInfo.episodeName}.${this.options.format}`;
            } else {
                outputFileName = `${baseName}.${this.options.format}`;
            }
        } else {
            // When only trimming (no transcode), use .ts extension
            if (this.options.metadata && metaInfo) {
                const showYear = seriesInfo?.year || '';
                const seasonStr = String(metaInfo.season).padStart(2, '0');
                const episodeStr = String(metaInfo.episodeNumber).padStart(2, '0');
                outputFileName = `${metaInfo.seriesName} (${showYear}) - S${seasonStr}E${episodeStr} - ${metaInfo.episodeName}.ts`;
            } else {
                outputFileName = `${baseName}.ts`;
            }
        }
        // Sanitize the filename to remove illegal characters
        const safeName = sanitizeFilename(outputFileName);
        const outputFile = path.join(this.options.output, safeName);

        const beforeDuration = totalDuration;
        const beforeSize = Math.round((file.size / (1024 * 1024)) * 10) / 10;

        this.logger.section('Recommended Trim Points', () => {
            this.logger.keyValue([
                { key: 'Start', value: `${magickResult.programStart || 0}s` },
                { key: 'End', value: `${magickResult.programEnd || 0}s` },
                { key: 'Duration', value: this.logger.formatDuration((magickResult.programEnd || 0) - (magickResult.programStart || 0)) }
            ]);

            this.logger.table([
                [formatTime(0), formatTime(beforeDuration), beforeSize + ' MiB'],
                [formatTime(magickResult.programStart || 0), formatTime(magickResult.programEnd || 0), 'N/A']
            ], ['Start', 'End', 'File Size'], 'File Comparison');
        });

        let success: boolean;
        if (this.options.transcode) {
            success = await this.executeTrimTranscodeCommand(
                file.fullPath,
                magickResult.programStart,
                magickResult.programEnd,
                metaInfo,
                seriesInfo?.year,
            );
        } else {
            success = await this.executeTrimCommand(
                file.fullPath,
                magickResult.programStart,
                magickResult.programEnd,
                outputFile,
            );
        }

        if (success && !this.options.test) {
            this.logger.success('Processing completed successfully!');
            // Determine final file: use the outputFile directly since it now has the correct extension
            const finalFile = outputFile;
            const afterSize = await fs.stat(finalFile).then(stats => Math.round((stats.size / (1024 * 1024)) * 10) / 10);
            this.logger.table([
                [formatTime(0), formatTime(beforeDuration), beforeSize + ' MiB'],
                [formatTime(magickResult.programStart), formatTime(magickResult.programEnd), afterSize + ' MiB']
            ], ['Start', 'End', 'File Size']);
        }

        // Optionally delete original files
        if (success && !this.options.test && this.options.deleteOriginal) {
            try {
                // Delete .ts file
                await fs.unlink(file.fullPath);
                this.logger.info(`Deleted original file: ${file.fullPath}`);
                // Delete .nfo file
                const dir = path.dirname(file.fullPath);
                const base = path.basename(file.fullPath, '.ts');
                const corrected = base.endsWith('_') ? base.slice(0, -1) : base;
                const nfoPath = path.join(dir, `${corrected}.nfo`);
                await fs.unlink(nfoPath);
                this.logger.info(`Deleted NFO file: ${nfoPath}`);
            } catch (err) {
                this.logger.warning(`Failed to delete original files: ${err}`);
            }
        }
        return success;
    }

    public async run(): Promise<void> {
        if (this.options.test) {
            this.logger.warning('RUNNING IN TEST MODE - No files will be modified');
        }

        // Ensure output directory exists
        await this.ensureOutputDirectory();

        let files: { name: string; fullPath: string; size: number }[] = [];
        let summaryRows: string[][] = [];
        let failedFiles: string[] = [];

        if (this.options.file) {
            try {
                const stats = await fs.stat(this.options.file);
                files = [
                    {
                        name: path.basename(this.options.file),
                        fullPath: path.resolve(this.options.file),
                        size: stats.size,
                    },
                ];
                this.logger.section('File Processing', () => {
                    this.logger.info(`Processing single file: ${this.options.file}`);
                });
            } catch (error) {
                this.logger.error(`File not found: ${this.options.file}`);
                process.exit(1);
            }
        } else {
            try {
                // Recursively discover .ts files
                const tsFiles = await this.collectTsFiles(this.options.input);
                files.push(...tsFiles);
                this.logger.section('File Discovery', () => {
                    this.logger.info(`Processing directory (recursive): ${this.options.input}`);
                    this.logger.success(`Found ${files.length} .ts files`);
                });
            } catch (error) {
                this.logger.error(`Error reading directory recursively: ${error}`);
                process.exit(1);
            }
        }

        if (files.length === 0) {
            this.logger.error('No .ts files found to process');
            process.exit(1);
        }

        for (const file of files) {
            try {
                const success = await this.processRecording(file);
                summaryRows.push([
                    file.name,
                    success ? '✅' : '❌',
                ]);
                if (!success) failedFiles.push(file.name);
            } catch (err) {
                this.logger.error(`Failed to process ${file.name}: ${err}`);
                summaryRows.push([
                    file.name,
                    '❌',
                ]);
                failedFiles.push(file.name);
            }
        }

        this.logger.section('Processing Complete', () => {
            this.logger.success(`Processed ${files.length} file(s)`);
            this.logger.table(summaryRows, ['File', 'Status'], 'Summary');

            if (failedFiles.length > 0) {
                this.logger.warning(`Some files failed to process (${failedFiles.length}):`);
                failedFiles.forEach(f => this.logger.error(`  - ${f}`));
            }

            if (this.options.test) {
                this.logger.warning('Run without --test to perform actual trimming');
            }
        });
    }

    /**
     * Ensure output directory exists, create if needed
     */
    private async ensureOutputDirectory(): Promise<void> {
        try {
            await fs.access(this.options.output);
        } catch {
            // Directory doesn't exist, create it
            await fs.mkdir(this.options.output, { recursive: true });
            this.logger.info(`Created output directory: ${this.options.output}`);
        }
    }
}