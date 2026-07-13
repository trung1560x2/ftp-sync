import { Client, ClientChannel } from 'ssh2';
import { getDb } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

export interface QuickConnectConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

interface TerminalSession {
  id: string;
  connectionId: number | null;
  sshClient: Client;
  shellStream: ClientChannel | null;
  connectionName: string;
  createdAt: Date;
  cols: number;
  rows: number;
  quickConfig?: QuickConnectConfig;
  outputBuffer: string;
  onData?: (data: string) => void;
  onClose?: () => void;
  cleanupTimeout?: NodeJS.Timeout | null;
  connectPromise?: Promise<void> | null;
  sshPassword?: string;
}

class SSHTerminalService {
  private sessions: Map<string, TerminalSession> = new Map();
  public onHostKeyVerify: ((sessionId: string, details: { host: string; keyType: string; fingerprint: string; isMismatch: boolean; existingFingerprint?: string }) => void) | null = null;

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Create a new SSH terminal session entry.
   * Does NOT connect yet — call connect() separately to start the shell.
   */
  async createSession(connectionId: number): Promise<{ sessionId: string; connectionName: string }> {
    const db = await getDb();
    const conn = await db.get('SELECT * FROM ftp_connections WHERE id = ?', connectionId);
    if (!conn) throw new Error('Connection not found');

    const sessionId = this.generateId();
    const sshClient = new Client();

    const session: TerminalSession = {
      id: sessionId,
      connectionId,
      sshClient,
      shellStream: null,
      connectionName: conn.name || conn.server,
      createdAt: new Date(),
      cols: 80,
      rows: 24,
      outputBuffer: '',
      cleanupTimeout: null,
    };

    this.sessions.set(sessionId, session);
    return { sessionId, connectionName: session.connectionName };
  }

  /**
   * Create a quick-connect session (no DB entry required).
   * Stores SSH config directly on the session.
   */
  createQuickSession(config: QuickConnectConfig): { sessionId: string; connectionName: string } {
    const sessionId = this.generateId();
    const sshClient = new Client();
    const connectionName = `${config.username}@${config.host}`;

    const session: TerminalSession = {
      id: sessionId,
      connectionId: null,
      sshClient,
      shellStream: null,
      connectionName,
      createdAt: new Date(),
      cols: 80,
      rows: 24,
      quickConfig: config,
      outputBuffer: '',
      cleanupTimeout: null,
    };

    this.sessions.set(sessionId, session);
    return { sessionId, connectionName };
  }

  /**
   * Connect SSH and open an interactive shell with PTY.
   * Shell output is forwarded via onData; onClose fires when the shell ends.
   */
  async connect(
    sessionId: string,
    onData: (data: string) => void,
    onClose: () => void
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.onData = onData;
    session.onClose = onClose;

    // Already connected — just keep the (updated) callbacks
    if (session.shellStream) return;
    // Connect already in flight (e.g. duplicate terminal:open) — await the same attempt
    // instead of calling ssh2 connect() twice on one Client, which resets both
    if (session.connectPromise) return session.connectPromise;

    let host: string, port: number, username: string;
    const connectConfig: any = {
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    };

    if (session.quickConfig) {
      // Quick connect — config stored on session
      host = session.quickConfig.host;
      port = session.quickConfig.port;
      username = session.quickConfig.username;
      if (session.quickConfig.privateKey) {
        connectConfig.privateKey = session.quickConfig.privateKey;
        if (session.quickConfig.password) {
          session.sshPassword = session.quickConfig.password;
        }
      } else if (session.quickConfig.password) {
        connectConfig.password = session.quickConfig.password;
        session.sshPassword = session.quickConfig.password;
      }
    } else {
      // Saved connection — read from DB
      const db = await getDb();
      const conn = await db.get('SELECT * FROM ftp_connections WHERE id = ?', session.connectionId);
      if (!conn) throw new Error('Connection not found');

      host = conn.server;
      port = conn.ssh_port || conn.port || 22;
      username = conn.ssh_username || conn.username || 'root';

      if (conn.ssh_private_key) {
        connectConfig.privateKey = conn.ssh_private_key;
        if (conn.ssh_password_hash) {
          session.sshPassword = decrypt(conn.ssh_password_hash);
        } else if (conn.password_hash) {
          session.sshPassword = decrypt(conn.password_hash);
        }
      } else if (conn.ssh_password_hash) {
        connectConfig.password = decrypt(conn.ssh_password_hash);
        session.sshPassword = connectConfig.password;
      } else if (conn.password_hash) {
        connectConfig.password = decrypt(conn.password_hash);
        session.sshPassword = connectConfig.password;
      }
    }

    connectConfig.host = host;
    connectConfig.port = port;
    connectConfig.username = username;

    const db = await getDb();
    const knownKeys = await db.all('SELECT * FROM known_hosts WHERE host = ?', [host]);

    connectConfig.hostVerifier = (keyBuffer: Buffer) => {
      try {
        const len = keyBuffer.readUInt32BE(0);
        const keyType = keyBuffer.toString('utf8', 4, 4 + len);
        const hash = crypto.createHash('sha256').update(keyBuffer).digest('base64').replace(/=+$/, '');
        const fingerprint = `SHA256:${hash}`;

        if (knownKeys.length === 0) {
          // Unknown host
          this.onHostKeyVerify?.(sessionId, {
            host,
            keyType,
            fingerprint,
            isMismatch: false
          });
          return false;
        }

        const match = knownKeys.find((k) => k.key_type === keyType);
        if (!match) {
          // Known host but new key type
          this.onHostKeyVerify?.(sessionId, {
            host,
            keyType,
            fingerprint,
            isMismatch: false
          });
          return false;
        }

        if (match.fingerprint !== fingerprint) {
          // Mismatch! Key changed
          this.onHostKeyVerify?.(sessionId, {
            host,
            keyType,
            fingerprint,
            isMismatch: true,
            existingFingerprint: match.fingerprint
          });
          return false;
        }

        return true;
      } catch (err) {
        console.error('[SSH Terminal] hostVerifier exception:', err);
        return false;
      }
    };

    const connectAttempt = new Promise<void>((resolve, reject) => {
      session.sshClient.on('ready', () => {
        session.sshClient.shell(
          {
            term: 'xterm-256color',
            cols: session.cols,
            rows: session.rows,
          },
          (err, stream) => {
            if (err) {
              reject(err);
              return;
            }

            session.shellStream = stream;

            stream.on('data', (data: Buffer) => {
              const str = data.toString('utf-8');
              session.outputBuffer = (session.outputBuffer + str).slice(-100000);
              session.onData?.(str);
            });

            stream.stderr.on('data', (data: Buffer) => {
              const str = data.toString('utf-8');
              session.outputBuffer = (session.outputBuffer + str).slice(-100000);
              session.onData?.(str);
            });

            stream.on('close', () => {
              session.onClose?.();
              this.closeSession(sessionId);
            });

            resolve();
          }
        );
      });

      session.sshClient.on('error', (err) => {
        console.error(`[SSH Terminal] Session ${sessionId} error:`, err.message);
        session.onClose?.();
        this.closeSession(sessionId);
        reject(err);
      });

      session.sshClient.on('end', () => {
        session.onClose?.();
        this.closeSession(sessionId);
      });

      session.sshClient.connect(connectConfig);
    });

    session.connectPromise = connectAttempt.finally(() => {
      session.connectPromise = null;
    });
    return session.connectPromise;
  }

  /** Forward keystrokes to the shell */
  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.shellStream) return;
    session.shellStream.write(data);
  }

  /** Resize the PTY window */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session?.shellStream) return;
    session.cols = cols;
    session.rows = rows;
    session.shellStream.setWindow(rows, cols, 0, 0);
  }

  /** Tear down a single session */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      if (session.cleanupTimeout) {
        clearTimeout(session.cleanupTimeout);
      }
      if (session.shellStream) {
        session.shellStream.close();
      }
      session.sshClient.end();
    } catch {
      // Ignore cleanup errors
    }
    this.sessions.delete(sessionId);
    console.log(`[SSH Terminal] Session ${sessionId} closed`);
  }

  /** Whether the session has an active SSH shell (connect() completed) */
  isSessionConnected(sessionId: string): boolean {
    return !!this.sessions.get(sessionId)?.shellStream;
  }

  /** Send keepalive packet and check if session is still alive */
  async ping(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.sshClient) return false;

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 3000);

      if (typeof (session.sshClient as any).requestKeepalive === 'function') {
        (session.sshClient as any).requestKeepalive((err: any) => {
          clearTimeout(timeout);
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } else {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  /** Attach a new client to an existing session, re-sending buffered output */
  attachClient(
    sessionId: string,
    onData: (data: string) => void,
    onClose: () => void
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear any pending cleanup timeout
    if (session.cleanupTimeout) {
      clearTimeout(session.cleanupTimeout);
      session.cleanupTimeout = null;
      console.log(`[SSH Terminal] Cancelled cleanup timeout for session ${sessionId}`);
    }

    session.onData = onData;
    session.onClose = onClose;

    // Send the accumulated output buffer back to the newly attached client
    if (session.outputBuffer) {
      onData(session.outputBuffer);
    }
  }

  /** Detach callbacks from session, allowing it to continue running headless */
  detachClient(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.onData = undefined;
    session.onClose = undefined;
    console.log(`[SSH Terminal] Detached client from session ${sessionId}`);
  }

  /** Schedule a session cleanup timeout */
  scheduleSessionCleanup(sessionId: string, delay: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.cleanupTimeout) {
      clearTimeout(session.cleanupTimeout);
    }

    session.cleanupTimeout = setTimeout(() => {
      console.log(`[SSH Terminal] Inactivity cleanup triggered for session ${sessionId}`);
      this.closeSession(sessionId);
    }, delay);
    console.log(`[SSH Terminal] Scheduled cleanup for session ${sessionId} in ${delay}ms`);
  }

  /** Retrieve the current working directory of the interactive shell session */
  async getCwd(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return new Promise<string>((resolve, reject) => {
      // Robust shell script to query CWD of the user's interactive shell process
      const cmd = `
USER_NAME=\$(whoami 2>/dev/null || echo \$USER)
PIDS=\$(ps -u "\$USER_NAME" -o pid,tty,comm 2>/dev/null | grep -v '?' | grep -E 'bash|zsh|sh|fish|ksh' | awk '{print \$1}')

for pid in \$PIDS; do
  if [ -d "/proc/\$pid" ]; then
    CWD=\$(readlink "/proc/\$pid/cwd" 2>/dev/null)
    if [ -n "\$CWD" ]; then
      echo "\$CWD"
      exit 0
    fi
  fi
  if command -v lsof >/dev/null 2>&1; then
    CWD=\$(lsof -a -p "\$pid" -d cwd -fn 2>/dev/null | awk 'NR==2 {print \$NF}' || lsof -p "\$pid" 2>/dev/null | grep -E '\\bCWD\\b' | awk '{print \$NF}')
    if [ -n "\$CWD" ] && [ -d "\$CWD" ]; then
      echo "\$CWD"
      exit 0
    fi
  fi
done
pwd
`;

      session.sshClient.exec(cmd, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString('utf-8');
        });

        stream.stderr.on('data', () => {
          // Ignore stderr
        });

        stream.on('close', () => {
          resolve(output.trim() || '/');
        });
      });
    });
  }

  /** Recursively upload files/folders via SFTP on the session's SSH client */
  async uploadFiles(
    sessionId: string,
    localPaths: string[],
    remoteDir: string,
    onProgress: (fileName: string, transferredBytes: number, totalBytes: number) => void
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return new Promise<void>((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        const uploadQueue: { local: string; remote: string; isDir: boolean }[] = [];

        const buildQueue = async (localPath: string, remotePath: string) => {
          const stats = await fs.stat(localPath);
          if (stats.isDirectory()) {
            uploadQueue.push({ local: localPath, remote: remotePath, isDir: true });
            const entries = await fs.readdir(localPath);
            for (const entry of entries) {
              await buildQueue(
                path.join(localPath, entry),
                path.posix.join(remotePath, entry)
              );
            }
          } else {
            uploadQueue.push({ local: localPath, remote: remotePath, isDir: false });
          }
        };

        const executeUpload = async () => {
          try {
            for (const item of uploadQueue) {
              if (item.isDir) {
                await new Promise<void>((resDir) => {
                  sftp.mkdir(item.remote, () => {
                    // Ignore directory already exists errors
                    resDir();
                  });
                });
              } else {
                const stats = await fs.stat(item.local);
                const fileSize = stats.size;
                await new Promise<void>((resFile, rejFile) => {
                  sftp.fastPut(
                    item.local,
                    item.remote,
                    {
                      concurrency: 4,
                      chunkSize: 32768,
                      step: (transferred) => {
                        onProgress(path.basename(item.local), transferred, fileSize);
                      },
                    },
                    (errPut) => {
                      if (errPut) {
                        rejFile(errPut);
                      } else {
                        onProgress(path.basename(item.local), fileSize, fileSize);
                        resFile();
                      }
                    }
                  );
                });
              }
            }
            sftp.end();
            resolve();
          } catch (uploadErr) {
            sftp.end();
            reject(uploadErr);
          }
        };

        Promise.all(
          localPaths.map((lp) =>
            buildQueue(lp, path.posix.join(remoteDir, path.basename(lp)))
          )
        )
          .then(executeUpload)
          .catch((qErr) => {
            sftp.end();
            reject(qErr);
          });
      });
    });
  }

  /** Read remote file contents via SFTP (or sudo if specified) */
  async getFile(sessionId: string, remotePath: string, useSudo: boolean = false): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (useSudo) {
      return this.getFileWithSudo(session, remotePath);
    }

    return new Promise<string>((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.readFile(remotePath, (errRead, data) => {
          sftp.end();
          if (errRead) {
            reject(errRead);
          } else {
            resolve(data.toString('utf-8'));
          }
        });
      });
    });
  }

  /** Read remote file content with root privileges via sudo -S */
  private async getFileWithSudo(session: TerminalSession, remotePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const cmd = `sudo -S -p "" cat "${remotePath.replace(/"/g, '\\"')}"`;
      session.sshClient.exec(cmd, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let exitCode = 0;
        let stdout = '';
        let stderr = '';

        stream.on('exit', (code) => {
          exitCode = code;
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8');
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });

        stream.on('close', () => {
          if (exitCode !== 0) {
            reject(new Error(stderr.trim() || `Command failed with code ${exitCode}`));
          } else {
            resolve(stdout);
          }
        });

        if (session.sshPassword) {
          stream.write(session.sshPassword + '\n');
        }
        stream.end();
      });
    });
  }

  /** Download remote file as raw Buffer (binary-safe) via SFTP */
  async downloadFile(sessionId: string, remotePath: string): Promise<{ buffer: Buffer; size: number }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.stat(remotePath, (errStat, stats) => {
          if (errStat) {
            sftp.end();
            reject(new Error(`File not found: ${remotePath}`));
            return;
          }

          if (!stats.isFile()) {
            sftp.end();
            reject(new Error(`Not a file: ${remotePath}`));
            return;
          }

          sftp.readFile(remotePath, (errRead, data) => {
            sftp.end();
            if (errRead) {
              reject(errRead);
            } else {
              resolve({ buffer: data, size: stats.size });
            }
          });
        });
      });
    });
  }

  /** Write remote file contents via SFTP (or sudo if specified) */
  async saveFile(sessionId: string, remotePath: string, content: string, useSudo: boolean = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (useSudo) {
      return this.saveFileWithSudo(session, remotePath, content);
    }

    return new Promise<void>((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.writeFile(remotePath, content, 'utf-8', (errWrite) => {
          sftp.end();
          if (errWrite) {
            reject(errWrite);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /** Save file with root privileges by writing to temp location first and copying via sudo cp */
  private async saveFileWithSudo(session: TerminalSession, remotePath: string, content: string): Promise<void> {
    const tempPath = `/tmp/ftp-sync-temp-${crypto.randomBytes(8).toString('hex')}`;

    // 1. Write the content to the temp path via standard SFTP
    await new Promise<void>((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.writeFile(tempPath, content, 'utf-8', (errWrite) => {
          sftp.end();
          if (errWrite) {
            reject(errWrite);
          } else {
            resolve();
          }
        });
      });
    });

    // 2. Copy temp file to destination path using sudo cp, and remove temp file
    return new Promise<void>((resolve, reject) => {
      const escapedDest = remotePath.replace(/"/g, '\\"');
      const cmd = `sudo -S -p "" cp "${tempPath}" "${escapedDest}" && rm -f "${tempPath}"`;
      session.sshClient.exec(cmd, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let exitCode = 0;
        let stderr = '';

        stream.on('exit', (code) => {
          exitCode = code;
        });

        // Resume/consume stdout so close event triggers properly
        stream.resume();

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });

        stream.on('close', () => {
          if (exitCode !== 0) {
            // Clean up temp file asynchronously on failure
            session.sshClient.exec(`rm -f "${tempPath}"`, () => {});
            reject(new Error(stderr.trim() || `Command failed with code ${exitCode}`));
          } else {
            resolve();
          }
        });

        if (session.sshPassword) {
          stream.write(session.sshPassword + '\n');
        }
        stream.end();
      });
    });
  }

  private async execSudoCommand(session: TerminalSession, cmd: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      session.sshClient.exec(cmd, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let exitCode = 0;
        let stderr = '';

        stream.on('exit', (code) => {
          exitCode = code;
        });

        stream.resume();

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });

        stream.on('close', () => {
          if (exitCode !== 0) {
            reject(new Error(stderr.trim() || `Command failed with code ${exitCode}`));
          } else {
            resolve();
          }
        });

        if (session.sshPassword) {
          stream.write(session.sshPassword + '\n');
        }
        stream.end();
      });
    });
  }

  /** List all active sessions (safe projection, no internals) */
  listSessions(): { id: string; connectionId: number | null; connectionName: string; createdAt: Date }[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      connectionId: s.connectionId,
      connectionName: s.connectionName,
      createdAt: s.createdAt,
    }));
  }

  /** Close every session — call on process shutdown */
  closeAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }
  /** List remote directory contents via SFTP */
  async listDir(sessionId: string, remotePath: string): Promise<{
    name: string;
    isDirectory: boolean;
    size: number;
    modifiedAt: string;
    permissions: string;
  }[]> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.readdir(remotePath, (errDir, list) => {
          sftp.end();
          if (errDir) { reject(errDir); return; }

          const items = (list || []).map((entry) => {
            const attrs = entry.attrs;
            const isDir = (attrs.mode & 0o40000) !== 0;
            // Build permission string (e.g., rwxr-xr-x)
            const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
            const mode = attrs.mode & 0o777;
            const permStr = perms[(mode >> 6) & 7] + perms[(mode >> 3) & 7] + perms[mode & 7];

            return {
              name: entry.filename,
              isDirectory: isDir,
              size: attrs.size || 0,
              modifiedAt: new Date((attrs.mtime || 0) * 1000).toISOString(),
              permissions: (isDir ? 'd' : '-') + permStr,
            };
          });

          // Sort: directories first, then alphabetically
          items.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          resolve(items);
        });
      });
    });
  }

  /** Stat a remote path via SFTP */
  async statPath(sessionId: string, remotePath: string): Promise<{
    isDirectory: boolean;
    isFile: boolean;
    size: number;
    modifiedAt: string;
    permissions: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.stat(remotePath, (errStat, stats) => {
          sftp.end();
          if (errStat) { reject(errStat); return; }

          const isDir = stats.isDirectory();
          const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
          const mode = (stats.mode || 0) & 0o777;
          const permStr = perms[(mode >> 6) & 7] + perms[(mode >> 3) & 7] + perms[mode & 7];

          resolve({
            isDirectory: isDir,
            isFile: stats.isFile(),
            size: stats.size || 0,
            modifiedAt: new Date((stats.mtime || 0) * 1000).toISOString(),
            permissions: (isDir ? 'd' : '-') + permStr,
          });
        });
      });
    });
  }

  /** Create remote directory via SFTP */
  async mkdirRemote(sessionId: string, remotePath: string, useSudo: boolean = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (useSudo) {
      const cmd = `sudo -S -p "" mkdir -p "${remotePath.replace(/"/g, '\\"')}"`;
      return this.execSudoCommand(session, cmd);
    }

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.mkdir(remotePath, async (errMk) => {
          sftp.end();
          if (errMk) {
            if (session.sshPassword) {
              try {
                const cmd = `sudo -S -p "" mkdir -p "${remotePath.replace(/"/g, '\\"')}"`;
                await this.execSudoCommand(session, cmd);
                resolve();
                return;
              } catch {
                reject(errMk);
                return;
              }
            }
            reject(errMk);
          }
          else resolve();
        });
      });
    });
  }

  /** Remove remote empty directory via SFTP */
  async rmdirRemote(sessionId: string, remotePath: string, useSudo: boolean = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (useSudo) {
      const cmd = `sudo -S -p "" rm -rf "${remotePath.replace(/"/g, '\\"')}"`;
      return this.execSudoCommand(session, cmd);
    }

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.rmdir(remotePath, async (errRm) => {
          sftp.end();
          if (errRm) {
            if (session.sshPassword) {
              try {
                const cmd = `sudo -S -p "" rm -rf "${remotePath.replace(/"/g, '\\"')}"`;
                await this.execSudoCommand(session, cmd);
                resolve();
                return;
              } catch {
                reject(errRm);
                return;
              }
            }
            reject(errRm);
          }
          else resolve();
        });
      });
    });
  }

  /** Delete remote file via SFTP */
  async rmFile(sessionId: string, remotePath: string, useSudo: boolean = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (useSudo) {
      const cmd = `sudo -S -p "" rm -f "${remotePath.replace(/"/g, '\\"')}"`;
      return this.execSudoCommand(session, cmd);
    }

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.unlink(remotePath, async (errDel) => {
          sftp.end();
          if (errDel) {
            if (session.sshPassword) {
              try {
                const cmd = `sudo -S -p "" rm -f "${remotePath.replace(/"/g, '\\"')}"`;
                await this.execSudoCommand(session, cmd);
                resolve();
                return;
              } catch {
                reject(errDel);
                return;
              }
            }
            reject(errDel);
          }
          else resolve();
        });
      });
    });
  }

  /** Rename/move remote file or directory via SFTP */
  async renamePath(sessionId: string, oldPath: string, newPath: string, useSudo: boolean = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (useSudo) {
      const cmd = `sudo -S -p "" mv "${oldPath.replace(/"/g, '\\"')}" "${newPath.replace(/"/g, '\\"')}"`;
      return this.execSudoCommand(session, cmd);
    }

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.rename(oldPath, newPath, async (errRen) => {
          sftp.end();
          if (errRen) {
            if (session.sshPassword) {
              try {
                const cmd = `sudo -S -p "" mv "${oldPath.replace(/"/g, '\\"')}" "${newPath.replace(/"/g, '\\"')}"`;
                await this.execSudoCommand(session, cmd);
                resolve();
                return;
              } catch {
                reject(errRen);
                return;
              }
            }
            reject(errRen);
          }
          else resolve();
        });
      });
    });
  }

  /** Execute arbitrary command on remote and return stdout */
  async execCommand(sessionId: string, cmd: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return new Promise<string>((resolve, reject) => {
      session.sshClient.exec(cmd, (err, stream) => {
        if (err) { reject(err); return; }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        stream.on('exit', (code) => {
          exitCode = code || 0;
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8');
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });

        stream.on('close', () => {
          if (exitCode !== 0) {
            reject(new Error(stderr.trim() || `Command failed with code ${exitCode}`));
          } else {
            resolve(stdout);
          }
        });
      });
    });
  }

  /** Change remote permissions (CHMOD) via SFTP */
  async chmodRemote(sessionId: string, remotePath: string, mode: number, recursive: boolean = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (recursive) {
      const octalStr = mode.toString(8);
      const cmd = `chmod -R ${octalStr} "${remotePath.replace(/"/g, '\\"')}"`;
      await this.execCommand(sessionId, cmd);
      return;
    }

    return new Promise((resolve, reject) => {
      session.sshClient.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        sftp.chmod(remotePath, mode, (errChmod) => {
          sftp.end();
          if (errChmod) reject(errChmod);
          else resolve();
        });
      });
    });
  }

  /** Recursively calculate directory size & file count */
  async getRemoteDirSize(sessionId: string, remotePath: string): Promise<{ size: number; count: number }> {
    // Try du -sb first
    try {
      const output = await this.execCommand(sessionId, `du -sb "${remotePath.replace(/"/g, '\\"')}"`);
      const match = output.trim().match(/^(\d+)\s+/);
      if (match) {
        const size = parseInt(match[1], 10);
        let count = 0;
        try {
          const countOutput = await this.execCommand(sessionId, `find "${remotePath.replace(/"/g, '\\"')}" -type f | wc -l`);
          count = parseInt(countOutput.trim(), 10) || 0;
        } catch {
          // ignore error
        }
        return { size, count };
      }
    } catch {
      // du -sb failed
    }

    return this.getRemoteDirSizeSftp(sessionId, remotePath);
  }

  /** Fallback recursive directory size calculation via SFTP */
  private async getRemoteDirSizeSftp(sessionId: string, remotePath: string): Promise<{ size: number; count: number }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    let size = 0;
    let count = 0;

    const traverse = async (dir: string, sftp: any): Promise<void> => {
      return new Promise((resolve, reject) => {
        sftp.readdir(dir, async (err: any, list: any[]) => {
          if (err) { reject(err); return; }
          const promises = (list || []).map(async (entry) => {
            const entryPath = dir.endsWith('/') ? dir + entry.filename : dir + '/' + entry.filename;
            const isDir = (entry.attrs.mode & 0o40000) !== 0;
            if (isDir) {
              if (entry.filename !== '.' && entry.filename !== '..') {
                await traverse(entryPath, sftp);
              }
            } else {
              size += entry.attrs.size || 0;
              count++;
            }
          });
          try {
            await Promise.all(promises);
            resolve();
          } catch (traverseErr) {
            reject(traverseErr);
          }
        });
      });
    };

    return new Promise((resolve, reject) => {
      session.sshClient.sftp(async (err, sftp) => {
        if (err) { reject(err); return; }
        sftp.stat(remotePath, async (errStat: any, stats: any) => {
          if (errStat) {
            sftp.end();
            reject(errStat);
            return;
          }
          const isDir = (stats.mode & 0o40000) !== 0;
          if (!isDir) {
            sftp.end();
            resolve({ size: stats.size || 0, count: 1 });
            return;
          }
          try {
            await traverse(remotePath, sftp);
            sftp.end();
            resolve({ size, count });
          } catch (traverseErr) {
            sftp.end();
            reject(traverseErr);
          }
        });
      });
    });
  }
}

export const sshTerminalService = new SSHTerminalService();
export default sshTerminalService;
