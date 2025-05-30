export interface NfoData {
    title: string;
    date: string;
    description: string;
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