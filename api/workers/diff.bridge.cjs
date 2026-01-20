const path = require('path');

try {
    // Register tsx to handle TypeScript imports
    require('tsx/cjs');

    // Load the actual worker file
    require(path.resolve(__dirname, 'diff.worker.ts'));
} catch (error) {
    console.error('[Bridge Error]', error);
    process.exit(1);
}
