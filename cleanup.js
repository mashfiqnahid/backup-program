const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');

// Load configuration
const config = require('./config');

const CLIENT_ID = config.CLIENT_ID;
const CLIENT_SECRET = config.CLIENT_SECRET;
const REFRESH_TOKEN = config.REFRESH_TOKEN;

// Cleanup configuration with fallbacks
const CLEANUP_FOLDER_IDS = config.CLEANUP_FOLDER_IDS || (config.G_FOLDER_ID ? [config.G_FOLDER_ID] : []);
const CLEANUP_RETENTION_HOURS = parseInt(config.CLEANUP_RETENTION_HOURS !== undefined ? config.CLEANUP_RETENTION_HOURS : '48', 10);
const CLEANUP_MIN_RETAIN = parseInt(config.CLEANUP_MIN_RETAIN !== undefined ? config.CLEANUP_MIN_RETAIN : '3', 10);
const CLEANUP_CRON_SCHEDULE = config.CLEANUP_CRON_SCHEDULE || '0 * * * *'; // Run cleanup hourly by default
const CLEANUP_RUN_ON_STARTUP = config.CLEANUP_RUN_ON_STARTUP !== undefined ? config.CLEANUP_RUN_ON_STARTUP : true;

let isCleaningUp = false;

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(message) {
    console.log(`[${getTimestamp()}] [CLEANUP] [INFO] ${message}`);
}

function logWarn(message) {
    console.warn(`[${getTimestamp()}] [CLEANUP] [WARN] ${message}`);
}

function logError(message) {
    console.error(`[${getTimestamp()}] [CLEANUP] [ERROR] ${message}`);
}

// Utility to retry async operations
async function retryOperation(fn, maxRetries = 3, delayMs = 3000, description = 'Operation') {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isLastAttempt = attempt === maxRetries;
            const errorMsg = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
            if (isLastAttempt) {
                throw new Error(`${description} failed after ${maxRetries} attempts: ${errorMsg}`);
            }
            logWarn(`${description} attempt ${attempt} failed: ${errorMsg}. Retrying in ${delayMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

// Function to get access token from Google OAuth
async function getAccessToken() {
    return retryOperation(async () => {
        log('Authenticating with Google OAuth API...');
        const response = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token',
        }, { timeout: 30000 });

        if (!response.data || !response.data.access_token) {
            throw new Error('Access token not found in Google OAuth response');
        }
        return response.data.access_token;
    }, 3, 3000, 'Google OAuth token retrieval');
}

// Function to delete a specific file on Google Drive
async function deleteFile(fileId, fileName, accessToken) {
    try {
        await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 30000,
        });
        log(`Successfully deleted old backup: "${fileName}" (ID: ${fileId})`);
        return true;
    } catch (error) {
        const detail = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
        logError(`Failed to delete "${fileName}" (ID: ${fileId}): ${detail}`);
        return false;
    }
}

// Scan a single folder and delete files older than threshold
async function cleanFolder(folderId, accessToken, cutoffTime, minRetain = CLEANUP_MIN_RETAIN, retentionHours = CLEANUP_RETENTION_HOURS) {
    log(`Scanning Google Drive folder: ${folderId}...`);
    try {
        const queryString = encodeURIComponent(
            `'${folderId}' in parents and trashed = false`
        );
        const url = `https://www.googleapis.com/drive/v3/files?q=${queryString}&fields=files(id, name, createdTime, mimeType)&pageSize=1000`;
        
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 30000
        });

        if (!response.data || !response.data.files) {
            logWarn(`No files found or invalid response for folder ${folderId}`);
            return;
        }

        const files = response.data.files || [];
        // Filter out folders and sort actual files descending by creation date (newest first)
        const actualFiles = files
            .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
            .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

        log(`Found ${actualFiles.length} file(s) in folder ${folderId} (excluding folders).`);

        let deletedCount = 0;
        let keptCount = 0;

        for (let i = 0; i < actualFiles.length; i++) {
            const file = actualFiles[i];
            const createdTime = new Date(file.createdTime);

            if (isNaN(createdTime.getTime())) {
                logWarn(`Skipping file "${file.name}" with invalid createdTime: ${file.createdTime}`);
                keptCount++;
                continue;
            }

            // Keep the file if it is within the minimum retain count (newest files)
            if (i < minRetain) {
                log(`Keeping "${file.name}" (created at ${file.createdTime}) as it is one of the ${minRetain} newest files.`);
                keptCount++;
                continue;
            }

            // Keep the file if it is younger than the retention threshold
            if (createdTime >= cutoffTime) {
                keptCount++;
                continue;
            }

            // Otherwise delete
            log(`File "${file.name}" created at ${file.createdTime} is older than ${retentionHours} hours and exceeds minimum retention count of ${minRetain}. Deleting...`);
            const success = await deleteFile(file.id, file.name, accessToken);
            if (success) {
                deletedCount++;
            } else {
                keptCount++;
            }
        }

        log(`Folder ${folderId} cleanup finished. Deleted: ${deletedCount}, Kept: ${keptCount}`);
    } catch (error) {
        const detail = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
        logError(`Error scanning folder ${folderId}: ${detail}`);
    }
}

// Main cleanup execution
async function runCleanup() {
    if (isCleaningUp) {
        logWarn('Cleanup process is already running. Skipping this iteration.');
        return;
    }

    // Dynamically reload config to pick up modifications without needing full process recreation
    let activeConfig = config;
    try {
        delete require.cache[require.resolve('./config')];
        activeConfig = require('./config');
    } catch (e) {
        activeConfig = config;
    }

    const targetFolders = activeConfig.CLEANUP_FOLDER_IDS || (activeConfig.G_FOLDER_ID ? [activeConfig.G_FOLDER_ID] : []);
    const retentionHours = parseInt(activeConfig.CLEANUP_RETENTION_HOURS !== undefined ? activeConfig.CLEANUP_RETENTION_HOURS : '504', 10);
    const minRetain = parseInt(activeConfig.CLEANUP_MIN_RETAIN !== undefined ? activeConfig.CLEANUP_MIN_RETAIN : '8', 10);

    if (!targetFolders || targetFolders.length === 0) {
        logError('No folder IDs configured in CLEANUP_FOLDER_IDS.');
        return;
    }

    isCleaningUp = true;
    const startTime = Date.now();
    log('====================================================');
    log(`Starting Google Drive smart cleanup process...`);
    log(`Retention period: ${retentionHours} hours (${(retentionHours / 24).toFixed(1)} days)`);
    log(`Target folders: ${JSON.stringify(targetFolders)}`);

    try {
        const accessToken = await getAccessToken();
        const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
        log(`Cutoff time (older files will be deleted): ${cutoffTime.toISOString()}`);

        for (const folderId of targetFolders) {
            await cleanFolder(folderId, accessToken, cutoffTime, minRetain, retentionHours);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`Smart cleanup completed successfully in ${duration}s.`);
        log('====================================================');
    } catch (error) {
        logError(`Cleanup run failed: ${error.message}`);
        log('====================================================');
    } finally {
        isCleaningUp = false;
    }
}

// Handle execution modes
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--once')) {
        log('Executing single manual cleanup run (--once flag detected)...');
        runCleanup().then(() => {
            log('Manual cleanup finished.');
            process.exit(0);
        }).catch((err) => {
            logError(`Manual cleanup run failed: ${err.message}`);
            process.exit(1);
        });
    } else {
        // Daemon mode
        log('Google Drive Smart Cleanup Service initializing...');
        log(`Cron Schedule: "${CLEANUP_CRON_SCHEDULE}"`);
        log(`Retention Hours: ${CLEANUP_RETENTION_HOURS} hours`);

        if (!cron.validate(CLEANUP_CRON_SCHEDULE)) {
            logError(`Invalid cron expression: "${CLEANUP_CRON_SCHEDULE}". Please verify config.js.`);
            process.exit(1);
        }

        if (CLEANUP_RUN_ON_STARTUP) {
            log('Triggering initial cleanup on service startup...');
            runCleanup().catch(err => logError(`Startup cleanup failed: ${err.message}`));
        }

        cron.schedule(CLEANUP_CRON_SCHEDULE, () => {
            log(`Cron trigger fired for schedule "${CLEANUP_CRON_SCHEDULE}".`);
            runCleanup();
        });

        log('Cleanup service is active and waiting for next scheduled run.');

        // Graceful process shutdown handling
        process.on('SIGINT', () => {
            log('Received SIGINT signal. Shutting down cleanup service gracefully...');
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            log('Received SIGTERM signal. Shutting down cleanup service gracefully...');
            process.exit(0);
        });
    }
}

module.exports = { runCleanup };
