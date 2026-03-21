import sqlite3 from 'sqlite3';
import { MetadataInfo } from './metadata/types.js';
import { Logger } from './logger.js';

export class DatabaseService {
    private db: sqlite3.Database;
    private logger: Logger;

    constructor(dbPath: string, logger: Logger) {
        this.logger = logger;
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                this.logger.error(`Error opening database: ${err.message}`);
                throw err;
            }
            this.logger.debug(`Connected to the SQLite database at ${dbPath}`);
        });
    }

    public async init(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const sql = `
                CREATE TABLE IF NOT EXISTS processed_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    seriesName TEXT NOT NULL,
                    season INTEGER NOT NULL,
                    episodeNumber INTEGER NOT NULL,
                    episodeName TEXT,
                    firstAired TEXT,
                    tvdbId TEXT,
                    processedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(seriesName, season, episodeNumber)
                );
            `;
            this.db.run(sql, (err) => {
                if (err) {
                    this.logger.error(`Error creating table: ${err.message}`);
                    return reject(err);
                }
                this.logger.debug("Table 'processed_files' is ready.");
                resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            this.db.all(
                'PRAGMA table_info(processed_files)',
                (err, rows: { name: string }[]) => {
                    if (err) {
                        return reject(err);
                    }
                    const hasEpisodeSource = rows.some((r) => r.name === 'episode_source');
                    if (hasEpisodeSource) {
                        return resolve();
                    }
                    this.db.run(
                        "ALTER TABLE processed_files ADD COLUMN episode_source TEXT DEFAULT 'tvdb'",
                        (alterErr) => {
                            if (alterErr) {
                                this.logger.error(`Error adding episode_source column: ${alterErr.message}`);
                                return reject(alterErr);
                            }
                            this.logger.debug("Column 'episode_source' added to processed_files.");
                            resolve();
                        }
                    );
                }
            );
        });
    }

    public async addProcessedFile(metadata: MetadataInfo): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO processed_files (seriesName, season, episodeNumber, episodeName, firstAired, tvdbId, episode_source)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            `;
            const episodeSource = metadata.episodeSource || 'tvdb';
            this.db.run(sql, [
                metadata.seriesName,
                metadata.season,
                metadata.episodeNumber,
                metadata.episodeName,
                metadata.firstAired,
                metadata.tvdbId,
                episodeSource
            ], (err) => {
                if (err) {
                    this.logger.error(`Error inserting data: ${err.message}`);
                    return reject(err);
                }
                this.logger.debug(`Added to history: ${metadata.seriesName} S${metadata.season}E${metadata.episodeNumber}`);
                resolve();
            });
        });
    }

    public async isAlreadyProcessed(metadata: MetadataInfo): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 1 FROM processed_files
                WHERE seriesName = ? AND season = ? AND episodeNumber = ?;
            `;
            this.db.get(sql, [metadata.seriesName, metadata.season, metadata.episodeNumber], (err, row) => {
                if (err) {
                    this.logger.error(`Error checking history: ${err.message}`);
                    return reject(err);
                }
                resolve(!!row);
            });
        });
    }

    public close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    this.logger.error(`Error closing database: ${err.message}`);
                    return reject(err);
                }
                this.logger.debug('Database connection closed.');
                resolve();
            });
        });
    }
}
