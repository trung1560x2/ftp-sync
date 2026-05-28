import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

async function build() {
  const rootDir = process.cwd();
  const scannerDir = path.join(rootDir, 'api', 'scanner');
  const binDir = path.join(rootDir, 'bin');

  console.log('[Scanner Build] Building Rust scanner...');

  try {
    // Run cargo build
    execSync('cargo build --release', { cwd: scannerDir, stdio: 'inherit' });

    // Ensure bin folder exists
    await fs.ensureDir(binDir);

    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'local_scanner.exe' : 'local_scanner';
    const sourcePath = path.join(scannerDir, 'target', 'release', binaryName);
    const destPath = path.join(binDir, binaryName);

    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, destPath, { overwrite: true });
      console.log(`[Scanner Build] Success! Copied to ${destPath}`);
    } else {
      throw new Error(`Compiled binary not found at ${sourcePath}`);
    }
  } catch (err) {
    console.error('[Scanner Build] Failed:', err.message);
    process.exit(1);
  }
}

build();
