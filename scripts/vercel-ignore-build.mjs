#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { calculateImpact } from './deploy-impact.mjs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function isSupersededVercelCommit() {
  const head = process.env.VERCEL_GIT_COMMIT_SHA;
  const ref = process.env.VERCEL_GIT_COMMIT_REF;
  if (!head || !ref) return false;
  try {
    const remoteHead = git(['ls-remote', 'origin', `refs/heads/${ref}`]).split(/\s+/)[0];
    return Boolean(remoteHead) && remoteHead !== head;
  } catch {
    return false;
  }
}

function detectFiles() {
  const head = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  const candidates = [
    process.env.VERCEL_GIT_PREVIOUS_SHA,
    process.env.VERCEL_GIT_COMMIT_REF && `origin/${process.env.VERCEL_GIT_COMMIT_REF}`,
    'HEAD^',
  ].filter(Boolean);

  for (const base of candidates) {
    try {
      git(['rev-parse', '--verify', base]);
      return git(['diff', '--name-only', base, head]).split(/\r?\n/).filter(Boolean);
    } catch {
      // Try the next available base. If none works, build instead of skipping.
    }
  }
  throw new Error('Could not determine Vercel diff range.');
}

try {
  if (isSupersededVercelCommit()) {
    console.log('Superseded Web commit detected. Vercel build will be skipped.');
    process.exit(0);
  }
  const impact = calculateImpact(detectFiles());
  if (impact.components.web.changed) {
    console.log('Web impact detected. Vercel build will run.');
    process.exit(1);
  }
  console.log('No Web impact detected. Vercel build will be skipped.');
  process.exit(0);
} catch (error) {
  console.log(`Could not calculate Web impact safely: ${error instanceof Error ? error.message : String(error)}`);
  console.log('Vercel build will run.');
  process.exit(1);
}
