require('dotenv').config();
const path = require('path');

const localRoot = process.env.LOCAL_ROOT || './sync_folder';

module.exports = {
    ftp: {
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASSWORD,
        secure: process.env.FTP_SECURE === 'true',
        port: parseInt(process.env.FTP_PORT || '21', 10),
    },
    remoteRoot: process.env.REMOTE_ROOT || '/',
    localRoot: path.resolve(process.cwd(), localRoot),
    syncMode: process.env.SYNC_MODE || 'bi_directional',
    syncInterval: parseInt(process.env.SYNC_INTERVAL || '60', 10) * 1000, // Convert to ms
};
