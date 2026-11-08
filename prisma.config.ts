import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Generating the client does not need a database connection. Database commands
// still require a real URL supplied through the server environment.
export default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DATABASE_URL ?? '' } });
