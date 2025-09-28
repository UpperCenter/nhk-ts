import { colors, styles } from './styles.js';

export interface TableColumn {
    key: string;
    title: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    formatter?: (value: any) => string;
}

export interface TableOptions {
    title?: string;
    border?: boolean;
    padding?: number;
    maxWidth?: number;
}

/**
 * Advanced table component with column configuration
 */
export class Table {
    private columns: TableColumn[];
    private options: TableOptions;

    constructor(columns: TableColumn[], options: TableOptions = {}) {
        this.columns = columns;
        this.options = {
            border: true,
            padding: 1,
            ...options,
        };
    }

    render(data: Record<string, any>[]) {
        if (!data || data.length === 0) return;

        // Calculate column widths
        const colWidths = this.columns.map(col => {
            const contentWidth = Math.max(
                col.title.length,
                ...data.map(row => {
                    const value = col.formatter ? col.formatter(row[col.key]) : String(row[col.key] || '');
                    return value.length;
                })
            );
            return Math.min(col.width || contentWidth, this.options.maxWidth || 50);
        });

        const totalWidth = colWidths.reduce((sum, width) => sum + width, 0) +
            (this.columns.length - 1) * 3 +
            (this.options.padding! * 2) + 2;

        // Print title
        if (this.options.title) {
            console.log(`\n${styles.subheader(this.options.title)}`);
        }

        if (this.options.border) {
            this.renderBorder('top', colWidths);
        }

        // Print header
        this.renderRow(
            this.columns.map(col => col.title),
            colWidths,
            true
        );

        if (this.options.border) {
            this.renderSeparator(colWidths);
        }

        // Print data rows
        data.forEach(row => {
            const values = this.columns.map(col => {
                const value = row[col.key];
                return col.formatter ? col.formatter(value) : String(value || '');
            });
            this.renderRow(values, colWidths);
        });

        if (this.options.border) {
            this.renderBorder('bottom', colWidths);
        }
    }

    private renderRow(values: string[], colWidths: number[], isHeader = false) {
        const padding = ' '.repeat(this.options.padding!);
        const content = values.map((value, i) => {
            const width = colWidths[i] || 0;
            const align = this.columns[i]?.align || 'left';

            let formattedValue: string;
            switch (align) {
                case 'center':
                    formattedValue = value.padStart((width + value.length) / 2).padEnd(width);
                    break;
                case 'right':
                    formattedValue = value.padStart(width);
                    break;
                default:
                    formattedValue = value.padEnd(width);
            }

            return isHeader ? styles.bold(formattedValue) : formattedValue;
        }).join(' │ ');

        console.log(`│${padding}${content}${padding}│`);
    }

    private renderSeparator(colWidths: number[]) {
        const padding = ' '.repeat(this.options.padding!);
        const separator = colWidths.map(width => '─'.repeat(width)).join('─┼─');
        console.log(`├${padding}${separator}${padding}┤`);
    }

    private renderBorder(type: 'top' | 'bottom', colWidths: number[]) {
        const padding = ' '.repeat(this.options.padding!);
        const totalWidth = colWidths.reduce((sum, width) => sum + width, 0) +
            (this.columns.length - 1) * 3 +
            (this.options.padding! * 2);

        const border = type === 'top' ? '┌' : '└';
        const line = '─'.repeat(totalWidth);
        const endBorder = type === 'top' ? '┐' : '┘';

        console.log(`${border}${line}${endBorder}`);
    }
}

/**
 * Simple table for key-value pairs
 */
export function KeyValueTable(
    items: Array<{ key: string; value: string; highlight?: boolean }>,
    title?: string
) {
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
 * Configuration table for CLI options
 */
export function ConfigTable(config: Record<string, any>, title = 'Configuration') {
    const items = Object.entries(config).map(([key, value]) => ({
        key: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).replace(/\s+/g, ' ').trim()
            .replace(/\bT V D B\b/g, 'TVDB')
            .replace(/\bA P I\b/g, 'API'),
        value: String(value),
        highlight: key.includes('api') || key.includes('key') || key.includes('secret')
    }));

    KeyValueTable(items, title);
}
