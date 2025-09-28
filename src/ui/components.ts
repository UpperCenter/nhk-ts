import { colors, styles, borders, createBox, createProgressBar } from './styles.js';

/**
 * Header component with title and optional subtitle
 */
export function Header({ title, subtitle, version }: {
    title: string;
    subtitle?: string;
    version?: string;
}) {
    const divider = styles.divider('═', 60);
    const titleLine = styles.header(title);
    const subtitleLine = subtitle ? styles.subheader(subtitle) : '';
    const versionLine = version ? styles.badge(`v${version}`) : '';

    console.log(`\n${divider}`);
    console.log(titleLine);
    if (subtitle) console.log(subtitleLine);
    if (version) console.log(versionLine);
    console.log(`${divider}\n`);
}

/**
 * Section component for organizing content
 */
export function Section({ title, children }: {
    title: string;
    children: () => void;
}) {
    const divider = styles.divider('─', 60);
    console.log(`\n${styles.header(title)}`);
    console.log(divider);
    children();
    console.log(divider);
}

/**
 * Status message component
 */
export function Status({
    type,
    message,
    details
}: {
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    details?: string | undefined;
}) {
    const icons = {
        info: 'ℹ',
        success: '✓',
        warning: '⚠',
        error: '✗',
    };

    const colorFn = {
        info: colors.info,
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
    };

    const icon = icons[type];
    const color = colorFn[type];

    console.log(`${color(icon)} ${message}`);
    if (details) {
        console.log(`  ${colors.muted(details)}`);
    }
}

/**
 * Progress component with animated progress bar
 */
export class Progress {
    private current = 0;
    private total = 0;
    private label = '';
    private lastUpdate = 0;
    private interval: NodeJS.Timeout | null = null;

    constructor(total: number, label: string = '') {
        this.total = total;
        this.label = label;
    }

    update(current: number, label?: string) {
        this.current = current;
        if (label) this.label = label;

        // Throttle updates to avoid flickering
        const now = Date.now();
        if (now - this.lastUpdate < 100) return;
        this.lastUpdate = now;

        this.render();
    }

    private render() {
        const percentage = Math.min(100, Math.max(0, (this.current / this.total) * 100));
        const bar = createProgressBar(this.current, this.total, 40);
        const label = this.label ? ` ${this.label}` : '';

        // Clear line and move cursor to beginning
        process.stdout.write('\r\x1b[K');
        process.stdout.write(`${colors.primary(bar)}${label}`);
    }

    complete(message?: string) {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        // Clear line and show completion
        process.stdout.write('\r\x1b[K');
        if (message) {
            console.log(`${colors.success('✓')} ${message}`);
        } else {
            console.log(`${colors.success('✓')} Complete`);
        }
    }

    start() {
        this.update(0);
    }
}

/**
 * Spinner component for indeterminate progress
 */
export class Spinner {
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private currentFrame = 0;
    private interval: NodeJS.Timeout | null = null;
    private message = '';

    start(message: string = '') {
        this.message = message;
        this.interval = setInterval(() => {
            process.stdout.write('\r\x1b[K');
            process.stdout.write(`${this.frames[this.currentFrame]} ${this.message}`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 100);
    }

    stop(message?: string) {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        process.stdout.write('\r\x1b[K');
        if (message) {
            console.log(`${colors.success('✓')} ${message}`);
        }
    }

    update(message: string) {
        this.message = message;
    }
}

/**
 * Table component with clean formatting
 */
export function Table({
    headers,
    rows,
    title
}: {
    headers: string[];
    rows: string[][];
    title?: string;
}) {
    if (!rows || rows.length === 0) return;

    // Calculate column widths
    const colWidths = headers.map((header, i) => {
        const maxContentWidth = Math.max(...rows.map(row => (row[i] || '').length));
        return Math.max(header.length, maxContentWidth);
    });

    const totalWidth = colWidths.reduce((sum, width) => sum + width, 0) + (headers.length - 1) * 3 + 4;

    // Print title if provided
    if (title) {
        console.log(`\n${styles.subheader(title)}`);
    }

    // Print header
    const headerRow = headers.map((header, i) =>
        styles.bold(header.padEnd(colWidths[i] || 0))
    ).join(' │ ');
    console.log(`┌${'─'.repeat(totalWidth - 2)}┐`);
    console.log(`│ ${headerRow} │`);

    // Print separator
    const separator = headers.map((_, i) =>
        '─'.repeat(colWidths[i] || 0)
    ).join('─┼─');
    console.log(`├─${separator}─┤`);

    // Print rows
    rows.forEach(row => {
        const rowContent = row.map((cell, i) =>
            (cell || '').padEnd(colWidths[i] || 0)
        ).join(' │ ');
        console.log(`│ ${rowContent} │`);
    });

    console.log(`└${'─'.repeat(totalWidth - 2)}┘`);
}

/**
 * Key-value list component
 */
export function KeyValueList({
    items,
    title
}: {
    items: Array<{ key: string; value: string; highlight?: boolean }>;
    title?: string;
}) {
    if (title) {
        console.log(`\n${styles.subheader(title)}`);
    }

    const maxKeyWidth = Math.max(...items.map(item => item.key.length));

    items.forEach(item => {
        const key = item.key.padEnd(maxKeyWidth);
        const value = item.highlight ? styles.highlight(item.value) : item.value;
        console.log(`${colors.muted(key)}: ${value}`);
    });
}

/**
 * Alert component for important messages
 */
export function Alert({
    type,
    title,
    message
}: {
    type: 'info' | 'warning' | 'error';
    title: string;
    message: string;
}) {
    const icons = {
        info: 'ℹ',
        warning: '⚠',
        error: '✗',
    };

    const colorFn = {
        info: colors.info,
        warning: colors.warning,
        error: colors.error,
    };

    const icon = icons[type];
    const color = colorFn[type];

    const content = `${color.bold(title)}\n\n${message}`;
    console.log(createBox(content, `${icon} Alert`, 'rounded'));
}

/**
 * Card component for grouping related information
 */
export function Card({
    title,
    children
}: {
    title?: string;
    children: () => void;
}) {
    const content: string[] = [];
    const originalLog = console.log;

    // Capture console.log output
    console.log = (...args: any[]) => {
        content.push(args.join(' '));
    };

    children();

    // Restore console.log
    console.log = originalLog;

    const boxContent = content.join('\n');
    console.log(createBox(boxContent, title, 'rounded'));
}
