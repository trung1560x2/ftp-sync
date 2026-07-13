import crypto from 'crypto';
import fs from 'fs-extra';
import { TransferClient } from './transfer/TransferClient.js';

export class ChecksumVerifier {
  public async computeLocalHash(localPath: string, algo: 'md5' | 'sha256' = 'md5'): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algo);
      const stream = fs.createReadStream(localPath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  public async computeRemoteHash(
    client: TransferClient,
    remotePath: string,
    algo: 'md5' | 'sha256' = 'md5'
  ): Promise<string> {
    // 1. Try remote execution if it is an SFTP connection
    const rawClient = (client as any).client?.client; // Underlying ssh2 client
    if (rawClient && typeof rawClient.exec === 'function') {
      try {
        const cmd = algo === 'md5' ? `md5sum "${remotePath}"` : `sha256sum "${remotePath}"`;
        const output = await this.execSshCommand(rawClient, cmd);
        const parts = output.trim().split(/\s+/);
        if (parts[0] && parts[0].length >= 32) {
          return parts[0].toLowerCase();
        }
      } catch (err) {
        // Fallback to streaming download if remote execution fails or command not found
      }
    }

    // 2. Fallback: Stream download and compute locally
    return new Promise<string>(async (resolve, reject) => {
      const hash = crypto.createHash(algo);
      const { Writable } = await import('stream');
      const hashWritable = new Writable({
        write(chunk, encoding, callback) {
          hash.update(chunk);
          callback();
        }
      });

      try {
        await client.downloadTo(hashWritable, remotePath);
        resolve(hash.digest('hex'));
      } catch (err) {
        reject(err);
      }
    });
  }

  private execSshCommand(sshConn: any, cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      sshConn.exec(cmd, (err: any, stream: any) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('data', (data: any) => { stdout += data.toString(); });
        stream.stderr.on('data', (data: any) => { stderr += data.toString(); });
        stream.on('close', (code: any) => {
          if (code !== 0) {
            reject(new Error(stderr || `Exit code ${code}`));
          } else {
            resolve(stdout.trim());
          }
        });
      });
    });
  }
}

export default new ChecksumVerifier();
