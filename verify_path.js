
import fs from 'fs';
import path from 'path';

// Hardcoded based on DB finding
const localRoot = 'E:\\xampp\\htdocs\\New folder (2)';
const relativePath = 'database/data/cambodia.json'; // The file shown in image
const fullPath = path.join(localRoot, ...relativePath.split('/'));

console.log('Checking path:', fullPath);

if (fs.existsSync(fullPath)) {
    console.log('File EXISTS.');
    try {
        const stats = fs.statSync(fullPath);
        console.log('Stats:', stats);
    } catch (e) {
        console.log('Stat failed:', e.message);
    }
} else {
    console.log('File does NOT exist.');

    // Check parent dir
    const parent = path.dirname(fullPath);
    console.log('Checking parent:', parent);
    if (fs.existsSync(parent)) {
        console.log('Parent dir EXISTS.');
        console.log('Contents:', fs.readdirSync(parent));
    } else {
        console.log('Parent dir does NOT exist.');
    }
}
