import { TransferClient } from './TransferClient.js';
import { TransferClientFactory } from './TransferClientFactory.js';
import { decrypt } from '../../utils/encryption.js';

export class ConnectionPool {
  private pool: TransferClient[] = [];
  private available: { client: TransferClient; lastUsed: number }[] = [];
  private size: number;
  private config: any;
  private connectionId: number;
  private log: (type: 'info' | 'error' | 'success', message: string) => void;

  constructor(
    connectionId: number,
    config: any,
    size: number,
    log: (type: 'info' | 'error' | 'success', message: string) => void
  ) {
    this.connectionId = connectionId;
    this.config = config;
    this.size = size;
    this.log = log;
  }

  public getPool() {
    return this.pool;
  }

  public getAvailable() {
    return this.available;
  }

  public async acquire(): Promise<TransferClient> {
    // Check available pool clients
    while (this.available.length > 0) {
      const entry = this.available.shift()!;
      const client = entry.client;
      const lastUsed = entry.lastUsed;
      const idleSeconds = (Date.now() - lastUsed) / 1000;

      // If used within last 30s, assume still alive
      if (idleSeconds < 30) {
        if (!client.closed) return client;
        try { client.close(); } catch { }
        this.remove(client);
        continue;
      }

      // Idle > 30s: verify still alive
      try {
        if (await client.checkConnection()) return client;
      } catch { }

      try { client.close(); } catch { }
      this.remove(client);
    }

    // Need to create a new connection
    if (this.pool.length >= this.size) {
      // Pool full - wait and retry
      await new Promise(r => setTimeout(r, 50));
      return this.acquire();
    }

    const protocol = this.config.protocol || 'ftp';
    const client = TransferClientFactory.createClient(protocol, 60000);

    const password = decrypt(this.config.password_hash);
    if (!password) throw new Error('Cannot decrypt password');

    // Jitter to avoid thundering herd
    await new Promise(r => setTimeout(r, Math.random() * 100));

    await client.connect({
      host: this.config.server,
      username: this.config.username,
      password: password,
      port: this.config.port || (this.config.protocol === 'sftp' ? 22 : 21),
      secure: this.config.secure ? true : false,
      secureOptions: this.config.secure ? {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      } : undefined,
      privateKey: this.config.private_key
    });

    this.pool.push(client);
    return client;
  }

  public release(client: TransferClient) {
    if (client && !client.closed) {
      this.available.push({ client, lastUsed: Date.now() });
    }
  }

  public remove(client: TransferClient) {
    const index = this.pool.indexOf(client);
    if (index !== -1) {
      this.pool.splice(index, 1);
    }
    this.available = this.available.filter(entry => entry.client !== client);
  }

  public async destroyAll(): Promise<void> {
    for (const client of this.pool) {
      try {
        if (!client.closed) client.close();
      } catch { }
    }
    this.pool = [];
    this.available = [];
  }

  public async warm(): Promise<void> {
    const warmCount = Math.min(this.size, 5);
    this.log('info', `Pre-warming ${warmCount} connections...`);
    const warmTasks = Array.from({ length: warmCount }, async (_, i) => {
      try {
        await new Promise(r => setTimeout(r, i * 80));
        const client = await this.acquire();
        this.release(client);
      } catch (e: any) {
        this.log('error', `Pool warm-up failed for slot ${i}: ${e.message}`);
      }
    });
    await Promise.all(warmTasks);
    this.log('info', `Connection pool ready (${this.available.length} connections)`);
  }
}
