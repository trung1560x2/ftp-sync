import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let ENCRYPTION_KEY: string;

const keyFromEnv = process.env.ENCRYPTION_KEY;
if (keyFromEnv) {
  if (Buffer.from(keyFromEnv).length !== 32) {
    throw new Error('ENCRYPTION_KEY environment variable must be exactly 32 bytes/characters long');
  }
  ENCRYPTION_KEY = keyFromEnv;
} else {
  // Always store key in the same directory as the database if specified, fallback to cwd
  const baseDir = process.env.DB_PATH
    ? path.dirname(process.env.DB_PATH)
    : process.cwd();
  const keyPath = path.join(baseDir, '.encryption_key');
  try {
    if (fs.existsSync(keyPath)) {
      ENCRYPTION_KEY = fs.readFileSync(keyPath, 'utf8').trim();
      if (Buffer.from(ENCRYPTION_KEY).length !== 32) {
        throw new Error('Key in .encryption_key file must be exactly 32 bytes/characters');
      }
    } else {
      const generatedKey = crypto.randomBytes(16).toString('hex'); // 32 characters
      fs.writeFileSync(keyPath, generatedKey, 'utf8');
      ENCRYPTION_KEY = generatedKey;
      console.log('Generated a new secure encryption key and saved to:', keyPath);
    }
  } catch (err: any) {
    console.error(`Failed to read or write local encryption key file at ${keyPath}, using dynamic fallback:`, err.message);
    // Temporary session fallback if disk is not writable
    ENCRYPTION_KEY = crypto.randomBytes(16).toString('hex');
  }
}

const IV_LENGTH = 16; // For AES, this is always 16

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    // Nếu giải mã thất bại (ví dụ do data cũ là bcrypt hash), trả về text gốc hoặc null
    return '';
  }
}

export function encryptWithPassword(text: string, password: string): string {
  const salt = crypto.randomBytes(16);
  // Derive key: 32 bytes (256 bits)
  const key = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  // Format: salt(hex):iv(hex):encryptedText(hex)
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptWithPassword(encryptedData: string, password: string): string {
  const parts = encryptedData.split(':');
  if (parts.length < 3) throw new Error('Invalid encrypted data format');
  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts[2], 'hex');
  
  const key = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
