import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { sshTerminalService } from '../services/SSHTerminalService.js';

describe('SSH Keepalive Ping tests', () => {
  let originalSessions: Map<string, any>;

  beforeAll(() => {
    // Backup original sessions
    originalSessions = (sshTerminalService as any).sessions;
    (sshTerminalService as any).sessions = new Map();
  });

  afterAll(() => {
    // Restore original sessions
    (sshTerminalService as any).sessions = originalSessions;
  });

  it('should return false if session does not exist', async () => {
    const result = await sshTerminalService.ping('invalid-session-id');
    expect(result).toBe(false);
  });

  it('should return true if requestKeepalive succeeds', async () => {
    const mockSshClient = {
      requestKeepalive: vi.fn((callback) => {
        callback(undefined);
        return true;
      }),
      on: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
    };

    (sshTerminalService as any).sessions.set('test-session', {
      sshClient: mockSshClient,
      shellStream: {},
    });

    const result = await sshTerminalService.ping('test-session');
    expect(result).toBe(true);
    expect(mockSshClient.requestKeepalive).toHaveBeenCalled();
  });

  it('should return false if requestKeepalive returns an error', async () => {
    const mockSshClient = {
      requestKeepalive: vi.fn((callback) => {
        callback(new Error('Keepalive failed'));
        return true;
      }),
      on: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
    };

    (sshTerminalService as any).sessions.set('test-session-err', {
      sshClient: mockSshClient,
      shellStream: {},
    });

    const result = await sshTerminalService.ping('test-session-err');
    expect(result).toBe(false);
  });
});
