export interface BlackPeriod {
    start: number;
    end: number;
    duration: number;
}

export interface ProgramOptions {
    input: string;
    file?: string;
    output: string;
    minBlack: number;
    pixThreshold: number;
    test: boolean;
    reference: string;
    keepDebug: boolean;
    startWindow: number;
    endWindow: number;
    verbosity: 'quiet' | 'normal' | 'verbose';
    quiet: boolean;
    yes: boolean;
    parallelism?: number;
    metadata: boolean;
    tvdbApiKey?: string;
    metadataCache?: string;
    historyDb?: string;
    metadataRateLimit?: number;
    metadataUserAgent?: string;
    deleteOriginal: boolean;
    transcode: boolean;
    preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow' | 'placebo';
    crf: number;
    audioCopy: boolean;
    format: 'mkv' | 'mp4';
    hwAccel?: 'none' | 'nvenc' | 'qsv' | 'vaapi' | 'auto';
    best?: boolean;
    encoder?: 'libx264' | 'libx265' | 'h264_nvenc' | 'hevc_nvenc' | 'h264_qsv' | 'hevc_qsv' | 'h264_vaapi' | 'hevc_vaapi';
}

export interface NfoData {
    title: string;
    date: string;
    description: string;
}

export interface EpisodeMetadata {
    season: number;
    episodeNumber: number;
    name: string;
    overview: string;
    firstAired: string;
}

export interface MetadataInfo {
    seriesName: string;
    season: number;
    episodeNumber: number;
    episodeName: string;
    firstAired: string;
    tvdbId: string;
} 