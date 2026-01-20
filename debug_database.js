
import fs from 'fs';
import path from 'path';

const localRoot = 'E:\\xampp\\htdocs\\New folder (2)';
const subPath = 'database';
const fullPath = path.join(localRoot, subPath);

console.log('Listing directory:', fullPath);

if (fs.existsSync(fullPath)) {
    const files = fs.readdirSync(fullPath);
    console.log(`Found ${files.length} items:`);
    files.forEach(f => {
        const itemPath = path.join(fullPath, f);
        try {
            const stats = fs.statSync(itemPath);
            const type = stats.isDirectory() ? 'DIR ' : 'FILE';
            console.log(`[${type}] ${f} (size: ${stats.size})`);
        } catch (e) {
            console.log(`[ERR ] ${f} - Stat failed: ${e.message}`);
        }
    });
} else {
    console.log('Directory NOT found.');
}
