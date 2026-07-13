import net from 'net';
import ssh2 from 'ssh2';
import { getDb } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import { sshKeyService } from './SSHKeyService.js';

export interface PortForward {
  id: number;
  connectionId: number;
  type: 'local' | 'remote' | 'dynamic';
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  description: string;
  autoStart: boolean;
  status: 'active' | 'connecting' | 'disconnected' | 'error';
  errorMessage?: string;
}

interface ActiveTunnel {
  id: number;
  sshClient: ssh2.Client;
  localServer?: net.Server;
  remotePort?: number;
  reconnectTimer?: NodeJS.Timeout;
}

class PortForwardService {
  private activeTunnels = new Map<number, ActiveTunnel>();
  private statuses = new Map<number, PortForward['status']>();
  private errorMessages = new Map<number, string>();

  /** Initialize and auto-start tunnels on app startup */
  async init(): Promise<void> {
    const db = await getDb();
    const forwards = await db.all('SELECT * FROM port_forwards WHERE auto_start = 1');
    for (const f of forwards) {
      this.startTunnel(f.id).catch(err => {
        console.error(`Failed to auto-start port forward ${f.id}:`, err.message);
      });
    }
  }

  /** Get all configured port forwards with live status */
  async getAllForwards(): Promise<PortForward[]> {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM port_forwards ORDER BY id DESC');
    return rows.map(r => ({
      id: r.id,
      connectionId: r.connection_id,
      type: r.type as any,
      localHost: r.local_host || '127.0.0.1',
      localPort: r.local_port,
      remoteHost: r.remote_host || '127.0.0.1',
      remotePort: r.remote_port,
      description: r.description || '',
      autoStart: !!r.auto_start,
      status: this.statuses.get(r.id) || 'disconnected',
      errorMessage: this.errorMessages.get(r.id)
    }));
  }

  /** Get a single port forward by ID */
  async getForwardById(id: number): Promise<PortForward | null> {
    const db = await getDb();
    const r = await db.get('SELECT * FROM port_forwards WHERE id = ?', id);
    if (!r) return null;
    return {
      id: r.id,
      connectionId: r.connection_id,
      type: r.type as any,
      localHost: r.local_host || '127.0.0.1',
      localPort: r.local_port,
      remoteHost: r.remote_host || '127.0.0.1',
      remotePort: r.remote_port,
      description: r.description || '',
      autoStart: !!r.auto_start,
      status: this.statuses.get(r.id) || 'disconnected',
      errorMessage: this.errorMessages.get(r.id)
    };
  }

  /** Create a new port forward */
  async createForward(data: Omit<PortForward, 'id' | 'status'>): Promise<number> {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO port_forwards (connection_id, type, local_host, local_port, remote_host, remote_port, description, auto_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      data.connectionId,
      data.type,
      data.localHost,
      data.localPort,
      data.remoteHost,
      data.remotePort,
      data.description,
      data.autoStart ? 1 : 0
    );
    return result.lastID!;
  }

  /** Update an existing port forward configuration */
  async updateForward(id: number, data: Partial<Omit<PortForward, 'id' | 'status'>>): Promise<void> {
    const db = await getDb();
    const existing = await this.getForwardById(id);
    if (!existing) throw new Error('Port forward not found');

    const type = data.type ?? existing.type;
    const localHost = data.localHost ?? existing.localHost;
    const localPort = data.localPort ?? existing.localPort;
    const remoteHost = data.remoteHost ?? existing.remoteHost;
    const remotePort = data.remotePort ?? existing.remotePort;
    const description = data.description ?? existing.description;
    const autoStart = data.autoStart !== undefined ? (data.autoStart ? 1 : 0) : (existing.autoStart ? 1 : 0);

    await db.run(
      'UPDATE port_forwards SET type = ?, local_host = ?, local_port = ?, remote_host = ?, remote_port = ?, description = ?, auto_start = ? WHERE id = ?',
      type,
      localHost,
      localPort,
      remoteHost,
      remotePort,
      description,
      autoStart,
      id
    );

    // If active, stop and restart the tunnel to apply changes
    if (this.statuses.get(id) === 'active') {
      await this.stopTunnel(id);
      await this.startTunnel(id);
    }
  }

  /** Delete a port forward */
  async deleteForward(id: number): Promise<void> {
    await this.stopTunnel(id);
    const db = await getDb();
    await db.run('DELETE FROM port_forwards WHERE id = ?', id);
  }

  /** Start a port forward tunnel */
  async startTunnel(id: number): Promise<void> {
    if (this.activeTunnels.has(id)) return;

    const db = await getDb();
    const forward = await db.get('SELECT * FROM port_forwards WHERE id = ?', id);
    if (!forward) throw new Error('Port forward config not found');

    // Fetch Connection Settings
    const conn = await db.get('SELECT * FROM ftp_connections WHERE id = ?', forward.connection_id);
    if (!conn) throw new Error('Connection settings not found');

    this.statuses.set(id, 'connecting');
    this.errorMessages.delete(id);

    const client = new ssh2.Client();
    const activeTunnel: ActiveTunnel = { id, sshClient: client };
    this.activeTunnels.set(id, activeTunnel);

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        try {
          if (forward.type === 'local') {
            this.setupLocalForward(forward, activeTunnel);
          } else if (forward.type === 'remote') {
            this.setupRemoteForward(forward, activeTunnel);
          } else if (forward.type === 'dynamic') {
            this.setupDynamicForward(forward, activeTunnel);
          }
          this.statuses.set(id, 'active');
          resolve();
        } catch (err: any) {
          this.handleTunnelError(id, err);
          reject(err);
        }
      });

      client.on('error', (err) => {
        this.handleTunnelError(id, err);
        reject(err);
      });

      client.on('close', () => {
        if (this.statuses.get(id) === 'active') {
          this.statuses.set(id, 'disconnected');
          this.activeTunnels.delete(id);
          this.scheduleReconnect(id);
        }
      });

      // Establish Connection
      this.getSSHConnectionConfig(conn).then((config) => {
        client.connect(config);
      }).catch(err => {
        this.handleTunnelError(id, err);
        reject(err);
      });
    });
  }

  /** Stop an active port forward tunnel */
  async stopTunnel(id: number): Promise<void> {
    const tunnel = this.activeTunnels.get(id);
    this.statuses.set(id, 'disconnected');
    this.errorMessages.delete(id);
    
    if (tunnel) {
      if (tunnel.reconnectTimer) clearTimeout(tunnel.reconnectTimer);
      if (tunnel.localServer) tunnel.localServer.close();
      tunnel.sshClient.end();
      this.activeTunnels.delete(id);
    }
  }

  private async getSSHConnectionConfig(conn: any): Promise<ssh2.ConnectConfig> {
    const config: ssh2.ConnectConfig = {
      host: conn.server,
      port: conn.port || 22,
      username: conn.username,
      readyTimeout: 15000
    };

    if (conn.ssh_key_id) {
      const managedKey = await sshKeyService.getKeyById(conn.ssh_key_id);
      if (managedKey) {
        config.privateKey = managedKey.privateKey;
      }
    } else if (conn.private_key) {
      config.privateKey = decrypt(conn.private_key);
    }

    if (conn.password) {
      config.password = decrypt(conn.password);
    }

    return config;
  }

  private setupLocalForward(forward: any, tunnel: ActiveTunnel) {
    const server = net.createServer((socket) => {
      tunnel.sshClient.forwardOut(
        '127.0.0.1',
        0,
        forward.remote_host || '127.0.0.1',
        forward.remote_port,
        (err, stream) => {
          if (err) {
            socket.end();
            return;
          }
          socket.pipe(stream).pipe(socket);
        }
      );
    });

    server.on('error', (err) => {
      this.handleTunnelError(forward.id, err);
    });

    server.listen(forward.local_port, forward.local_host || '127.0.0.1');
    tunnel.localServer = server;
  }

  private setupRemoteForward(forward: any, tunnel: ActiveTunnel) {
    tunnel.sshClient.forwardIn(forward.remote_host || '127.0.0.1', forward.remote_port, (err: any) => {
      if (err) {
        this.handleTunnelError(forward.id, err);
      }
    });

    tunnel.remotePort = forward.remote_port;

    tunnel.sshClient.on('tcp connection', (info, accept, reject) => {
      if (info.destPort === forward.remote_port) {
        const stream = accept();
        const localSocket = net.connect(
          {
            host: forward.local_host || '127.0.0.1',
            port: forward.local_port
          },
          () => {
            localSocket.pipe(stream).pipe(localSocket);
          }
        );

        localSocket.on('error', () => {
          stream.end();
        });
        stream.on('error', () => {
          localSocket.end();
        });
      } else {
        reject();
      }
    });
  }

  private setupDynamicForward(forward: any, tunnel: ActiveTunnel) {
    const server = net.createServer((socket) => {
      let stage = 0;
      socket.on('data', (chunk) => {
        try {
          if (stage === 0) {
            if (chunk[0] !== 0x05) {
              socket.end();
              return;
            }
            // SOCKS5 Handshake Success (No Auth)
            socket.write(Buffer.from([0x05, 0x00]));
            stage = 1;
          } else if (stage === 1) {
            if (chunk[0] !== 0x05 || chunk[1] !== 0x01) {
              // Connect command required
              socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
              socket.end();
              return;
            }

            let offset = 4;
            let host = '';
            const addressType = chunk[3];
            if (addressType === 0x01) {
              host = `${chunk[4]}.${chunk[5]}.${chunk[6]}.${chunk[7]}`;
              offset += 4;
            } else if (addressType === 0x03) {
              const len = chunk[4];
              host = chunk.toString('utf8', 5, 5 + len);
              offset += 1 + len;
            } else {
              socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
              socket.end();
              return;
            }

            const port = chunk.readUInt16BE(offset);

            tunnel.sshClient.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
              if (err) {
                socket.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
                socket.end();
                return;
              }
              socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
              socket.removeAllListeners('data');
              socket.pipe(stream).pipe(socket);
            });
          }
        } catch {
          socket.end();
        }
      });

      socket.on('error', () => socket.end());
    });

    server.on('error', (err) => {
      this.handleTunnelError(forward.id, err);
    });

    server.listen(forward.local_port, forward.local_host || '127.0.0.1');
    tunnel.localServer = server;
  }

  private handleTunnelError(id: number, err: Error) {
    console.error(`Tunnel ${id} error:`, err.message);
    this.statuses.set(id, 'error');
    this.errorMessages.set(id, err.message);
    
    const tunnel = this.activeTunnels.get(id);
    if (tunnel) {
      if (tunnel.localServer) tunnel.localServer.close();
      tunnel.sshClient.end();
      this.activeTunnels.delete(id);
    }

    this.scheduleReconnect(id);
  }

  private scheduleReconnect(id: number) {
    const tunnel = this.activeTunnels.get(id);
    if (tunnel?.reconnectTimer) clearTimeout(tunnel.reconnectTimer);

    const timer = setTimeout(() => {
      console.log(`Attempting reconnect for tunnel ${id}...`);
      this.startTunnel(id).catch(() => {});
    }, 10000); // Reconnect after 10s

    this.activeTunnels.set(id, {
      id,
      sshClient: new ssh2.Client(),
      reconnectTimer: timer
    });
  }
}

export const portForwardService = new PortForwardService();
export default portForwardService;
