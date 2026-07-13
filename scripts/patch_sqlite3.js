import fs from 'fs-extra';
import path from 'path';

async function restoreMissingBinary() {
  const rootDir = process.cwd();
  const bindingDir = path.join(rootDir, 'node_modules', 'sqlite3', 'lib', 'binding', 'napi-v3-win32-x64');
  const targetFile = path.join(bindingDir, 'node_sqlite3.node');

  try {
    if (await fs.pathExists(bindingDir) && !(await fs.pathExists(targetFile))) {
      console.log('[SQLite3 Patch] node_sqlite3.node is missing! Checking for locked DELETE backups...');
      const files = await fs.readdir(bindingDir);
      const deleteFile = files.find(f => f.includes('node_sqlite3.node.DELETE'));
      if (deleteFile) {
        await fs.copy(path.join(bindingDir, deleteFile), targetFile);
        console.log(`[SQLite3 Patch] Successfully restored missing node_sqlite3.node from backup: ${deleteFile}`);
      } else {
        console.warn('[SQLite3 Patch] No backup DELETE files found to restore.');
      }
    }
  } catch (err) {
    console.error('[SQLite3 Patch] Failed to restore missing binary:', err.message);
  }
}

async function copyMigrations() {
  const rootDir = process.cwd();
  const srcDir = path.join(rootDir, 'api', 'migrations');
  const destDir = path.join(rootDir, 'dist-server', 'api', 'migrations');

  console.log('[SQLite3 Patch] Copying migrations to dist-server/api/migrations...');
  try {
    if (await fs.pathExists(srcDir)) {
      await fs.ensureDir(destDir);
      await fs.copy(srcDir, destDir, { overwrite: true });
      console.log('[SQLite3 Patch] Migrations copied successfully.');
    } else {
      console.warn('[SQLite3 Patch] api/migrations source directory not found.');
    }
  } catch (err) {
    console.error('[SQLite3 Patch] Failed to copy migrations:', err.message);
  }
}

async function patch() {
  await restoreMissingBinary();
  const rootDir = process.cwd();
  const filePath = path.join(rootDir, 'node_modules', 'sqlite3', 'lib', 'sqlite3-binding.js');

  console.log('[SQLite3 Patch] Checking sqlite3-binding.js...');

  try {
    if (!await fs.pathExists(filePath)) {
      console.log('[SQLite3 Patch] sqlite3-binding.js not found, skipping patch.');
    } else {
      const content = await fs.readFile(filePath, 'utf8');
      if (content.includes('app.asar.unpacked')) {
        console.log('[SQLite3 Patch] Already patched.');
      } else {
        const targetContent = "var binding_path = binary.find(path.resolve(path.join(__dirname,'../package.json')));";
        const replacementContent = `var binding_path = binary.find(path.resolve(path.join(__dirname,'../package.json')));
if (binding_path.includes('app.asar') && !binding_path.includes('app.asar.unpacked')) {
  binding_path = binding_path.replace('app.asar', 'app.asar.unpacked');
}`;

        if (!content.includes(targetContent)) {
          console.error('[SQLite3 Patch] Could not find the target binding line to patch. Skipping.');
        } else {
          const patchedContent = content.replace(targetContent, replacementContent);
          await fs.writeFile(filePath, patchedContent, 'utf8');
          console.log('[SQLite3 Patch] Successfully patched sqlite3-binding.js to support app.asar.unpacked!');
        }
      }
    }
  } catch (err) {
    console.error('[SQLite3 Patch] Failed to patch:', err.message);
  }

  await copyMigrations();
}

patch();
