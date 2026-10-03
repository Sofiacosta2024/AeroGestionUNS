import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
