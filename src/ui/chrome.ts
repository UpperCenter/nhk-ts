import os from 'os';
import { colors } from './styles.js';

function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

function hr(width: number): string {
    return colors.outlineVariant('─'.repeat(Math.max(8, width)));
}

/**
 * Top “app bar” inspired by terminal / TUI dashboards (uptime, memory, runtime).
 */
export function printAppChromeHeader(appName: string, version: string): void {
    const w = Math.min(process.stdout.columns || 80, 120);
    const uptime = formatUptime(os.uptime());
    const memUsedGiB = (os.totalmem() - os.freemem()) / 1024 ** 3;
    const memTotGiB = os.totalmem() / 1024 ** 3;

    console.log(hr(w));
    console.log(
        `${colors.secondary.bold(appName)}${colors.muted(`_${version}`)}    ` +
            `${colors.secondary.bold('UPTIME:')} ${colors.onSurfaceVariant(uptime)}    ` +
            `${colors.muted('MEM:')} ${colors.onSurfaceVariant(`${memUsedGiB.toFixed(1)} / ${memTotGiB.toFixed(1)} GiB`)}    ` +
            `${colors.muted('NODE:')} ${colors.onSurfaceVariant(process.version)}`,
    );
    console.log(hr(w));
}

/**
 * Footer hint row (non-interactive in this CLI; mirrors TUI shortcut legends).
 */
export function printAppChromeFooter(version: string): void {
    const w = Math.min(process.stdout.columns || 80, 120);
    const hint =
        `${colors.tertiary('?')} ${colors.onSurfaceVariant('help')}  ` +
        `${colors.muted('│')}  ${colors.muted('Docs:')} ${colors.primary('https://github.com/UpperCenter/nhk-ts')}`;

    console.log(hr(w));
    console.log(hint);
    console.log(hr(w));
}
