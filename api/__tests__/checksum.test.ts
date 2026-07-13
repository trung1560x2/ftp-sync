import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import ChecksumVerifier from '../services/ChecksumVerifier.js';
import crypto from 'crypto';

describe('ChecksumVerifier Service', () => {
  const tempDir = path.resolve(process.cwd(), 'scratch/test_checksum');
  const tempFile = path.join(tempDir, 'test.txt');
  const fileContent = 'Hello, OmniSync Checksum!';
  const expectedMd5 = crypto.createHash('md5').update(fileContent).digest('hex');

  beforeAll(async () => {
    await fs.ensureDir(tempDir);
    await fs.writeFile(tempFile, fileContent, 'utf8');
  });

  afterAll(async () => {
    await fs.remove(tempDir);
  });

  it('should correctly compute local MD5 hash', async () => {
    const hash = await ChecksumVerifier.computeLocalHash(tempFile, 'md5');
    expect(hash).toBe(expectedMd5);
  });

  it('should fall back to stream calculation on remote hash if not SFTP', async () => {
    const mockClient = {
      downloadTo: async (destination: any) => {
        destination.write(Buffer.from(fileContent));
        destination.end();
      }
    } as any;

    const hash = await ChecksumVerifier.computeRemoteHash(mockClient, 'some/remote/file.txt', 'md5');
    expect(hash).toBe(expectedMd5);
  });

  it('should use SSH remote command if client has exec capability', async () => {
    const mockClient = {
      client: {
        client: {
          exec: (cmd: string, cb: any) => {
            const listeners: Record<string, Function> = {};
            const stderrListeners: Record<string, Function> = {};
            const stream = {
              on: (event: string, handler: Function) => {
                listeners[event] = handler;
                if (event === 'close') {
                  setTimeout(() => {
                    if (listeners['data']) {
                      listeners['data'](Buffer.from(`${expectedMd5}  /some/remote/file.txt`));
                    }
                    handler(0);
                  }, 10);
                }
              },
              stderr: {
                on: (event: string, handler: Function) => {
                  stderrListeners[event] = handler;
                }
              }
            };
            cb(null, stream);
          }
        }
      }
    } as any;

    const hash = await ChecksumVerifier.computeRemoteHash(mockClient, '/some/remote/file.txt', 'md5');
    expect(hash).toBe(expectedMd5);
  });
});
