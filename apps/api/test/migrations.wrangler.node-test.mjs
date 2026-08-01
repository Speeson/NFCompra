import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { unstable_splitSqlQuery } from 'wrangler';

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

test('Wrangler partitions the notification migration into executable statements', async () => {
  const database = new DatabaseSync(':memory:');

  try {
    database.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');

    for (let migration = 1; migration <= 5; migration += 1) {
      const [filename] = await readMigrationFilenames(migration);
      database.exec(await readFile(path.join(migrationsDirectory, filename), 'utf8'));
    }

    const migrationName = '0006_notifications.sql';
    const notificationSql = await readFile(
      path.join(migrationsDirectory, '0006_notifications.sql'),
      'utf8',
    );
    const migrationPayload = `${notificationSql}\nINSERT INTO d1_migrations (name)\nvalues ('${migrationName}');`;
    const statements = unstable_splitSqlQuery(migrationPayload);

    assert.equal(statements.length, 11);

    for (const statement of statements) {
      database.prepare(statement).run();
    }

    const triggers = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'notifications_%' ORDER BY name")
      .all()
      .map(({ name }) => name);

    assert.deepEqual(triggers, [
      'notifications_invitation_accepted',
      'notifications_invitation_received',
      'notifications_item_created',
      'notifications_item_deleted',
      'notifications_item_updated',
      'notifications_member_removed',
    ]);
    assert.deepEqual(
      database.prepare('SELECT name FROM d1_migrations').all().map(({ name }) => name),
      [migrationName],
    );
  } finally {
    database.close();
  }
});

async function readMigrationFilenames(number) {
  const prefix = number.toString().padStart(4, '0');
  return (await readdir(migrationsDirectory)).filter((filename) => filename.startsWith(prefix));
}
