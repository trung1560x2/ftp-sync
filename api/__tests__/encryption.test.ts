import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, encryptWithPassword, decryptWithPassword } from '../utils/encryption.js';

describe('Encryption Utils', () => {
  describe('encrypt & decrypt', () => {
    it('should successfully encrypt and decrypt a string', () => {
      const originalText = 'my-secret-password-123';
      const encrypted = encrypt(originalText);
      expect(encrypted).not.toBe(originalText);
      expect(encrypted).toContain(':');

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should return empty string on decrypt failure', () => {
      const invalidCipher = 'invalid-cipher-text-no-colon';
      const decrypted = decrypt(invalidCipher);
      expect(decrypted).toBe('');
    });

    it('should return empty string when decrypting malformed data', () => {
      const decrypted = decrypt('abc:def');
      expect(decrypted).toBe('');
    });
  });

  describe('password-based encryption', () => {
    const password = 'SuperSecurePassword!';
    const originalText = 'Sensitive database backup data';

    it('should encrypt and decrypt correctly with the same password', () => {
      const encrypted = encryptWithPassword(originalText, password);
      expect(encrypted).not.toBe(originalText);
      expect(encrypted.split(':')).toHaveLength(3); // salt:iv:cipherText

      const decrypted = decryptWithPassword(encrypted, password);
      expect(decrypted).toBe(originalText);
    });

    it('should throw an error if decrypting with a wrong password', () => {
      const encrypted = encryptWithPassword(originalText, password);
      expect(() => {
        decryptWithPassword(encrypted, 'WrongPassword123');
      }).toThrow();
    });

    it('should throw an error on invalid format', () => {
      expect(() => {
        decryptWithPassword('short:format', password);
      }).toThrow('Invalid encrypted data format');
    });
  });
});
