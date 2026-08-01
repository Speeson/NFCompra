import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations('./migrations');
const notificationMigrationName = '0006_notifications.sql';
const notificationMigration = await readFile(`./migrations/${notificationMigrationName}`, 'utf8');
const wranglerNotificationMigration = `${notificationMigration}\nINSERT INTO d1_migrations (name) values ('${notificationMigrationName}');`;

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations, WRANGLER_NOTIFICATION_MIGRATION: wranglerNotificationMigration } },
    }),
  ],
});
