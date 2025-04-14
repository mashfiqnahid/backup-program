const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');
const {
    user,
    pass,
    CLIENT_ID,
    CLIENT_SECRET,
    REFRESH_TOKEN,
    FILE_PATH,
    FILE_NAME,
    G_FOLDER_ID
} = require('./config');


const backupDir = path.join(FILE_PATH);
const zipFileName = path.join(FILE_PATH, FILE_NAME);
// Function to dump MySQL databases using exec
async function dumpMySQLDatabases() {
    const databases = ['publication_main', 'publication_kg', 'publication_notes'];

    for (const db of databases) {
        const command = `f:\\xampp\\mysql\\bin\\mysqldump --opt --user="${user}" --password="${pass}" ${db} > "${path.join(backupDir, `${db}.sql`)}"`;

        try {
            // Execute the command
            await new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        reject(`Error dumping database ${db}: ${error.message}`);
                    } else if (stderr) {
                        reject(`stderr: ${stderr}`);
                    } else {
                        console.log(`Database ${db} dumped successfully.`);
                        resolve(stdout);
                    }
                });
            });
        } catch (error) {
            console.error(error);
        }
    }
}

// Function to zip SQL files into one backup file
async function zipBackupFiles() {
    const command = `"C:\\Program Files\\7-Zip\\7z.exe" a -tzip -r ${FILE_NAME} *.sql`;

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(`Error Deleting ${FILE_NAME} : ${error.message}`);
            } else if (stderr) {
                reject(`stderr: ${stderr}`);
            } else {
                console.log(`${FILE_NAME} file created successfully.`);
                resolve(stdout);
            }
        });
    });
}

// Function to get access token from Google OAuth
async function getAccessToken() {
    try {
        const response = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token',
        });
        return response.data.access_token;
    } catch (error) {
        throw new Error('Error getting access token: ' + error.message);
    }
}

// Function to check for existing file in Google Drive
async function checkExistingFile(accessToken) {
    const queryString = encodeURIComponent(`name = "${FILE_NAME}" and '${G_FOLDER_ID}' in parents`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${queryString}`
    const token = `Bearer ${accessToken}`
    // console.log(JSON.stringify({ url, token },null, 2))
    try {
        const response = await axios.get(url, {
            headers: { Authorization: token },
        });
        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }
        return null;
    } catch (error) {
        throw new Error('Error checking for existing file: ' + error.message);
    }
}

// Function to delete existing file on Google Drive
async function deleteExistingFile(fileId, accessToken) {
    try {
        await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log('Existing file deleted.');
    } catch (error) {
        console.error('Error deleting existing file: ' + error.message);
    }
}

// Function to upload new file to Google Drive
async function uploadFileToDrive(accessToken) {
    const form = new FormData();
    form.append('metadata', JSON.stringify({
        name: FILE_NAME,
        parents: [G_FOLDER_ID],
    }), {
        contentType: 'application/json',
    });
    form.append('file', fs.createReadStream(zipFileName));

    try {
        const response = await axios.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', form, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...form.getHeaders(),
            },
        });
        console.log('File uploaded successfully!');
    } catch (error) {
        throw new Error('Error uploading file: ' + error.message);
    }
}
// Function to delete the backup file (FILE_NAME)
async function deleteBackupFile() {
    try {
        if (fs.existsSync(zipFileName)) {
            // Delete the backup file if it exists
            fs.unlinkSync(zipFileName);
            console.log('Backup file deleted successfully.');
        } else {
            console.log('Backup file does not exist.');
        }
    } catch (error) {
        console.error('Error deleting backup file: ' + error.message);
    }
}
// Main function to execute all tasks
async function backup() {
    try {
        console.log('Starting backup process...');

        // Dump MySQL databases
        await dumpMySQLDatabases();

        // Zip the SQL files
        await zipBackupFiles();

        // Get Google Drive access token
        const accessToken = await getAccessToken();
        console.log('Access token obtained.');

        // Check for existing file on Google Drive
        const existingFileId = await checkExistingFile(accessToken);

        // If file exists, delete it
        if (existingFileId) {
            await deleteExistingFile(existingFileId, accessToken);
        }

        // Upload the new file to Google Drive
        await uploadFileToDrive(accessToken);

        // Clean up SQL files
        fs.readdirSync(backupDir).forEach(file => {
            if (file.endsWith('.sql')) {
                fs.unlinkSync(path.join(backupDir, file));
            }
        });
        await deleteBackupFile()

        console.log('Backup process completed.');
    } catch (error) {
        console.error('Error during backup process: ' + error.message);
    }
}

// Execute backup
backup();
