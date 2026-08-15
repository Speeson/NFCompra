#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

const COMPONENTS = ['web', 'api', 'androidBuild', 'android'];
const COMPONENT_LABELS = {
  web: 'WEB',
  api: 'API',
  androidBuild: 'ANDROID BUILD',
  android: 'ANDROID RELEASE',
};

const DEFAULT_REASONS = {
  web: 'Web source or build input changed',
  api: 'API source, Worker config, migration, or API build input changed',
  androidBuild: 'Android validation or build input changed',
  android: 'Android source, resource, manifest, dependency, or app-impacting build input changed',
};

export function normalizePath(file) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isDocumentation(file) {
  const name = file.split('/').pop() ?? '';
  const topLevel = !file.includes('/');
  return file.startsWith('docs/') ||
    file.startsWith('.changes/') ||
    file.endsWith('.md') ||
    (topLevel && (
      file.endsWith('.png') ||
      file.endsWith('.jpg') ||
      file.endsWith('.jpeg') ||
      file.endsWith('.webp') ||
      file.endsWith('.gif')
    )) ||
    name.toLowerCase() === 'readme.md';
}

function isVersionOnlyAndroidBuildGradle(file, diffTextByFile = {}) {
  if (file !== 'apps/android/app/build.gradle.kts') return false;
  const diff = diffTextByFile[file] ?? '';
  if (!diff.trim()) return false;
  const changed = diff.split(/\r?\n/)
    .filter((line) => (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---'))
    .map((line) => line.slice(1).trim())
    .filter(Boolean);
  return changed.length > 0 && changed.every((line) => /^version(Code|Name)\s*=/.test(line));
}

function changedDiffLines(file, diffTextByFile = {}) {
  const diff = diffTextByFile[file] ?? '';
  return diff.split(/\r?\n/)
    .filter((line) => (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---'))
    .map((line) => line.slice(1).trim())
    .filter(Boolean);
}

function isAndroidBuildPerformanceOnlyGradleProperties(file, diffTextByFile = {}) {
  if (file !== 'apps/android/gradle.properties') return false;
  const changed = changedDiffLines(file, diffTextByFile);
  if (changed.length === 0) return false;
  return changed.every((line) =>
    /^org\.gradle\.(caching|configuration-cache|parallel|daemon|configureondemand)\s*=/.test(line)
  );
}

function isRootPackageScriptOnly(file, diffTextByFile = {}) {
  if (file !== 'package.json') return false;
  const changed = changedDiffLines(file, diffTextByFile);
  return changed.length > 0 && changed.every((line) =>
    line === '"scripts": {' ||
    /^"[^"]+":\s*"[^"]+",?$/.test(line) ||
    line === '}'
  );
}

export function classifyFile(file, options = {}) {
  const normalized = normalizePath(file);
  if (!normalized || isDocumentation(normalized)) return [];
  if (/^\.github\/workflows\//.test(normalized)) {
    return normalized === '.github/workflows/release-android.yml' ? ['androidBuild'] : [];
  }
  if (/^\.agents\/skills\/deploy-impact\//.test(normalized)) return [];
  if (/^scripts\/android-release(\.test)?\.mjs$/.test(normalized)) return ['androidBuild'];
  if (/^scripts\/(deploy-impact|vercel-ignore-build)(\.test)?\.mjs$/.test(normalized)) return [];

  const components = new Set();

  if (normalized === 'package.json' && !isRootPackageScriptOnly(normalized, options.diffTextByFile)) {
    components.add('web');
    components.add('api');
  }

  if (normalized === 'package-lock.json') {
    components.add('web');
    components.add('api');
  }

  if (normalized === 'vercel.json' || normalized === '.vercelignore') components.add('web');

  if (normalized.startsWith('apps/web/')) {
    if (!isDocumentation(normalized)) components.add('web');
  }

  if (normalized.startsWith('apps/api/')) {
    if (!isDocumentation(normalized)) components.add('api');
  }

  if (normalized.startsWith('apps/android/')) {
    if (!isDocumentation(normalized) && !isVersionOnlyAndroidBuildGradle(normalized, options.diffTextByFile)) {
      if (/^apps\/android\/(gradlew|gradlew\.bat|gradle\/wrapper\/)/.test(normalized)) {
        components.add('androidBuild');
      } else if (isAndroidBuildPerformanceOnlyGradleProperties(normalized, options.diffTextByFile)) {
        components.add('androidBuild');
      } else if (/(^|\/)(src\/main|AndroidManifest\.xml|build\.gradle\.kts|settings\.gradle\.kts|gradle\.properties)/.test(normalized) ||
        /^apps\/android\/(build\.gradle\.kts|settings\.gradle\.kts|gradle\.properties)/.test(normalized) ||
        /^apps\/android\/(app|core|feature)\//.test(normalized)) {
        components.add('androidBuild');
        components.add('android');
      }
    }
  }

  return [...components];
}

export function calculateImpact(files, options = {}) {
  const result = {
    components: {
      web: { changed: false, files: [], reasons: [] },
      api: { changed: false, files: [], reasons: [] },
      androidBuild: { changed: false, files: [], reasons: [] },
      android: { changed: false, files: [], reasons: [] },
    },
    changedFiles: [...new Set(files.map(normalizePath).filter(Boolean))].sort(),
  };
  for (const file of result.changedFiles) {
    for (const component of classifyFile(file, options)) {
      result.components[component].changed = true;
      result.components[component].files.push(file);
      if (!result.components[component].reasons.includes(DEFAULT_REASONS[component])) {
        result.components[component].reasons.push(DEFAULT_REASONS[component]);
      }
    }
  }
  result.web = result.components.web.changed;
  result.api = result.components.api.changed;
  result.androidBuild = result.components.androidBuild.changed;
  result.android = result.components.android.changed;
  return result;
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', ...options }).trim();
}

function splitLines(value) {
  return value ? value.split(/\r?\n/).map(normalizePath).filter(Boolean) : [];
}

function diffNameOnly(base, head) {
  return splitLines(git(['diff', '--name-only', base, head]));
}

function diffTextForFiles(files, base, head) {
  const result = {};
  for (const file of files) {
    try {
      result[file] = git(['diff', '--unified=0', base, head, '--', file]);
    } catch {
      result[file] = '';
    }
  }
  return result;
}

function localChangedFiles() {
  const files = new Set([
    ...splitLines(git(['diff', '--name-only', 'HEAD'])),
    ...splitLines(git(['diff', '--cached', '--name-only'])),
    ...splitLines(git(['ls-files', '--others', '--exclude-standard'])),
  ]);
  const status = splitLines(git(['status', '--porcelain']));
  for (const row of status) {
    if (row.startsWith('??')) continue;
    const path = row.slice(2).trim();
    if (!path) continue;
    files.add(normalizePath(path.includes(' -> ') ? path.split(' -> ').pop() : path));
  }
  return [...files].sort();
}

function localDiffText(files) {
  const result = {};
  for (const file of files) {
    try {
      result[file] = git(['diff', '--unified=0', 'HEAD', '--', file]) || git(['diff', '--cached', '--unified=0', '--', file]);
    } catch {
      result[file] = '';
    }
  }
  return result;
}

export function formatText(impact) {
  const lines = ['NFCompra Deployment Impact', ''];
  for (const component of COMPONENTS) {
    const label = COMPONENT_LABELS[component];
    const data = impact.components[component];
    lines.push(label);
    lines.push(data.changed ? 'Changed: yes' : 'Changed: no');
    if (data.files.length) {
      lines.push('Files:');
      for (const file of data.files) lines.push(`- ${file}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function formatGithubOutputs(impact) {
  return [
    `web=${impact.components.web.changed}`,
    `api=${impact.components.api.changed}`,
    `android_build=${impact.components.androidBuild.changed}`,
    `android=${impact.components.android.changed}`,
    `json=${JSON.stringify(impact)}`,
  ].join('\n');
}

function parseArgs(argv) {
  const args = { format: 'text', base: null, head: null, files: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--format') args.format = argv[++i];
    else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--head') args.head = argv[++i];
    else if (arg === '--files') args.files = argv[++i].split(',').map(normalizePath);
    else if (arg === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/deploy-impact.mjs [--base <sha>] [--head <sha>] [--format text|json|github] [--files a,b]');
    return;
  }
  const files = args.files ?? (args.base && args.head ? diffNameOnly(args.base, args.head) : localChangedFiles());
  const diffTextByFile = args.base && args.head ? diffTextForFiles(files, args.base, args.head) : localDiffText(files);
  const impact = calculateImpact(files, { diffTextByFile });
  if (args.format === 'json') console.log(JSON.stringify(impact, null, 2));
  else if (args.format === 'github') console.log(formatGithubOutputs(impact));
  else console.log(formatText(impact));
}

const invoked = process.argv[1] && relative(repoRoot, process.argv[1]).replace(/\\/g, '/') === 'scripts/deploy-impact.mjs';
if (invoked) runCli();
