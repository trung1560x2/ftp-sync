import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.resolve(__dirname, '../node_modules/monaco-editor');
const dest = path.resolve(__dirname, '../public/monaco-editor');

async function copyMonaco() {
    try {
        await fs.ensureDir(dest);
        console.log('Copying Monaco Editor files...');
        await fs.copy(src, dest);
        console.log('Monaco Editor files copied successfully to public/monaco-editor');
    } catch (err) {
        console.error('Error copying Monaco Editor files:', err);
        process.exit(1);
    }
}

copyMonaco();
