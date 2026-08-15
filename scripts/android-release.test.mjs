import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion, generateAndroidReleaseNotes, parseChangeset, readAndroidVersion, selectAndroidBump } from './android-release.mjs';

test('reads Android version from Gradle text', () => {
  const version = readAndroidVersion('versionCode = 42\nversionName = "0.8.4"\n');
  assert.deepEqual(version, { versionCode: 42, versionName: '0.8.4' });
});

test('calculates semantic patch minor and major versions', () => {
  assert.equal(bumpVersion('0.8.4', 'patch'), '0.8.5');
  assert.equal(bumpVersion('0.8.4', 'minor'), '0.9.0');
  assert.equal(bumpVersion('0.8.4', 'major'), '1.0.0');
});

test('selects highest Android bump from multiple changesets', () => {
  assert.equal(selectAndroidBump([{ type: 'patch' }, { type: 'minor' }, { type: 'patch' }]), 'minor');
  assert.equal(selectAndroidBump([{ type: 'minor' }, { type: 'major' }]), 'major');
  assert.equal(selectAndroidBump([{ type: 'minor' }], 'patch'), 'patch');
});

test('validates changeset schema', () => {
  const changeset = parseChangeset(JSON.stringify({
    components: ['android', 'api'],
    type: 'minor',
    category: 'added',
    summary: 'Added account deletion from Settings.',
  }));
  assert.deepEqual(changeset.components, ['android', 'api']);
});

test('rejects invalid changeset category', () => {
  assert.throws(() => parseChangeset(JSON.stringify({
    components: ['android'],
    type: 'patch',
    category: 'other',
    summary: 'Invalid',
  })), /invalid category/);
});

test('generates grouped Android release notes', () => {
  const notes = generateAndroidReleaseNotes('0.9.0', [
    { category: 'added', summary: 'Added account deletion from Settings.' },
    { category: 'fixed', summary: 'Fixed catalog back navigation.' },
    { category: 'added', summary: 'Added ownership transfer.', details: ['Keeps shared households available.'] },
  ]);
  assert.match(notes, /NFCompra Android v0\.9\.0/);
  assert.match(notes, /Added\n- Added account deletion from Settings\./);
  assert.match(notes, /  - Keeps shared households available\./);
  assert.match(notes, /Fixed\n- Fixed catalog back navigation\./);
});
