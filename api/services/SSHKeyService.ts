import ssh2 from 'ssh2';
import { getDb } from '../db.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const { utils } = ssh2;

export interface SSHKey {
  id: number;
  name: string;
  type: string;
  publicKey: string;
  passphraseProtected: boolean;
  createdAt: string;
}

class SSHKeyService {
  /** Get all managed keys (private key omitted for security) */
  async getAllKeys(): Promise<SSHKey[]> {
    const db = await getDb();
    const rows = await db.all('SELECT id, name, type, public_key, passphrase_protected, created_at FROM ssh_keys ORDER BY created_at DESC');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      publicKey: r.public_key,
      passphraseProtected: !!r.passphrase_protected,
      createdAt: r.created_at
    }));
  }

  /** Get a key by its ID, with decrypted private key */
  async getKeyById(id: number): Promise<{ id: number; name: string; type: string; publicKey: string; privateKey: string } | null> {
    const db = await getDb();
    const row = await db.get('SELECT * FROM ssh_keys WHERE id = ?', id);
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      publicKey: row.public_key,
      privateKey: decrypt(row.private_key)
    };
  }

  /** Generate a new key pair and save it */
  async generateKeyPair(name: string, type: 'rsa' | 'ed25519'): Promise<SSHKey> {
    let keyPair;
    if (type === 'rsa') {
      keyPair = utils.generateKeyPairSync('rsa', { bits: 2048 });
    } else {
      keyPair = utils.generateKeyPairSync('ed25519');
    }

    const db = await getDb();
    const encryptedPrivate = encrypt(keyPair.private.toString());

    const result = await db.run(
      'INSERT INTO ssh_keys (name, type, public_key, private_key, passphrase_protected) VALUES (?, ?, ?, ?, 0)',
      name,
      type,
      keyPair.public,
      encryptedPrivate
    );

    return {
      id: result.lastID!,
      name,
      type,
      publicKey: keyPair.public,
      passphraseProtected: false,
      createdAt: new Date().toISOString()
    };
  }

  /** Import an existing private key */
  async importPrivateKey(name: string, privateKeyPEM: string): Promise<SSHKey> {
    // Parse key to validate it and extract the public key
    const parsed = utils.parseKey(privateKeyPEM);
    if (parsed instanceof Error) {
      throw parsed;
    }
    if (Array.isArray(parsed)) {
      throw new Error('Multi-part keys not supported');
    }

    const type = parsed.type;
    const publicKeyOpenSSH = `${parsed.type} ${parsed.getPublicSSH().toString('base64')}`;
    const encryptedPrivate = encrypt(privateKeyPEM);

    const db = await getDb();
    const result = await db.run(
      'INSERT INTO ssh_keys (name, type, public_key, private_key, passphrase_protected) VALUES (?, ?, ?, ?, ?)',
      name,
      type,
      publicKeyOpenSSH,
      encryptedPrivate,
      0 // No passphrase support for now (handled by ssh2 internally if present)
    );

    return {
      id: result.lastID!,
      name,
      type,
      publicKey: publicKeyOpenSSH,
      passphraseProtected: false,
      createdAt: new Date().toISOString()
    };
  }

  /** Delete a managed key */
  async deleteKey(id: number): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM ssh_keys WHERE id = ?', id);
  }

  /** Install managed public key to a remote host (ssh-copy-id style) */
  async installPublicKey(keyId: number, connectionConfig: any): Promise<void> {
    const key = await this.getKeyById(keyId);
    if (!key) throw new Error('Key not found');

    const client = new ssh2.Client();
    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        // Ensure ~/.ssh folder exists and append public key
        const pubKeyStr = key.publicKey.trim();
        const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "${pubKeyStr}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
        
        client.exec(cmd, (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }
          let stderrData = '';
          stream.on('close', (code: number) => {
            client.end();
            if (code !== 0) {
              reject(new Error(`Command failed with code ${code}. Error: ${stderrData}`));
            } else {
              resolve();
            }
          });
          stream.stderr.on('data', (data) => {
            stderrData += data.toString();
          });
        });
      });

      client.on('error', (err) => {
        reject(err);
      });

      // Connect with passwords or existing configuration parameters
      client.connect({
        host: connectionConfig.server,
        port: connectionConfig.port || 22,
        username: connectionConfig.username,
        password: connectionConfig.password || undefined,
        privateKey: connectionConfig.privateKey || undefined,
        readyTimeout: 10000
      });
    });
  }
}

export const sshKeyService = new SSHKeyService();
export default sshKeyService;
