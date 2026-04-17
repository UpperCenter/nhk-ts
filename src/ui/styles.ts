import chalk from 'chalk';

/** Material-inspired dark terminal palette (aligned with MEDIA_PROC / NHK TS TUI mockup). */
export const colors = {
    primary: chalk.hex('#ccbdff'),
    secondary: chalk.hex('#41ef79'),
    tertiary: chalk.hex('#ffb950'),

    success: chalk.hex('#41ef79'),
    warning: chalk.hex('#ffb950'),
    error: chalk.hex('#ffb4ab'),
    info: chalk.hex('#41ef79'),

    muted: chalk.hex('#948ea1'),
    subtle: chalk.hex('#cac3d8'),
    dim: chalk.hex('#494455'),

    onSurface: chalk.hex('#e3e0f2'),
    onSurfaceVariant: chalk.hex('#cac3d8'),
    outline: chalk.hex('#948ea1'),
    outlineVariant: chalk.hex('#494455'),

    text: chalk.hex('#e3e0f2'),
    textMuted: chalk.hex('#948ea1'),
    textSubtle: chalk.hex('#cac3d8'),

    bg: chalk.hex('#12121e'),
    bgMuted: chalk.hex('#1f1e2b'),
    border: chalk.hex('#494455'),
} as const;

function termWidth(): number {
    return Math.max(40, Math.min(process.stdout.columns || 80, 120));
}

export function frameSectionTop(label: string): string {
    const w = termWidth();
    const prefix = `┌─ ${label} `;
    const dashes = Math.max(1, w - prefix.length - 1);
    return (
        colors.outlineVariant('┌─ ') +
        colors.primary.bold(label) +
        colors.outlineVariant(` ${'─'.repeat(dashes)}┐`)
    );
}

export function frameSectionBottom(): string {
    const w = termWidth();
    return colors.outlineVariant(`└${'─'.repeat(Math.max(2, w - 2))}┘`);
}

export function logTimestamp(): string {
    return new Date().toTimeString().slice(0, 8);
}

/**
 * Text styling utilities
 */
export const styles = {
    bold: chalk.bold,
    dim: chalk.dim,
    italic: chalk.italic,
    underline: chalk.underline,
    strikethrough: chalk.strikethrough,

    header: (text: string) => colors.primary.bold(text),
    subheader: (text: string) => colors.secondary.bold(text),
    code: (text: string) => chalk.bgHex('#1a1a27').hex('#e3e0f2')(text),
    highlight: (text: string) => chalk.bgHex('#292936').hex('#ffb950')(text),
    badge: (text: string) => chalk.bgHex('#7d52ff').hex('#12121e')(` ${text} `),

    success: (text: string) => colors.success.bold(text),
    warning: (text: string) => colors.warning.bold(text),
    error: (text: string) => colors.error.bold(text),
    info: (text: string) => colors.info.bold(text),

    separator: (char: string = '─', length: number = 60) =>
        colors.outlineVariant(char.repeat(length)),
    divider: (char: string = '═', length: number = 60) =>
        colors.outline(char.repeat(length)),
} as const;

/**
 * Box drawing characters for clean borders
 */
export const borders = {
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

const ol = (s: string) => colors.outlineVariant(s);

/**
 * Create a box with content
 */
export function createBox(
    content: string,
    title?: string,
    style: 'single' | 'double' | 'rounded' = 'rounded',
) {
    const lines = content.split('\n');
    const maxWidth = Math.max(...lines.map(line => line.length), title?.length || 0);
    const width = maxWidth + 4;

    const border = borders[style];
    const topBorder = title
        ? `${ol(border.topLeft + border.horizontal)} ${colors.primary(title)} ${ol(
              border.horizontal.repeat(Math.max(0, width - title.length - 4)) + border.topRight,
          )}`
        : `${ol(border.topLeft + border.horizontal.repeat(width - 2) + border.topRight)}`;

    const bottomBorder = ol(border.bottomLeft + border.horizontal.repeat(width - 2) + border.bottomRight);

    const contentLines = lines.map(line =>
        ol(border.vertical) + ` ${line.padEnd(maxWidth)} ` + ol(border.vertical),
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
    empty: string = '░',
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
