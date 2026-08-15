#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const buildGradlePath = join(repoRoot, 'apps/android/app/build.gradle.kts');
const pendingDir = join(repoRoot, '.changes/pending');
const releasedDir = join(repoRoot, '.changes/releases');
const categories = ['added', 'changed', 'fixed', 'removed', 'security'];
const bumps = ['patch', 'minor', 'major'];

export function readAndroidVersion(text = readFileSync(buildGradlePath, 'utf8')) {
  const code = text.match(/versionCode\s*=\s*(\d+)/)?.[1];
  const name = text.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
  if (!code || !name) throw new Error('Could not read Android versionCode/versionName.');
  return { versionCode: Number(code), versionName: name };
}

export function bumpVersion(versionName, bump) {
  const parts = versionName.split('.').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Invalid semantic version: ${versionName}`);
  }
  const [major, minor, patch] = parts;
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function highestBump(values) {
  let selected = 'patch';
  for (const value of values) {
    if (bumps.indexOf(value) > bumps.indexOf(selected)) selected = value;
  }
  return selected;
}

export function selectAndroidBump(changesets, bump = 'auto') {
  if (bump !== 'auto') {
    if (!bumps.includes(bump)) throw new Error(`Invalid bump: ${bump}`);
    return bump;
  }
  return highestBump(changesets.map((item) => item.type));
}

export function parseChangeset(json, file = '<changeset>') {
  const data = JSON.parse(json);
  if (!Array.isArray(data.components) || data.components.length === 0) throw new Error(`${file}: components must be a non-empty array.`);
  for (const component of data.components) {
    if (!['web', 'api', 'android'].includes(component)) throw new Error(`${file}: invalid component ${component}.`);
  }
  if (!bumps.includes(data.type)) throw new Error(`${file}: type must be patch, minor, or major.`);
  if (!categories.includes(data.category)) throw new Error(`${file}: invalid category ${data.category}.`);
  if (typeof data.summary !== 'string' || !data.summary.trim()) throw new Error(`${file}: summary is required.`);
  if (data.details !== undefined && (!Array.isArray(data.details) || data.details.some((item) => typeof item !== 'string'))) {
    throw new Error(`${file}: details must be an array of strings.`);
  }
  return { ...data, summary: data.summary.trim(), details: data.details ?? [] };
}

export function readPendingChangesets(component = null) {
  if (!existsPending()) return [];
  return readdirSync(pendingDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const fullPath = join(pendingDir, file);
      return { file, fullPath, data: parseChangeset(readFileSync(fullPath, 'utf8'), `.changes/pending/${file}`) };
    })
    .filter((entry) => !component || entry.data.components.includes(component));
}

function existsPending() {
  try {
    readdirSync(pendingDir);
    return true;
  } catch {
    return false;
  }
}

export function planAndroidRelease({ bump = 'auto' } = {}) {
  const current = readAndroidVersion();
  const changesets = readPendingChangesets('android');
  if (bump === 'auto' && changesets.length === 0) {
    return { current, hasPendingChangesets: false, bump: null, nextVersionName: null, nextVersionCode: null, changesets: [] };
  }
  const selectedBump = selectAndroidBump(changesets.map((item) => item.data), bump);
  return {
    current,
    hasPendingChangesets: changesets.length > 0,
    bump: selectedBump,
    nextVersionName: bumpVersion(current.versionName, selectedBump),
    nextVersionCode: current.versionCode + 1,
    changesets: changesets.map((item) => ({ file: item.file, ...item.data })),
  };
}

export function generateAndroidReleaseNotes(versionName, changesets) {
  const lines = [`NFCompra Android v${versionName}`, ''];
  for (const category of categories) {
    const entries = changesets.filter((item) => item.category === category);
    if (!entries.length) continue;
    lines.push(titleCase(category));
    for (const entry of entries) {
      lines.push(`- ${entry.summary}`);
      for (const detail of entry.details ?? []) lines.push(`  - ${detail}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function titleCase(category) {
  return ({ added: 'Added', changed: 'Changed', fixed: 'Fixed', removed: 'Removed', security: 'Security' })[category];
}

export function updateAndroidVersion({ versionName, versionCode }) {
  const original = readFileSync(buildGradlePath, 'utf8');
  const updated = original
    .replace(/versionCode\s*=\s*\d+/, `versionCode = ${versionCode}`)
    .replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${versionName}"`);
  if (updated === original) throw new Error('Android version was not updated.');
  writeFileSync(buildGradlePath, updated);
}

export function prepareAndroidRelease({ bump = 'auto' } = {}) {
  const plan = planAndroidRelease({ bump });
  if (!plan.nextVersionName) throw new Error('No pending Android changesets. Use a forced bump to create a rebuild release.');
  updateAndroidVersion({ versionName: plan.nextVersionName, versionCode: plan.nextVersionCode });
  mkdirSync(releasedDir, { recursive: true });
  const releaseFile = join(releasedDir, `android-v${plan.nextVersionName}.json`);
  writeFileSync(releaseFile, JSON.stringify({
    component: 'android',
    versionName: plan.nextVersionName,
    versionCode: plan.nextVersionCode,
    releasedAt: null,
    changesets: plan.changesets,
  }, null, 2) + '\n');
  for (const entry of readPendingChangesets('android')) {
    renameSync(entry.fullPath, join(releasedDir, `android-v${plan.nextVersionName}-${basename(entry.file)}`));
  }
  writeFileSync(join(releasedDir, `android-v${plan.nextVersionName}.md`), generateAndroidReleaseNotes(plan.nextVersionName, plan.changesets));
  return plan;
}

function parseArgs(argv) {
  const args = { command: argv[0], bump: 'auto', format: 'text' };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--bump') args.bump = argv[++i];
    else if (argv[i] === '--format') args.format = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function printPlan(plan, format) {
  if (format === 'json') {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`Current Android version: ${plan.current.versionName} (${plan.current.versionCode})`);
  if (!plan.nextVersionName) {
    console.log('No pending Android changesets.');
    return;
  }
  console.log(`Suggested Android version: ${plan.nextVersionName} (${plan.nextVersionCode})`);
  console.log(`Bump: ${plan.bump}`);
  console.log(`Changesets: ${plan.changesets.map((item) => item.file).join(', ') || 'none'}`);
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'plan') printPlan(planAndroidRelease({ bump: args.bump }), args.format);
  else if (args.command === 'notes') {
    const plan = planAndroidRelease({ bump: args.bump });
    if (!plan.nextVersionName) throw new Error('No pending Android changesets.');
    process.stdout.write(generateAndroidReleaseNotes(plan.nextVersionName, plan.changesets));
  } else if (args.command === 'prepare') {
    const plan = prepareAndroidRelease({ bump: args.bump });
    printPlan(plan, args.format);
  } else if (args.command === 'validate') {
    readPendingChangesets();
    console.log('Changesets valid.');
  } else {
    throw new Error('Usage: node scripts/android-release.mjs plan|notes|prepare|validate [--bump auto|patch|minor|major] [--format text|json]');
  }
}

const invoked = process.argv[1] && relative(repoRoot, process.argv[1]).replace(/\\/g, '/') === 'scripts/android-release.mjs';
if (invoked) runCli();
