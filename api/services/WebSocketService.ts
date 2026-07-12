import { WebSocketServer, WebSocket } from 'ws';
import syncManager from './SyncService.js';
import sshTerminalService from './SSHTerminalService.js';

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, number> = new Map(); // ws client -> connectionId for sync progress
  private terminalSessions: Map<WebSocket, string[]> = new Map(); // ws client -> sessionIds owned by this client

  public init(server: any) {
    console.log('[WS] Initializing WebSocket Server...');
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP Upgrade request manually to serve under /api/ws
    server.on('upgrade', (request: any, socket: any, head: any) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

      if (pathname === '/api/ws') {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      } else {
        // Do not handle other upgrade paths (e.g. Vite HMR which runs outside this express app or other resources)
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WS] New client connected');

      ws.on('message', (message: Buffer | string) => {
        try {
          const str = message.toString();

          // Fast-path: terminal keystroke data uses prefix protocol
          // Format: "D:<sessionId>:<data>"  (no JSON overhead)
          if (str.charCodeAt(0) === 68 /* 'D' */ && str.charCodeAt(1) === 58 /* ':' */) {
            const secondColon = str.indexOf(':', 2);
            if (secondColon !== -1) {
              const sessionId = str.substring(2, secondColon);
              const input = str.substring(secondColon + 1);
              if (sessionId && input) {
                sshTerminalService.write(sessionId, input);
              }
            }
            return;
          }

          const data = JSON.parse(str);
          this.handleMessage(ws, data);
        } catch (e: any) {
          console.error('[WS] Error processing client message:', e.message);
        }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.cleanupClient(ws);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client socket error:', err.message);
        this.cleanupClient(ws);
      });
    });

    // Listen to progress events from syncManager and broadcast to subscribed clients
    syncManager.on('progress', (connectionId: number, progress: any) => {
      this.broadcast(connectionId, { type: 'progress', connectionId, data: progress });
    });
  }

  private handleMessage(ws: WebSocket, data: any) {
    switch (data.type) {
      // --- Sync progress subscription (existing) ---
      case 'subscribe':
        if (typeof data.connectionId === 'number') {
          const connId = data.connectionId;
          this.clients.set(ws, connId);
          console.log(`[WS] Client subscribed to progress updates for connection ${connId}`);

          const progress = syncManager.getProgress(connId);
          if (progress) {
            ws.send(JSON.stringify({ type: 'progress', connectionId: connId, data: progress }));
          }
        }
        break;

      // --- Terminal messages ---
      case 'terminal:open':
        this.handleTerminalOpen(ws, data);
        break;
      case 'terminal:data':
        this.handleTerminalData(ws, data);
        break;
      case 'terminal:resize':
        this.handleTerminalResize(ws, data);
        break;
      case 'terminal:close':
        this.handleTerminalClose(ws, data);
        break;
    }
  }

  // Open a new SSH terminal session, connect, and start streaming
  private async handleTerminalOpen(ws: WebSocket, data: any) {
    const { connectionId, sessionId: existingSessionId } = data;

    try {
      let sessionId: string;
      let connectionName: string;

      if (existingSessionId) {
        // Check if session already exists and is active in sshTerminalService
        const activeSessions = sshTerminalService.listSessions();
        const isAlreadyActive = activeSessions.some(s => s.id === existingSessionId);

        if (isAlreadyActive) {
          sessionId = existingSessionId;
          connectionName = '';

          // Track ownership so we can cleanup on disconnect
          const owned = this.terminalSessions.get(ws) || [];
          if (!owned.includes(sessionId)) {
            owned.push(sessionId);
            this.terminalSessions.set(ws, owned);
          }

          // Sessions created via REST (POST /api/terminal/sessions) exist in the
          // service but have no SSH shell yet — establish it on first open.
          if (!sshTerminalService.isSessionConnected(sessionId)) {
            await sshTerminalService.connect(
              sessionId,
              (shellData: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                  // Fast-path: prefix protocol for shell output
                  ws.send(`O:${sessionId}:${shellData}`);
                }
              },
              () => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'terminal:closed', sessionId }));
                }
                const sessions = this.terminalSessions.get(ws);
                if (sessions) {
                  const idx = sessions.indexOf(sessionId);
                  if (idx !== -1) sessions.splice(idx, 1);
                }
              }
            );
            ws.send(JSON.stringify({ type: 'terminal:connected', sessionId, connectionName: '' }));
            return;
          }

          sshTerminalService.attachClient(
            sessionId,
            (shellData: string) => {
              if (ws.readyState === WebSocket.OPEN) {
                // Fast-path: prefix protocol for shell output
                ws.send(`O:${sessionId}:${shellData}`);
              }
            },
            () => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal:closed', sessionId }));
              }
              // Remove from ownership tracking
              const sessions = this.terminalSessions.get(ws);
              if (sessions) {
                const idx = sessions.indexOf(sessionId);
                if (idx !== -1) sessions.splice(idx, 1);
              }
            }
          );

          // Notify frontend that connection is ready
          ws.send(JSON.stringify({ type: 'terminal:connected', sessionId, connectionName: '' }));
          return;
        } else {
          // Session is no longer active (timed out / server restarted)
          ws.send(JSON.stringify({ type: 'terminal:error', sessionId: existingSessionId, error: 'Session expired' }));
          return;
        }
      } else {
        // Create session on-the-fly via WebSocket
        if (typeof connectionId !== 'number') {
          ws.send(JSON.stringify({ type: 'terminal:error', error: 'connectionId is required' }));
          return;
        }
        const result = await sshTerminalService.createSession(connectionId);
        sessionId = result.sessionId;
        connectionName = result.connectionName;
      }

      // Track ownership so we can cleanup on disconnect
      const owned = this.terminalSessions.get(ws) || [];
      owned.push(sessionId);
      this.terminalSessions.set(ws, owned);

      // Connect SSH and start streaming shell output
      await sshTerminalService.connect(
        sessionId,
        (shellData: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            // Fast-path: prefix protocol for shell output
            ws.send(`O:${sessionId}:${shellData}`);
          }
        },
        () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'terminal:closed', sessionId }));
          }
          // Remove from ownership tracking
          const sessions = this.terminalSessions.get(ws);
          if (sessions) {
            const idx = sessions.indexOf(sessionId);
            if (idx !== -1) sessions.splice(idx, 1);
          }
        }
      );

      // Notify frontend that connection is ready
      ws.send(JSON.stringify({ type: 'terminal:connected', sessionId, connectionName }));
    } catch (err: any) {
      console.error('[WS] Terminal open error:', err.message);
      ws.send(JSON.stringify({ type: 'terminal:error', sessionId: data.sessionId, error: err.message }));
    }
  }

  // Forward keystrokes from the client to the SSH shell
  private handleTerminalData(_ws: WebSocket, data: any) {
    const { sessionId, data: input } = data;
    if (sessionId && input) {
      sshTerminalService.write(sessionId, input);
    }
  }

  // Resize the PTY to match client terminal dimensions
  private handleTerminalResize(_ws: WebSocket, data: any) {
    const { sessionId, cols, rows } = data;
    if (sessionId && cols && rows) {
      sshTerminalService.resize(sessionId, cols, rows);
    }
  }

  // Explicitly close a terminal session
  private handleTerminalClose(ws: WebSocket, data: any) {
    const { sessionId } = data;
    if (!sessionId) return;

    sshTerminalService.closeSession(sessionId);

    // Remove from ownership tracking
    const sessions = this.terminalSessions.get(ws);
    if (sessions) {
      const idx = sessions.indexOf(sessionId);
      if (idx !== -1) sessions.splice(idx, 1);
    }
  }

  // Cleanup all resources owned by a disconnecting client
  private cleanupClient(ws: WebSocket) {
    this.clients.delete(ws);

    // Detach callbacks and schedule cleanup for terminal sessions owned by this WebSocket
    const sessions = this.terminalSessions.get(ws);
    if (sessions) {
      this.terminalSessions.delete(ws);
      for (const sessionId of sessions) {
        // Another live client may have taken over this session (e.g. a reconnect
        // attached before the old socket's close event fired). Detaching here would
        // wipe the new client's callbacks, leaving the shell streaming to nobody.
        let ownedByOtherClient = false;
        for (const otherSessions of this.terminalSessions.values()) {
          if (otherSessions.includes(sessionId)) {
            ownedByOtherClient = true;
            break;
          }
        }
        if (!ownedByOtherClient) {
          sshTerminalService.detachClient(sessionId);
          // Clean up in 10 minutes (600,000 ms)
          sshTerminalService.scheduleSessionCleanup(sessionId, 10 * 60 * 1000);
        }
      }
    }
  }

  public sendToTerminalOwner(sessionId: string, payload: any) {
    const msg = JSON.stringify(payload);
    for (const [ws, sessions] of this.terminalSessions.entries()) {
      if (sessions.includes(sessionId) && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
        return;
      }
    }
  }

  private broadcast(connectionId: number, payload: any) {
    if (!this.wss) return;
    const msg = JSON.stringify(payload);
    let count = 0;
    for (const [client, connId] of this.clients.entries()) {
      if (connId === connectionId && client.readyState === WebSocket.OPEN) {
        client.send(msg);
        count++;
      }
    }
    if (count > 0) {
      // console.log(`[WS] Broadcasted progress update for connection ${connectionId} to ${count} clients`);
    }
  }
}

export const webSocketService = new WebSocketService();
export default webSocketService;
