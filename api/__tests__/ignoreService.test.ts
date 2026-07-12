import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { shouldIgnore, writeFtpIgnore, readFtpIgnore, clearIgnoreCache } from '../services/IgnoreService.js';

describe('IgnoreService', () => {
  const testRoot = path.resolve(process.cwd(), 'scratch/test_ignore');

  beforeEach(async () => {
    await fs.ensureDir(testRoot);
    clearIgnoreCache(testRoot);
  });

  afterEach(async () => {
    await fs.remove(testRoot);
    clearIgnoreCache(testRoot);
  });

  it('should not ignore files by default if .ftpignore does not exist', async () => {
    const file1 = path.join(testRoot, 'index.js');
    const file2 = path.join(testRoot, 'some-log.log');
    
    expect(await shouldIgnore(testRoot, file1)).toBe(false);
    expect(await shouldIgnore(testRoot, file2)).toBe(false);
  });

  it('should read the default template if .ftpignore does not exist', async () => {
    const content = await readFtpIgnore(testRoot);
    expect(content).toContain('# FTP Ignore Patterns');
  });

  it('should write and apply custom ignore patterns', async () => {
    const patterns = `
      # Ignore all log files
      *.log
      # Ignore temporary directories
      temp/
    `;

    await writeFtpIgnore(testRoot, patterns);

    // Verify it reads back correctly
    const saved = await readFtpIgnore(testRoot);
    expect(saved).toBe(patterns);

    // Check matching patterns
    expect(await shouldIgnore(testRoot, path.join(testRoot, 'error.log'))).toBe(true);
    expect(await shouldIgnore(testRoot, path.join(testRoot, 'temp', 'data.json'))).toBe(true);
    
    // Check non-matching patterns
    expect(await shouldIgnore(testRoot, path.join(testRoot, 'app.js'))).toBe(false);
    expect(await shouldIgnore(testRoot, path.join(testRoot, 'log.txt'))).toBe(false);
  });

  it('should reload ignore patterns when the cache is cleared', async () => {
    // 1. Initially ignore nothing
    expect(await shouldIgnore(testRoot, path.join(testRoot, 'debug.log'))).toBe(false);

    // 2. Write custom pattern but DO NOT clear cache manually, verify shouldIgnore checks cache
    const ftpignorePath = path.join(testRoot, '.ftpignore');
    await fs.writeFile(ftpignorePath, '*.log', 'utf-8');
    
    // Since cache is not cleared yet, should still be false
    expect(await shouldIgnore(testRoot, path.join(testRoot, 'debug.log'))).toBe(false);

    // 3. Clear cache and verify it reloads new patterns
    clearIgnoreCache(testRoot);
    expect(await shouldIgnore(testRoot, path.join(testRoot, 'debug.log'))).toBe(true);
  });
});
