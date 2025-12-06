// import * as crypto from 'node:crypto';
// import { promisify } from 'node:util';

// const scrypt = promisify(crypto.scrypt);

// // Tạo hash mật khẩu
// export async function hashPassword(raw: string): Promise<string> {
//   const salt = crypto.randomBytes(16).toString('hex'); // 16 bytes salt
//   const key = (await scrypt(raw, salt, 32)) as Buffer; // 32 bytes key

//   // Lưu theo format: scrypt:<salt>:<hash>
//   return `scrypt:${salt}:${key.toString('hex')}`;
// }

// // So sánh mật khẩu nhập vào với hash lưu trong DB
// export async function verifyPassword(
//   raw: string,
//   stored: string,
// ): Promise<boolean> {
//   if (!stored) return false;

//   const parts = stored.split(':');
//   if (parts.length !== 3) return false;

//   const [algo, salt, hashHex] = parts;
//   if (algo !== 'scrypt') return false;

//   const derivedKey = (await scrypt(raw, salt, 32)) as Buffer;
//   const storedKey = Buffer.from(hashHex, 'hex');

//   if (storedKey.length !== derivedKey.length) return false;

//   // So sánh an toàn tránh timing attack
//   return crypto.timingSafeEqual(storedKey, derivedKey);
// }


import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10; // có thể chỉnh 10–12 tuỳ performance

// Tạo hash mật khẩu
export async function hashPassword(raw: string): Promise<string> {
  const hash = await bcrypt.hash(raw, SALT_ROUNDS);

  // Lưu theo format: bcrypt:<hash>
  return `bcrypt:${hash}`;
}

// So sánh mật khẩu nhập vào với hash lưu trong DB
export async function verifyPassword(
  raw: string,
  stored: string,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split(':');

  // Hỗ trợ 2 kiểu:
  // - "bcrypt:<hash>" (mới)
  // - "<hash>" (trường hợp đã lưu sẵn hash bcrypt không có prefix)
  if (parts.length === 1) {
    // legacy: chỉ có hash
    return bcrypt.compare(raw, stored);
  }

  if (parts.length !== 2) return false;

  const [algo, hash] = parts;
  if (algo !== 'bcrypt') return false;

  // bcrypt.compare đã làm so sánh an toàn (constant-time)
  return bcrypt.compare(raw, hash);
}
