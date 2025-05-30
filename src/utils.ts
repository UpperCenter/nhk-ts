import * as readline from 'readline';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { promises as fs } from 'fs';

export function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export async function askQuestion(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

export async function checkDependencies() {
    const deps = [
        { name: 'ffmpeg', args: ['-version'] },
        { name: 'magick', args: ['-version'] },
    ];
    for (const dep of deps) {
        try {
            await new Promise((resolve, reject) => {
                const proc = spawn(dep.name, dep.args, { stdio: 'ignore' });
                proc.on('error', reject);
                proc.on('exit', (code) => (code === 0 ? resolve(null) : reject(new Error())));
            });
        } catch {
            console.error(chalk.red(`Dependency missing: ${dep.name}. Please install it and ensure it is in your PATH.`));
            process.exit(1);
        }
    }
}

/** Sleep for given milliseconds */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitize a string to be safe as a filename by replacing illegal characters
 */
export function sanitizeFilename(name: string): string {
    // Remove or replace characters not allowed in filenames
    return name.replace(/[\\/:*?"<>|]/g, '_');
} 