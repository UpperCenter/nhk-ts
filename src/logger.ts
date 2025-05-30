import chalk from 'chalk';

export class Logger {
    private verbosity: 'quiet' | 'normal' | 'verbose';
    private quiet: boolean;
    constructor(verbosity: 'quiet' | 'normal' | 'verbose' = 'normal', quiet = false) {
        this.verbosity = verbosity;
        this.quiet = quiet;
    }
    info(msg: string) { if (!this.quiet && this.verbosity !== 'quiet') console.log(chalk.blue('ℹ️  ' + msg)); }
    warn(msg: string) { if (!this.quiet) console.log(chalk.yellow('⚠️  ' + msg)); }
    error(msg: string) { if (!this.quiet) console.log(chalk.red('❌ ' + msg)); }
    success(msg: string) { if (!this.quiet) console.log(chalk.green('✅ ' + msg)); }
    debug(msg: string) { if (this.verbosity === 'verbose' && !this.quiet) console.log(chalk.gray('🐞 ' + msg)); }
    section(title: string) { if (!this.quiet) console.log(chalk.magenta('\n' + '='.repeat(60) + `\n${title}\n` + '='.repeat(60))); }
    progress(msg: string) { if (!this.quiet && this.verbosity !== 'quiet') console.log(chalk.cyan('⏳ ' + msg)); }
    table(rows: string[][], headers?: string[]) {
        if (this.quiet) return;
        if (!rows || rows.length === 0) return;
        if (!rows[0]) return;
        const safeLength = (v: string | undefined) => v ? v.length : 0;
        const numCols = headers ? headers.length : rows[0].length;
        const colWidths = Array.from({ length: numCols }, (_, i) =>
            headers ? Math.max(headers[i]?.length ?? 0, ...rows.map(r => safeLength(r[i])))
                : Math.max(...rows.map(r => safeLength(r[i])))
        );
        if (headers && Array.isArray(headers)) {
            console.log(headers.map((h, i) => chalk.bold((h ?? '').padEnd(colWidths[i] ?? 0))).join(' | '));
            console.log(colWidths.map((w, i) => '-'.repeat(colWidths[i] ?? 0)).join('-|-'));
        }
        for (const row of rows) {
            console.log(row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join(' | '));
        }
    }
} 