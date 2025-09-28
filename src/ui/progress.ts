import { colors, styles, createProgressBar } from './styles.js';

export interface ProgressOptions {
    width?: number;
    showPercentage?: boolean;
    showCount?: boolean;
    label?: string;
    updateInterval?: number;
}

export class ProgressBar {
    private current = 0;
    private total = 0;
    private label = '';
    private options: Required<ProgressOptions>;
    private lastUpdate = 0;
    private interval: NodeJS.Timeout | null = null;
    private isComplete = false;

    constructor(total: number, options: ProgressOptions = {}) {
        this.total = total;
        this.options = {
            width: 40,
            showPercentage: true,
            showCount: true,
            label: '',
            updateInterval: 100,
            ...options,
        };
    }

    update(current: number, label?: string) {
        if (this.isComplete) return;

        this.current = Math.min(current, this.total);
        if (label) this.label = label;

        // Throttle updates
        const now = Date.now();
        if (now - this.lastUpdate < this.options.updateInterval) return;
        this.lastUpdate = now;

        this.render();
    }

    private render() {
        const percentage = (this.current / this.total) * 100;
        const bar = createProgressBar(this.current, this.total, this.options.width);

        let output = '';

        // Add label if provided
        if (this.label) {
            output += `${this.label} `;
        }

        // Add progress bar
        output += colors.primary(bar);

        // Add percentage if enabled
        if (this.options.showPercentage) {
            output += ` ${percentage.toFixed(1)}%`;
        }

        // Add count if enabled
        if (this.options.showCount) {
            output += ` (${this.current}/${this.total})`;
        }

        // Clear line and write
        process.stdout.write('\r\x1b[K');
        process.stdout.write(output);
    }

    complete(message?: string) {
        if (this.isComplete) return;

        this.isComplete = true;
        this.current = this.total;

        // Clear line
        process.stdout.write('\r\x1b[K');

        if (message) {
            console.log(`${colors.success('✓')} ${message}`);
        } else {
            console.log(`${colors.success('✓')} Complete`);
        }
    }

    start(label?: string) {
        if (label) this.label = label;
        this.update(0);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        process.stdout.write('\r\x1b[K');
    }
}

/**
 * Multi-step progress indicator
 */
export class StepProgress {
    private steps: string[];
    private currentStep = 0;
    private completedSteps = 0;

    constructor(steps: string[]) {
        this.steps = steps;
    }

    start() {
        this.render();
    }

    next(stepName?: string) {
        if (stepName) {
            this.steps[this.currentStep] = stepName;
        }
        this.completedSteps++;
        this.currentStep = Math.min(this.currentStep + 1, this.steps.length - 1);
        this.render();
    }

    setStep(stepIndex: number, stepName?: string) {
        this.currentStep = Math.min(stepIndex, this.steps.length - 1);
        if (stepName) {
            this.steps[this.currentStep] = stepName;
        }
        this.render();
    }

    complete() {
        this.completedSteps = this.steps.length;
        this.currentStep = this.steps.length - 1;
        this.render();
    }

    private render() {
        console.log(`\n${styles.subheader('Progress')}`);

        this.steps.forEach((step, index) => {
            let status = '';
            let stepText = step;

            if (index < this.completedSteps) {
                status = colors.success('✓');
            } else if (index === this.currentStep) {
                status = colors.primary('●');
            } else {
                status = colors.muted('○');
            }

            if (index === this.currentStep) {
                stepText = styles.bold(stepText);
            }

            console.log(`  ${status} ${stepText}`);
        });

        console.log();
    }
}

/**
 * Indeterminate spinner for operations without known progress
 */
export class Spinner {
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private currentFrame = 0;
    private interval: NodeJS.Timeout | null = null;
    private message = '';
    private isRunning = false;

    start(message: string = '') {
        if (this.isRunning) return;

        this.message = message;
        this.isRunning = true;

        this.interval = setInterval(() => {
            process.stdout.write('\r\x1b[K');
            process.stdout.write(`${this.frames[this.currentFrame]} ${this.message}`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 100);
    }

    update(message: string) {
        this.message = message;
    }

    stop(message?: string) {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        process.stdout.write('\r\x1b[K');

        if (message) {
            console.log(`${colors.success('✓')} ${message}`);
        }
    }

    success(message: string) {
        this.stop(message);
    }

    error(message: string) {
        this.stop();
        console.log(`${colors.error('✗')} ${message}`);
    }
}

/**
 * File processing progress with file names
 */
export class FileProgress {
    private currentFile = '';
    private fileIndex = 0;
    private totalFiles = 0;
    private progressBar: ProgressBar;

    constructor(totalFiles: number) {
        this.totalFiles = totalFiles;
        this.progressBar = new ProgressBar(totalFiles, {
            width: 30,
            showCount: true,
            showPercentage: true,
        });
    }

    startFile(filename: string) {
        this.currentFile = filename;
        this.fileIndex++;

        console.log(`\n${styles.subheader(`Processing: ${filename}`)}`);
        this.progressBar.update(this.fileIndex - 1, `File ${this.fileIndex}/${this.totalFiles}`);
    }

    updateFileProgress(current: number, total: number) {
        const percentage = (current / total) * 100;
        const bar = createProgressBar(current, total, 20);

        process.stdout.write('\r\x1b[K');
        process.stdout.write(`  ${colors.primary(bar)} ${percentage.toFixed(1)}%`);
    }

    completeFile(message?: string) {
        this.progressBar.update(this.fileIndex, `File ${this.fileIndex}/${this.totalFiles}`);

        if (message) {
            console.log(`\n  ${colors.success('✓')} ${message}`);
        }
    }

    complete() {
        this.progressBar.complete('All files processed');
    }
}


