import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      SUPABASE_ANON_KEY: 'test-key',
      LMNR_PROJECT_API_KEY: 'test-key',
    },
  },
});
