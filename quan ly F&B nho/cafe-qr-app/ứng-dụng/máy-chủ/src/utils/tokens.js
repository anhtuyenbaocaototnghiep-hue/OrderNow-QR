import crypto from 'node:crypto';

/** QrToken của bàn: 32 ký tự hex ngẫu nhiên — không dùng TableId đếm được trong URL (glossary: QrToken). */
export const newQrToken = () => crypto.randomBytes(16).toString('hex');
