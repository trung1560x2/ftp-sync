import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, initDb, closeDb } from '../db.js';
import { sshKeyService } from '../services/SSHKeyService.js';
import fs from 'fs-extra';
import path from 'path';

describe('SSH Key Management tests', () => {
  beforeAll(async () => {
    // Initialize temporary database for tests
    process.env.DB_PATH = path.resolve(process.cwd(), 'api/test_ssh_keys.db');
    await fs.remove(process.env.DB_PATH);
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
    if (process.env.DB_PATH) {
      await fs.remove(process.env.DB_PATH);
    }
  });

  it('should generate an Ed25519 key pair successfully', async () => {
    const key = await sshKeyService.generateKeyPair('test-ed25519', 'ed25519');
    expect(key).toBeDefined();
    expect(key.name).toBe('test-ed25519');
    expect(key.type).toBe('ed25519');
    expect(key.publicKey).toContain('ssh-ed25519');

    // Retrieve and check decrypted key details
    const loaded = await sshKeyService.getKeyById(key.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.privateKey).toContain('-----BEGIN OPENSSH PRIVATE KEY-----');
  });

  it('should generate an RSA key pair successfully', async () => {
    const key = await sshKeyService.generateKeyPair('test-rsa', 'rsa');
    expect(key).toBeDefined();
    expect(key.name).toBe('test-rsa');
    expect(key.type).toBe('rsa');
    expect(key.publicKey).toContain('ssh-rsa');

    // Retrieve and check decrypted key details
    const loaded = await sshKeyService.getKeyById(key.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.privateKey).toContain('-----BEGIN OPENSSH PRIVATE KEY-----');
  });

  it('should import an existing PEM private key successfully', async () => {
    const testKeyPair = await sshKeyService.generateKeyPair('source-key', 'ed25519');
    const sourceKeyDetails = await sshKeyService.getKeyById(testKeyPair.id);
    
    // Import the private key
    const imported = await sshKeyService.importPrivateKey('imported-key', sourceKeyDetails!.privateKey);
    expect(imported).toBeDefined();
    expect(imported.name).toBe('imported-key');
    expect(imported.type).toBe('ssh-ed25519');
    expect(imported.publicKey.trim()).toBe(testKeyPair.publicKey.trim());

    // Clean up
    await sshKeyService.deleteKey(testKeyPair.id);
    await sshKeyService.deleteKey(imported.id);
  });
});
