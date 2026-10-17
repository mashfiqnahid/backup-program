// config.sample.js
const CLIENT_ID = 'your-client-id-here';
const CLIENT_SECRET = 'your-client-secret-here';
const REFRESH_TOKEN = 'your-refresh-token-here';

// Smart Cleanup Settings
const CLEANUP_FOLDER_IDS = [
  'your-google-folder-id-here',
  'another-google-folder-id-here'
];
const CLEANUP_RETENTION_HOURS = 504; // Keep files from last 3 weeks (504 hours, configurable)
const CLEANUP_MIN_RETAIN = 3; // Keep at least X files in each folder to prevent deleting all files
const CLEANUP_CRON_SCHEDULE = '0 * * * *'; // Run cleanup hourly
const CLEANUP_RUN_ON_STARTUP = true; // Run immediate cleanup on service startup

module.exports = {
  CLIENT_ID,
  CLIENT_SECRET,
  REFRESH_TOKEN,
  CLEANUP_FOLDER_IDS,
  CLEANUP_RETENTION_HOURS,
  CLEANUP_MIN_RETAIN,
  CLEANUP_CRON_SCHEDULE,
  CLEANUP_RUN_ON_STARTUP
};


