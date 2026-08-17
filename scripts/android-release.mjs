#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const buildGradlePath = join(repoRoot, 'apps/android/app/build.gradle.kts');
const pendingDir = join(repoRoot, '.changes/pending');
const releasedDir = join(repoRoot, '.changes/releases');
const categories = ['added', 'changed', 'fixed', 'removed', 'security'];
const categoryTitles = {
  added: 'Novedades',
  changed: 'Cambios',
  fixed: 'Correcciones',
  removed: 'Eliminado',
  security: 'Seguridad',
};
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
  const androidChangesets = changesets.filter((item) => !item.components || item.components.includes('android'));
  for (const category of categories) {
    const entries = androidChangesets.filter((item) => item.category === category);
    if (!entries.length) continue;
    lines.push(categoryTitle(category));
    for (const entry of entries) {
      lines.push(`- ${entry.summary}`);
      for (const detail of entry.details ?? []) lines.push(`  - ${detail}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function categoryTitle(category) {
  return categoryTitles[category];
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

export function chooseReleaseTarget({ currentVersionName, currentVersionCode, plannedVersion, existingTags = [] }) {
  const tags = new Set(existingTags);
  if (plannedVersion) {
    if (tags.has(`v${plannedVersion}`)) {
      return { action: 'resume', versionName: plannedVersion, versionCode: null, reason: `Tag v${plannedVersion} already exists; resuming the same release.` };
    }
    return { action: 'fresh', versionName: plannedVersion, versionCode: currentVersionCode + 1 };
  }
  if (tags.has(`v${currentVersionName}`)) {
    return { action: 'resume', versionName: currentVersionName, versionCode: null, reason: `Tag v${currentVersionName} already exists; resuming the same release.` };
  }
  return { action: 'fail', versionName: null, versionCode: null, reason: 'No pending Android changesets and no release tag to resume.' };
}

export function validateResumeRelease({
  tagVersion,
  gradleVersionName,
  gradleVersionCode,
  metadataExists,
  metadataVersionName,
  metadataVersionCode,
  notesExists,
}) {
  const errors = [];
  if (gradleVersionName !== tagVersion) errors.push(`Tag v${tagVersion} points to Android versionName "${gradleVersionName}".`);
  if (!Number.isInteger(gradleVersionCode) || gradleVersionCode <= 0) errors.push(`Invalid Android versionCode "${gradleVersionCode}" at tag v${tagVersion}.`);
  if (!metadataExists) {
    errors.push(`Missing release metadata .changes/releases/android-v${tagVersion}.json at tag v${tagVersion}.`);
  } else if (metadataVersionName !== tagVersion || metadataVersionCode !== gradleVersionCode) {
    errors.push(`Release metadata version mismatch at tag v${tagVersion} (metadata ${metadataVersionName}/${metadataVersionCode}, gradle ${tagVersion}/${gradleVersionCode}).`);
  }
  if (!notesExists) errors.push(`Missing release notes .changes/releases/android-v${tagVersion}.md at tag v${tagVersion}.`);
  return { ok: errors.length === 0, errors };
}

export function classifyGitHubPublication({ releaseExists, assetExists }) {
  if (releaseExists && assetExists) return { action: 'complete' };
  if (releaseExists) return { action: 'upload-asset' };
  return { action: 'publish' };
}

export const GITHUB_RETRY_DELAYS_SECONDS = [2, 5, 10, 20];

export function githubRetryDelays() {
  return [...GITHUB_RETRY_DELAYS_SECONDS];
}

export function isRetryableHttpStatus(status) {
  return [500, 502, 503, 504].includes(Number(status));
}

export function buildAtomicReleasePushArgs({ remote = 'origin', mainBranch = 'main', tagVersion }) {
  if (!tagVersion) throw new Error('tagVersion is required to build the atomic release push.');
  return ['push', '--atomic', remote, `HEAD:${mainBranch}`, `refs/tags/v${tagVersion}`];
}

function defaultGhRunner(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function parseGhResponse(result) {
  const stderr = String(result.stderr ?? '');
  const statusMatch = stderr.match(/HTTP\s+(\d{3})/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;
  const missing = httpStatus === null && /(not found|no release|could not find)/i.test(stderr);
  if (result.ok) {
    let data = null;
    const stdout = String(result.stdout ?? '');
    if (stdout.trim()) {
      try { data = JSON.parse(stdout); } catch { /* gh --json output is JSON; ignore non-JSON */ }
    }
    return { ok: true, status: httpStatus ?? 200, data, conflict: false };
  }
  return { ok: false, status: httpStatus ?? (missing ? 404 : null), data: null, conflict: httpStatus === 422 };
}

export async function publishAndroidRelease({
  version,
  title,
  notesPath,
  apkPath,
  apkName = 'NFCompra-release.apk',
  run = defaultGhRunner,
  log = console.log,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const tag = `v${version}`;
  const delays = githubRetryDelays();
  const hasAsset = (data) => Array.isArray(data?.assets) && data.assets.some((asset) => asset.name === apkName);

  const view = () => Promise.resolve(parseGhResponse(run(['release', 'view', tag, '--json', 'id,assets'])));
  const create = () => Promise.resolve(parseGhResponse(run(['release', 'create', tag, '--target', 'main', '--title', title, '--notes-file', notesPath])));
  const upload = () => Promise.resolve(parseGhResponse(run(['release', 'upload', tag, apkPath])));

  let release = await withRetry(view, delays, tag, log, sleep);
  if (!release.ok && release.status !== 404) throwPublicationError(release, tag);

  const action = classifyGitHubPublication({ releaseExists: release.ok, assetExists: release.ok && hasAsset(release.data) }).action;
  if (action === 'complete') {
    log(`Release ${tag} is already published.`);
    return { action: 'complete', version: tag };
  }

  if (!release.ok) {
    log(`Creating GitHub release ${tag}...`);
    const created = await withRetry(create, delays, tag, log, sleep);
    if (!created.ok && !created.conflict) throwPublicationError(created, tag);
    release = await withRetry(view, delays, tag, log, sleep);
    if (!release.ok && release.status !== 404) throwPublicationError(release, tag);
    if (!release.ok) throwPublicationError(release, tag);
  }

  if (!hasAsset(release.data)) {
    log(`Uploading ${apkName} to release ${tag}...`);
    const uploaded = await withRetry(upload, delays, tag, log, sleep);
    if (!uploaded.ok && !uploaded.conflict) throwPublicationError(uploaded, tag);
    const finalView = await withRetry(view, delays, tag, log, sleep);
    if (!finalView.ok) throwPublicationError(finalView, tag);
    if (!hasAsset(finalView.data)) {
      throw new Error(`Release ${tag} exists but the ${apkName} asset could not be verified.`);
    }
  }

  log(`Release ${tag} published with ${apkName}.`);
  return { action: 'published', version: tag };
}

async function withRetry(task, delays, tag, log, sleep) {
  let attempt = 0;
  for (;;) {
    const result = await task();
    if (result.ok || result.conflict) return result;
    if (!isRetryableHttpStatus(result.status) || attempt >= delays.length) return result;
    const delaySeconds = delays[attempt];
    log(`GitHub returned HTTP ${result.status} for ${tag}; retrying in ${delaySeconds}s (attempt ${attempt + 1}/${delays.length}).`);
    await sleep(delaySeconds * 1000);
    attempt += 1;
  }
}

function throwPublicationError(result, tag) {
  const status = result.status;
  const prefix = `GitHub publication for ${tag} failed`;
  if (isRetryableHttpStatus(status)) {
    throw new Error(`${prefix} after transient retries (HTTP ${status}). ${tag} can be safely resumed by re-running the same release workflow.`);
  }
  throw new Error(`${prefix}${status ? ` (HTTP ${status})` : ''}.`);
}

function parseArgs(argv) {
  const args = { command: argv[0], bump: 'auto', format: 'text' };
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unknown argument: ${token}`);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    args[key] = value;
    i += 1;
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

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function runCli() {
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
  } else if (args.command === 'choose-target') {
    printJson(chooseReleaseTarget({
      currentVersionName: args.current,
      currentVersionCode: Number(args.code),
      plannedVersion: args.planned || null,
      existingTags: (args.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
    }));
  } else if (args.command === 'validate-tag') {
    printJson(validateResumeRelease({
      tagVersion: args['tag-version'],
      gradleVersionName: args['gradle-version'],
      gradleVersionCode: Number(args['gradle-code']),
      metadataExists: args['metadata-exists'] === 'true',
      metadataVersionName: args['metadata-version'],
      metadataVersionCode: Number(args['metadata-code']),
      notesExists: args['notes-exists'] === 'true',
    }));
  } else if (args.command === 'classify-pub') {
    printJson(classifyGitHubPublication({ releaseExists: args['release-exists'] === 'true', assetExists: args['asset-exists'] === 'true' }));
  } else if (args.command === 'publish-github') {
    await publishAndroidRelease({
      version: args.version,
      title: args.title,
      notesPath: args['notes-path'],
      apkPath: args['apk-path'],
    });
  } else {
    throw new Error('Usage: node scripts/android-release.mjs plan|notes|prepare|validate|choose-target|validate-tag|classify-pub|publish-github [--bump auto|patch|minor|major] [--format text|json]');
  }
}

const invoked = process.argv[1] && relative(repoRoot, process.argv[1]).replace(/\\/g, '/') === 'scripts/android-release.mjs';
if (invoked) await runCli();
