const syncManager = require('./src/sync-manager');
const logger = require('./src/logger');

async function main() {
    try {
        logger.info('=== FTP Sync Service Starting ===');
        await syncManager.start();
    } catch (err) {
        logger.error('Fatal Error: %s', err.message);
        process.exit(1);
    }
}

main();

// Xử lý khi user bấm Ctrl+C
process.on('SIGINT', async () => {
    logger.info('Stopping service...');
    const ftpService = require('./src/ftp-service');
    await ftpService.disconnect();
    process.exit(0);
});
