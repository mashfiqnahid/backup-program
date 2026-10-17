const axios = require('axios');
const config = require('./config');

const CLIENT_ID = config.CLIENT_ID;
const CLIENT_SECRET = config.CLIENT_SECRET;
const REFRESH_TOKEN = config.REFRESH_TOKEN;
const folders = config.CLEANUP_FOLDER_IDS || [config.G_FOLDER_ID];

async function diagnose() {
    try {
        console.log('--- Authentication ---');
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token',
        });
        const accessToken = tokenRes.data.access_token;
        console.log('Access token successfully retrieved.');
        
        console.log('\n--- Scanning Folders ---');
        for (const folderId of folders) {
            console.log(`Checking folder: ${folderId}`);
            // Let's do a general query without restriction
            const q = `'${folderId}' in parents`;
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id, name, createdTime, mimeType, trashed)&pageSize=50`;
            
            try {
                const res = await axios.get(url, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                const files = res.data.files || [];
                console.log(`> Found ${files.length} items:`);
                files.forEach(f => {
                    console.log(`  - Name: "${f.name}" | ID: ${f.id} | Created: ${f.createdTime} | Trashed: ${f.trashed} | MimeType: ${f.mimeType}`);
                });
            } catch (err) {
                console.error(`> Error checking folder ${folderId}:`, err.response ? err.response.data : err.message);
            }
        }
    } catch (err) {
        console.error('Diagnostic failed during auth:', err.response ? err.response.data : err.message);
    }
}

diagnose();
