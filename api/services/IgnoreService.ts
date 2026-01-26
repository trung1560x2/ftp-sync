import ignore, { Ignore } from 'ignore';
import path from 'path';
import fs from 'fs-extra';

const FTPIGNORE_FILENAME = '.ftpignore';

// Cache for ignore instances per connection local path
const ignoreCache: Map<string, { instance: Ignore; mtime: number }> = new Map();

/**
 * Default patterns to ignore (similar to common .gitignore defaults)
 * These patterns are always applied unless overridden by .ftpignore
 */
const DEFAULT_PATTERNS = [
    // Version Control
    '.git/',
    '.svn/',
    '.hg/',

    // OS Files
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',

    // Dependencies
    'node_modules/',
    'vendor/',
    'bower_components/',

    // Build/Cache
    // 'dist/',  <-- Removed to allow syncing
    // 'build/', <-- Removed to allow syncing
    'coverage/',
    '.cache/',
    'storage/',
    'bootstrap/cache/',

    // IDE/Editor
    '.idea/',
    '.vscode/',
    '*.swp',
    '*.swo',

    // Logs
    '*.log',
    'npm-debug.log*',
];


/**
 * Get or create an Ignore instance for a given local root directory.
 * The instance is cached and reloaded if the .ftpignore file changes.
 */
export async function getIgnoreInstance(localRoot: string): Promise<Ignore> {
    const ftpignorePath = path.join(localRoot, FTPIGNORE_FILENAME);

    // Check if .ftpignore file exists
    let currentMtime = 0;
    try {
        const stats = await fs.stat(ftpignorePath);
        currentMtime = stats.mtimeMs;
    } catch {
        // File doesn't exist, use default patterns only
    }

    // Check cache
    const cached = ignoreCache.get(localRoot);
    if (cached && cached.mtime === currentMtime) {
        return cached.instance;
    }

    // Create new instance
    const ig = ignore();

    // Add default patterns
    // Add default patterns ONLY if no file exists (to bootstrap).
    // If file exists, we rely fully on it (and it should contain defaults if created from template).
    // BUT for backward compatibility, we should probably keep adding them OR 
    // rely on the fact that we just updated the template.

    // DECISION: To allow user to "un-ignore" defaults, we must NOT add them hardcoded if file exists.
    // However, if file exists but is old (doesn't have defaults), this might be a breaking change (suddenly syncing node_modules).
    // SAFE APPROACH: Add them but allow negation? 
    // "bạn vui lòng cho nó hiện lên giúp" implies they want to *see* and *control* them.
    // Optimal: Don't add here. Rely on file.
    // BUT what if file doesn't exist? currentMtime === 0.

    if (currentMtime === 0) {
        ig.add(DEFAULT_PATTERNS);
    } else {
        // File exists, we read it below.
        // Note: If user has an empty file, they lose defaults. This is standard gitignore behavior.
    }

    // Load .ftpignore if exists
    if (currentMtime > 0) {
        try {
            const content = await fs.readFile(ftpignorePath, 'utf-8');
            const lines = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#')); // Remove empty lines and comments
            ig.add(lines);
        } catch (err) {
            console.error(`Failed to load .ftpignore from ${localRoot}:`, err);
        }
    }

    // Cache the instance
    ignoreCache.set(localRoot, { instance: ig, mtime: currentMtime });

    return ig;
}

/**
 * Check if a file path should be ignored.
 * @param localRoot - The root directory being synced
 * @param filePath - The absolute path to the file
 * @returns true if the file should be ignored
 */
export async function shouldIgnore(localRoot: string, filePath: string): Promise<boolean> {
    const ig = await getIgnoreInstance(localRoot);

    // Get relative path from local root
    const relativePath = path.relative(localRoot, filePath);

    // Normalize path separators for cross-platform compatibility
    const normalizedPath = relativePath.split(path.sep).join('/');

    return ig.ignores(normalizedPath);
}

/**
 * Read the content of .ftpignore file
 */
export async function readFtpIgnore(localRoot: string): Promise<string> {
    const ftpignorePath = path.join(localRoot, FTPIGNORE_FILENAME);
    try {
        return await fs.readFile(ftpignorePath, 'utf-8');
    } catch {
        // Return default template if file doesn't exist
        // Return default template if file doesn't exist
        return `# FTP Ignore Patterns
# Similar to .gitignore syntax
# Lines starting with # are comments

# Standard Default Patterns (Always applied unless removed here):
${DEFAULT_PATTERNS.join('\n')}

# Custom patterns:
# *.log
# *.tmp
`;
    }
}

/**
 * Write content to .ftpignore file
 */
export async function writeFtpIgnore(localRoot: string, content: string): Promise<void> {
    const ftpignorePath = path.join(localRoot, FTPIGNORE_FILENAME);
    await fs.writeFile(ftpignorePath, content, 'utf-8');

    // Clear cache to force reload
    ignoreCache.delete(localRoot);
}

/**
 * Clear cached ignore instance for a path (useful when .ftpignore changes)
 */
export function clearIgnoreCache(localRoot: string): void {
    ignoreCache.delete(localRoot);
}

export default {
    getIgnoreInstance,
    shouldIgnore,
    readFtpIgnore,
    writeFtpIgnore,
    clearIgnoreCache,
};
