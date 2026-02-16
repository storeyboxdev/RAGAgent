import { createHash } from 'crypto';

export function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hashString(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
