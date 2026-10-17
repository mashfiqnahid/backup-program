const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const { runCleanup } = require('./cleanup');

// Load configuration
const config = require('./config');

const CLIENT_ID = config.CLIENT_ID;
const CLIENT_SECRET = config.CLIENT_SECRET;
const REFRESH_TOKEN = config.REFRESH_TOKEN;

// Environmental and optional parameters with default values
const CLEANUP_CRON_SCHEDULE = config.CLEANUP_CRON_SCHEDULE || '0 * * * *';
const CLEANUP_RUN_ON_STARTUP = config.CLEANUP_RUN_ON_STARTUP !== undefined ? config.CLEANUP_RUN_ON_STARTUP : true;

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(message) {
    console.log(`[${getTimestamp()}] [INFO] ${message}`);
}

function logError(message) {
    console.error(`[${getTimestamp()}] [ERROR] ${message}`);
}

function logWarn(message) {
    console.warn(`[${getTimestamp()}] [WARN] ${message}`);
}

// Helper to update the refresh token inside config.js safely
function updateConfigRefreshToken(newToken) {
    const configPath = path.join(__dirname, 'config.js');
    if (!fs.existsSync(configPath)) {
        logError(`config.js not found at ${configPath}`);
        return;
    }
    let content = fs.readFileSync(configPath, 'utf8');
    
    const regex = /(const\s+REFRESH_TOKEN\s*=\s*['"])([^'"]*)(['"])/;
    if (regex.test(content)) {
        content = content.replace(regex, `$1${newToken}$3`);
        fs.writeFileSync(configPath, content, 'utf8');
    } else {
        logWarn('Could not automatically replace REFRESH_TOKEN in config.js. Please update it manually.');
        console.log(`New Refresh Token: ${newToken}`);
    }
}

// Google OAuth Login Wizard
async function runLoginWizard() {
    log('====================================================');
    log('Google Drive Authentication Wizard');
    log('====================================================');
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
        logError('Error: CLIENT_ID or CLIENT_SECRET is missing in config.js.');
        process.exit(1);
    }

    const redirectUri = 'http://localhost:8585';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent`;

    console.log('\n1. Open this link in your web browser:\n');
    console.log(`   \x1b[36m${authUrl}\x1b[0m\n`);
    console.log('2. Sign in and grant access to Google Drive.');
    console.log('3. Your browser will redirect to a page that says "This site can\'t be reached" (http://localhost:8585...).');
    console.log('4. Copy the entire URL from the browser address bar (or just the code after "?code=") and paste it below.');

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('\nPaste the redirect URL or authorization code here: ', async (code) => {
        rl.close();
        let cleanCode = code.trim();

        if (cleanCode.includes('code=')) {
            try {
                const tempUrl = cleanCode.startsWith('http') ? cleanCode : `http://localhost/${cleanCode}`;
                const urlObj = new URL(tempUrl);
                const codeParam = urlObj.searchParams.get('code');
                if (codeParam) {
                    cleanCode = codeParam;
                }
            } catch (e) {
                // Keep cleanCode as is if parsing fails
            }
        }

        if (!cleanCode) {
            logError('Error: No authorization code entered.');
            process.exit(1);
        }

        try {
            log('Exchanging authorization code for refresh token...');
            const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: cleanCode,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            });

            const { refresh_token } = tokenRes.data;
            if (!refresh_token) {
                logWarn('Warning: No refresh token returned. If you are re-authenticating, you might need to revoke access first at https://myaccount.google.com/permissions so Google returns a refresh token.');
            }
            
            const finalToken = refresh_token || tokenRes.data.access_token;
            updateConfigRefreshToken(finalToken);
            log('Authentication completed successfully! Your token has been updated in config.js.');
            process.exit(0);
        } catch (err) {
            const detail = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
            logError(`Failed to exchange code for token: ${detail}`);
            process.exit(1);
        }
    });
}

// Handle execution modes
const args = process.argv.slice(2);
if (args.includes('--login')) {
    runLoginWizard();
} else if (args.includes('--once')) {
    log('Executing single manual cleanup run (--once flag detected)...');
    runCleanup().then(() => {
        log('Manual cleanup finished.');
        process.exit(0);
    }).catch((err) => {
        logError(`Manual cleanup run failed: ${err.message}`);
        process.exit(1);
    });
} else {
    // Daemon / PM2 Service mode
    log('Google Drive Smart Cleanup Service initializing...');
    log(`Cron Schedule: "${CLEANUP_CRON_SCHEDULE}"`);
    log(`Target Folders: ${JSON.stringify(config.CLEANUP_FOLDER_IDS || [])}`);

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
