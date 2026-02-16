import { vi } from 'vitest';

export const TEST_USER = { id: 'test-user-uuid-1234', email: 'test@example.com' };
export const TEST_TOKEN = 'test-bearer-token';

export function createMockAuthMiddleware() {
  return vi.fn((req, res, next) => {
    req.user = TEST_USER;
    req.accessToken = TEST_TOKEN;
    next();
  });
}
