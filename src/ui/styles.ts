import chalk from 'chalk';

export const colors = {
    // Primary colors
    primary: chalk.hex('#00D4AA'),      // Teal
    secondary: chalk.hex('#7C3AED'),    // Purple
    accent: chalk.hex('#F59E0B'),       // Amber

    // Status colors
    success: chalk.hex('#10B981'),      // Green
    warning: chalk.hex('#F59E0B'),      // Amber
    error: chalk.hex('#EF4444'),        // Red
    info: chalk.hex('#3B82F6'),         // Blue

    // Neutral colors
    muted: chalk.hex('#6B7280'),        // Gray
    subtle: chalk.hex('#9CA3AF'),       // Light gray
    dim: chalk.hex('#D1D5DB'),          // Very light gray

    // Text colors
    text: chalk.hex('#111827'),         // Dark gray
    textMuted: chalk.hex('#4B5563'),    // Medium gray
    textSubtle: chalk.hex('#6B7280'),   // Light gray

    // Background colors
    bg: chalk.hex('#F9FAFB'),           // Very light gray
    bgMuted: chalk.hex('#F3F4F6'),      // Light gray
    border: chalk.hex('#E5E7EB'),       // Border gray
} as const;

/**
 * Text styling utilities
 */
export const styles = {
    bold: chalk.bold,
    dim: chalk.dim,
    italic: chalk.italic,
    underline: chalk.underline,
    strikethrough: chalk.strikethrough,

    // Custom styles
    header: (text: string) => colors.primary.bold(text),
    subheader: (text: string) => colors.secondary.bold(text),
    code: (text: string) => chalk.bgHex('#F3F4F6').hex('#374151')(text),
    highlight: (text: string) => chalk.bgHex('#FEF3C7').hex('#92400E')(text),
    badge: (text: string) => chalk.bgHex('#E0E7FF').hex('#3730A3')(` ${text} `),

    // Status styles
    success: (text: string) => colors.success.bold(text),
    warning: (text: string) => colors.warning.bold(text),
    error: (text: string) => colors.error.bold(text),
    info: (text: string) => colors.info.bold(text),

    // Layout styles
    separator: (char: string = '─', length: number = 60) =>
        colors.border(char.repeat(length)),
    divider: (char: string = '═', length: number = 60) =>
        colors.primary(char.repeat(length)),
} as const;

/**
 * Box drawing characters for clean borders
 */
export const borders = {
    // Single line
    single: {
        topLeft: '┌',
        topRight: '┐',
        bottomLeft: '└',
        bottomRight: '┘',
        horizontal: '─',
        vertical: '│',
        cross: '┼',
        tLeft: '├',
        tRight: '┤',
        tTop: '┬',
        tBottom: '┴',
    },
    // Double line
    double: {
        topLeft: '╔',
        topRight: '╗',
        bottomLeft: '╚',
        bottomRight: '╝',
        horizontal: '═',
        vertical: '║',
        cross: '╬',
        tLeft: '╠',
        tRight: '╣',
        tTop: '╦',
        tBottom: '╩',
    },
    // Rounded
    rounded: {
        topLeft: '╭',
        topRight: '╮',
        bottomLeft: '╰',
        bottomRight: '╯',
        horizontal: '─',
        vertical: '│',
        cross: '┼',
        tLeft: '├',
        tRight: '┤',
        tTop: '┬',
        tBottom: '┴',
    },
} as const;

/**
 * Create a box with content
 */
export function createBox(
    content: string,
    title?: string,
    style: 'single' | 'double' | 'rounded' = 'rounded'
) {
    const lines = content.split('\n');
    const maxWidth = Math.max(...lines.map(line => line.length), title?.length || 0);
    const width = maxWidth + 4; // padding

    const border = borders[style];
    const topBorder = title
        ? `${border.topLeft}${border.horizontal} ${title} ${border.horizontal.repeat(width - title.length - 4)}${border.topRight}`
        : `${border.topLeft}${border.horizontal.repeat(width - 2)}${border.topRight}`;

    const bottomBorder = `${border.bottomLeft}${border.horizontal.repeat(width - 2)}${border.bottomRight}`;

    const contentLines = lines.map(line =>
        `${border.vertical} ${line.padEnd(maxWidth)} ${border.vertical}`
    );

    return [topBorder, ...contentLines, bottomBorder].join('\n');
}

/**
 * Create a progress bar
 */
export function createProgressBar(
    current: number,
    total: number,
    width: number = 40,
    filled: string = '█',
    empty: string = '░'
): string {
    const percentage = Math.min(100, Math.max(0, (current / total) * 100));
    const filledWidth = Math.floor((percentage / 100) * width);
    const emptyWidth = width - filledWidth;

    const bar = filled.repeat(filledWidth) + empty.repeat(emptyWidth);
    return `[${bar}] ${percentage.toFixed(1)}%`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format duration in seconds to human readable format
 */
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}


