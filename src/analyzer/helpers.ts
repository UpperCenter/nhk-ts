export function getAudioLevelAt(ts: number, audioLevels: { ts: number, meanDb: number }[]): number | null {
    let last = null;
    for (const chunk of audioLevels) {
        if (chunk.ts > ts) break;
        last = chunk;
    }
    return last ? last.meanDb : null;
}

export function isFrameSilent(
    tsMs: number,
    silencePeriods: { start: number, end: number }[],
    debugMatch?: (interval: { start: number, end: number } | null) => void
): boolean {
    for (const period of silencePeriods) {
        if (tsMs >= period.start - 200 && tsMs < period.end + 200) {
            if (debugMatch) debugMatch(period);
            return true;
        }
    }
    if (debugMatch) debugMatch(null);
    return false;
} 