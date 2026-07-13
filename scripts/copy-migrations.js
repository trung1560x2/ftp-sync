/**
 * Copy migration .sql files from api/migrations to dist-server/api/migrations
 * so the built server can run migrations. TypeScript compiler does not copy
 * non-TS assets, so we do it explicitly here.
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'api', 'migrations');
const destDir = path.join(__dirname, '..', 'dist-server', 'api', 'migrations');

(async () => {
  await fs.ensureDir(destDir);
  await fs.copy(srcDir, destDir);
  const files = await fs.readdir(destDir);
  console.log(`Copied ${files.length} migration files to dist-server/api/migrations:`);
  files.forEach(f => console.log(`  ${f}`));
})();
