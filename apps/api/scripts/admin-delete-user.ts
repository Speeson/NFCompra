import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ACCOUNT_DELETION_COUNT_SQL, accountDeletionMutationSql, type AccountDeletionImpact } from '../src/account-deletion/service.ts';

type CountKey = keyof Omit<AccountDeletionImpact, 'user' | 'householdActions'>;

interface QueryRow {
  [key: string]: unknown;
}

const args = process.argv.slice(2);
const apiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const wranglerBin = join(apiDir, '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const dryRun = args.includes('--dry-run');
const remote = args.includes('--remote');
const byId = args.includes('--id');
const yes = args.includes('--yes');
const identifier = args.find((arg) => !arg.startsWith('--'));

if (!identifier?.trim()) fail('Usage: npm run admin:delete-user -- <email|id> [--id] [--dry-run] [--remote] [--yes]');
if (remote && dryRun === false) {
  console.log('Environment: remote production D1 (nfcompra-production)');
} else {
  console.log(`Environment: ${remote ? 'remote production D1 (nfcompra-production)' : 'local D1 (DB)'}`);
}

const database = remote ? 'nfcompra-production' : 'DB';
const configArgs = remote ? ['--remote', '--config', 'wrangler.production.jsonc'] : ['--local'];
const userRows = query<{ id: string; email: string }>(
  byId
    ? `SELECT id, email FROM users WHERE id = ${quote(identifier)}`
    : `SELECT id, email FROM users WHERE email = ${quote(identifier.toLowerCase())}`,
);
if (userRows.length === 0) fail('User not found.');
if (userRows.length > 1) fail('Identifier is ambiguous.');

const impact = buildImpact(userRows[0]);
printImpact(impact);
if (dryRun) {
  console.log('No changes were made.');
  process.exit(0);
}
if (!yes && !await confirm('Delete this user permanently? (y/N) ')) {
  console.log('Aborted. No changes were made.');
  process.exit(0);
}

const file = join(apiDir, `.delete-user-${Date.now()}.sql`);
writeFileSync(file, accountDeletionMutationSql(impact, new Date().toISOString()).map(toSql).join('\n') + '\n');
try {
  wrangler(['d1', 'execute', database, ...configArgs, '--file', file], { stdio: 'inherit' });
} finally {
  unlinkSync(file);
}

function buildImpact(user: { id: string; email: string }): AccountDeletionImpact {
  const householdActions = query<{ id: string; name: string }>(
    `SELECT id, name FROM households WHERE owner_id = ${quote(user.id)} ORDER BY created_at ASC, id ASC`,
  ).map((household) => {
    const successor = query<{ user_id: string; email: string }>(`
      SELECT household_members.user_id, users.email
      FROM household_members
      JOIN users ON users.id = household_members.user_id
      WHERE household_members.household_id = ${quote(household.id)}
        AND household_members.user_id <> ${quote(user.id)}
        AND household_members.role IN ('owner', 'member')
      ORDER BY household_members.created_at ASC, household_members.user_id ASC
      LIMIT 1
    `)[0];
    return {
      householdId: household.id,
      householdName: household.name,
      action: successor ? 'transfer' as const : 'delete' as const,
      successorUserId: successor?.user_id ?? null,
      successorEmail: successor?.email ?? null,
    };
  });
  const counts = Object.fromEntries(
    (Object.entries(ACCOUNT_DELETION_COUNT_SQL) as Array<[CountKey, string]>).map(([key, sql]) => {
      const literalSql = key === 'notifications'
        ? sql.replace('?', quote(user.id)).replace('?', quote(user.id))
        : sql.replace('?', quote(user.id));
      return [key, Number(query<{ count: number }>(literalSql)[0]?.count ?? 0)];
    }),
  ) as Record<CountKey, number>;
  return { user, ...counts, householdActions };
}

function printImpact(impact: AccountDeletionImpact): void {
  console.log(`User: ${impact.user.email} (${impact.user.id})`);
  console.log(`Households owned: ${impact.ownedHouseholds}`);
  console.log(`Household memberships: ${impact.memberships}`);
  console.log(`Refresh tokens: ${impact.refreshTokens}`);
  console.log(`Auth tokens: ${impact.authTokens}`);
  console.log(`Sync operations: ${impact.syncOperations}`);
  console.log(`Notifications: ${impact.notifications}`);
  console.log(`Invitations sent: ${impact.invitationsSent}`);
  console.log(`NFC links authored: ${impact.nfcLinksCreated}`);
  console.log(`Shopping item author references: ${impact.shoppingItemsCreated + impact.shoppingItemsUpdated}`);
  console.log(`Favorites: ${impact.favorites}`);
  for (const household of impact.householdActions) {
    console.log('');
    console.log(`Household: ${household.householdName} (${household.householdId})`);
    console.log(`Action: ${household.action === 'transfer' ? 'transfer ownership' : 'delete household (no other members)'}`);
    if (household.successorEmail) console.log(`New owner: ${household.successorEmail} (${household.successorUserId})`);
  }
}

function query<T extends QueryRow>(sql: string): T[] {
  const output = wrangler(['d1', 'execute', database, ...configArgs, '--json', '--command', sql], { stdio: 'pipe' }).stdout.toString();
  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
  return parsed.flatMap((item) => item.results ?? []);
}

function wrangler(command: string[], options: { stdio: 'pipe' | 'inherit' }): ReturnType<typeof spawnSync> {
  const result = spawnSync(process.execPath, [wranglerBin, ...command], { cwd: apiDir, encoding: 'utf8', stdio: options.stdio });
  if (result.status !== 0) fail([result.stdout?.toString(), result.stderr?.toString(), result.error?.message, `status=${result.status} signal=${result.signal ?? ''}`].filter(Boolean).join('\n') || 'Wrangler command failed.');
  return result;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function toSql(statement: { sql: string; params: unknown[] }): string {
  let index = 0;
  return `${statement.sql.replace(/\?/g, () => {
    const value = statement.params[index++];
    if (value === null) return 'NULL';
    if (typeof value === 'number') return String(value);
    return quote(String(value));
  })};`;
}

async function confirm(question: string): Promise<boolean> {
  const readline = createInterface({ input, output });
  try {
    return (await readline.question(question)).trim().toLowerCase() === 'y';
  } finally {
    readline.close();
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
