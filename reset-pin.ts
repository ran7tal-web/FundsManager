import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import "dotenv/config";

const rawKey = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
const ENCRYPTION_KEY = Buffer.alloc(32);
Buffer.from(rawKey, 'utf8').copy(ENCRYPTION_KEY);

const IV_LENGTH = 16;

function encryptPassword(text: string): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

const authPath = path.join('data', 'finance_auth.bin');
const newPIN = process.argv[2] || "2411";

if (!fs.existsSync('data')) {
  fs.mkdirSync('data', { recursive: true });
}

fs.writeFileSync(authPath, encryptPassword(newPIN));
console.log(`Finance Manager PIN has been reset to: ${newPIN}`);
console.log('Using ENCRYPTION_KEY from environment or default');
