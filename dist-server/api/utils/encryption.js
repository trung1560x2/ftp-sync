import crypto from 'crypto';
// Trong thực tế, ENCRYPTION_KEY nên được lưu trong .env và có độ dài 32 bytes (256 bits)
// Đây là key demo:
const ENCRYPTION_KEY = '12345678901234567890123456789012'; // 32 chars
const IV_LENGTH = 16; // For AES, this is always 16
export function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
export function decrypt(text) {
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
    catch (error) {
        // Nếu giải mã thất bại (ví dụ do data cũ là bcrypt hash), trả về text gốc hoặc null
        return '';
    }
}
