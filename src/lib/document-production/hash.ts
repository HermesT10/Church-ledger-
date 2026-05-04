import { createHash } from 'node:crypto';

export function checksumSha256(payload: string | Uint8Array) {
  return createHash('sha256').update(payload).digest('hex');
}

export function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

export function safeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'document';
}
