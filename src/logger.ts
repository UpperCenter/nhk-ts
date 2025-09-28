import { colors, styles } from './ui/styles.js';
import { Status, Section, Alert, Card } from './ui/components.js';
import { ConfigTable, KeyValueTable } from './ui/table.js';
import { ProgressBar, Spinner, StepProgress, FileProgress } from './ui/progress.js';

export type LogLevel = 'quiet' | 'normal' | 'verbose';

export interface LoggerOptions {
    verbosity?: LogLevel;
    quiet?: boolean;
    showTimestamp?: boolean;
    showLevel?: boolean;
}

export class Logger {
    private verbosity: LogLevel;
    private quiet: boolean;
    private showTimestamp: boolean;
    private showLevel: boolean;
    private spinner: Spinner;

    constructor(options: LoggerOptions = {}) {
        this.verbosity = options.verbosity || 'normal';
        this.quiet = options.quiet || false;
        this.showTimestamp = options.showTimestamp || false;
        this.showLevel = options.showLevel || false;
        this.spinner = new Spinner();
    }

    private shouldLog(level: LogLevel): boolean {
        if (this.quiet) return false;

        const levels = { quiet: 0, normal: 1, verbose: 2 };
        return levels[this.verbosity] >= levels[level];
    }

    private formatMessage(level: string, message: string): string {
        let output = '';

        if (this.showTimestamp) {
            const timestamp = new Date().toISOString();
            output += `${colors.muted(`[${timestamp}]`)} `;
        }

        if (this.showLevel) {
            output += `${colors.muted(`[${level.toUpperCase()}]`)} `;
        }

        output += message;
        return output;
    }

    // Basic logging methods
    info(message: string, details?: string) {
        if (!this.shouldLog('normal')) return;
        Status({ type: 'info', message, details: details || undefined });
    }

    success(message: string, details?: string) {
        if (!this.quiet) {
            Status({ type: 'success', message, details: details || undefined });
        }
    }

    warning(message: string, details?: string) {
        if (!this.quiet) {
            Status({ type: 'warning', message, details: details || undefined });
        }
    }

    error(message: string, details?: string) {
        if (!this.quiet) {
            Status({ type: 'error', message, details: details || undefined });
        }
    }

    debug(message: string, details?: string) {
        if (!this.shouldLog('verbose')) return;
        console.log(`${colors.muted('🐞')} ${colors.muted(message)}`);
        if (details) {
            console.log(`  ${colors.muted(details)}`);
        }
    }

    // Enhanced logging methods
    section(title: string, children?: () => void) {
        if (this.quiet) return;

        if (children) {
            Section({ title, children });
        } else {
            console.log(`\n${styles.header(title)}`);
            console.log(styles.separator());
        }
    }

    table(rows: string[][], headers?: string[], title?: string) {
        if (this.quiet) return;

        if (headers && rows.length > 0) {
            // Simple table implementation for compatibility
            const colWidths = headers.map((header, i) => {
                const maxContentWidth = Math.max(...rows.map(row => (row[i] || '').length));
                return Math.max(header.length, maxContentWidth);
            });

            const totalWidth = colWidths.reduce((sum, width) => sum + width, 0) + (headers.length - 1) * 3 + 4;

            if (title) {
                console.log(`\n${styles.subheader(title)}`);
            }

            // Header
            const headerRow = headers.map((header, i) =>
                styles.bold(header.padEnd(colWidths[i] || 0))
            ).join(' │ ');
            console.log(`┌${'─'.repeat(totalWidth - 2)}┐`);
            console.log(`│ ${headerRow} │`);

            // Separator
            const separator = headers.map((_, i) =>
                '─'.repeat(colWidths[i] || 0)
            ).join('─┼─');
            console.log(`├─${separator}─┤`);

            // Rows
            rows.forEach(row => {
                const rowContent = row.map((cell, i) =>
                    (cell || '').padEnd(colWidths[i] || 0)
                ).join(' │ ');
                console.log(`│ ${rowContent} │`);
            });

            console.log(`└${'─'.repeat(totalWidth - 2)}┘`);
        }
    }

    config(config: Record<string, any>, title = 'Configuration') {
        if (this.quiet) return;
        ConfigTable(config, title);
    }

    keyValue(items: Array<{ key: string; value: string; highlight?: boolean }>, title?: string) {
        if (this.quiet) return;
        KeyValueTable(items, title);
    }

    // Progress methods
    progress(message: string) {
        if (!this.shouldLog('normal')) return;
        this.spinner.start(message);
    }

    progressStop(message?: string) {
        this.spinner.stop(message);
    }

    progressSuccess(message: string) {
        this.spinner.success(message);
    }

    progressError(message: string) {
        this.spinner.error(message);
    }

    createProgressBar(total: number, options?: any) {
        return new ProgressBar(total, options);
    }

    createStepProgress(steps: string[]) {
        return new StepProgress(steps);
    }

    createFileProgress(totalFiles: number) {
        return new FileProgress(totalFiles);
    }

    // Alert methods
    alert(type: 'info' | 'warning' | 'error', title: string, message: string) {
        if (this.quiet) return;
        Alert({ type, title, message });
    }

    // Card methods
    card(title: string, children: () => void) {
        if (this.quiet) return;
        Card({ title, children });
    }

    // Utility methods
    clear() {
        console.clear();
    }

    newline() {
        if (!this.quiet) console.log();
    }

    separator(char: string = '─', length: number = 60) {
        if (!this.quiet) {
            console.log(styles.separator(char, length));
        }
    }

    divider(char: string = '═', length: number = 60) {
        if (!this.quiet) {
            console.log(styles.divider(char, length));
        }
    }

    // Legacy compatibility methods - removed duplicate section method

    // File size formatting
    formatFileSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    // Duration formatting
    formatDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
}
