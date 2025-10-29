export interface NfoData {
    title: string;
    date: string;
    description: string;
    recordingEndUTC?: Date;
}

export interface EpisodeMetadata {
    id: string;
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

export interface NhkEpgEntry {
    seriesId: string;
    airingId: string;
    title: string;
    episodeTitle: string;
    description: string;
    startTime: string; // ISO 8601 format with JST timezone
    endTime: string; // ISO 8601 format with JST timezone
}

export interface NhkEpgData {
    data: NhkEpgEntry[];
} 