import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

if (process.env.AEROGESTION_TEST_DB !== '1') {
  config();
  config({ path: '.env.local' });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
