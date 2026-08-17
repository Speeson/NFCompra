import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildAtomicReleasePushArgs,
  bumpVersion,
  chooseReleaseTarget,
  classifyGitHubPublication,
  generateAndroidReleaseNotes,
  githubRetryDelays,
  isRetryableHttpStatus,
  parseChangeset,
  publishAndroidRelease,
  readAndroidVersion,
  selectAndroidBump,
  validateResumeRelease,
} from './android-release.mjs';

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
    summary: 'Añade la eliminación de cuenta desde Ajustes.',
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
    { category: 'added', summary: 'Añade la eliminación de cuenta desde Ajustes.' },
    { category: 'fixed', summary: 'Corrige la navegación atrás del catálogo.' },
    { category: 'added', summary: 'Añade transferencia de propiedad.', details: ['Mantiene disponibles los hogares compartidos.'] },
  ]);
  assert.match(notes, /NFCompra Android v0\.9\.0/);
  assert.match(notes, /Novedades\n- Añade la eliminación de cuenta desde Ajustes\./);
  assert.match(notes, /  - Mantiene disponibles los hogares compartidos\./);
  assert.match(notes, /Correcciones\n- Corrige la navegación atrás del catálogo\./);
});

test('generates Spanish release note category headings in deterministic order', () => {
  const notes = generateAndroidReleaseNotes('0.9.1', [
    { components: ['android'], category: 'security', summary: 'Refuerza la protección de sesión.' },
    { components: ['android'], category: 'fixed', summary: 'Corrige el acceso a hogares desde Inicio.' },
    { components: ['android'], category: 'added', summary: 'Añade avisos de nueva APK.' },
    { components: ['android'], category: 'removed', summary: 'Elimina una pantalla antigua.' },
    { components: ['android'], category: 'changed', summary: 'Mejora el catálogo y los favoritos.' },
  ]);

  assert.deepEqual(
    [...notes.matchAll(/^(Novedades|Cambios|Correcciones|Eliminado|Seguridad)$/gm)].map((match) => match[1]),
    ['Novedades', 'Cambios', 'Correcciones', 'Eliminado', 'Seguridad'],
  );
  assert.match(notes, /Novedades\n- Añade avisos de nueva APK\./);
  assert.match(notes, /Cambios\n- Mejora el catálogo y los favoritos\./);
  assert.match(notes, /Correcciones\n- Corrige el acceso a hogares desde Inicio\./);
  assert.match(notes, /Eliminado\n- Elimina una pantalla antigua\./);
  assert.match(notes, /Seguridad\n- Refuerza la protección de sesión\./);
});

test('omits empty release note categories and groups multiple entries', () => {
  const notes = generateAndroidReleaseNotes('0.9.2', [
    { category: 'fixed', summary: 'Corrige el botón Acceder.' },
    { category: 'fixed', summary: 'Corrige el fondo de las barras del sistema.', details: ['Conserva los iconos claros.'] },
  ]);

  assert.equal(notes.includes('Novedades'), false);
  assert.equal(notes.includes('Cambios'), false);
  assert.equal(notes.includes('Eliminado'), false);
  assert.equal(notes.includes('Seguridad'), false);
  assert.match(notes, /Correcciones\n- Corrige el botón Acceder\.\n- Corrige el fondo de las barras del sistema\.\n  - Conserva los iconos claros\./);
});

test('release notes preserve Spanish UTF-8 text', () => {
  const notes = generateAndroidReleaseNotes('0.9.3', [
    { category: 'changed', summary: 'Mejora búsqueda, catálogo, sesión y navegación.', details: ['Ajusta contraseñas, notificación y recuperación.'] },
  ]);

  assert.match(notes, /Mejora búsqueda, catálogo, sesión y navegación\./);
  assert.match(notes, /Ajusta contraseñas, notificación y recuperación\./);
});

test('Android release plan keeps Android notes Android-only', () => {
  const notes = generateAndroidReleaseNotes('0.9.4', [
    { components: ['android'], category: 'fixed', summary: 'Corrige la app Android.' },
    { components: ['web'], category: 'added', summary: 'Añade una mejora Web.' },
    { components: ['api'], category: 'security', summary: 'Refuerza la API.' },
  ]);

  assert.match(notes, /Corrige la app Android\./);
  assert.doesNotMatch(notes, /Añade una mejora Web\./);
  assert.doesNotMatch(notes, /Refuerza la API\./);
});

test('fresh release with pending patch changeset calculates the next version', () => {
  const target = chooseReleaseTarget({ currentVersionName: '1.2.3', currentVersionCode: 20, plannedVersion: '1.2.4', existingTags: [] });
  assert.equal(target.action, 'fresh');
  assert.equal(target.versionName, '1.2.4');
  assert.equal(target.versionCode, 21);
});

test('fresh release with existing unrelated older tags still prepares normally', () => {
  const target = chooseReleaseTarget({ currentVersionName: '1.2.3', currentVersionCode: 20, plannedVersion: '1.2.4', existingTags: ['v1.2.3', 'v1.2.2'] });
  assert.equal(target.action, 'fresh');
  assert.equal(target.versionName, '1.2.4');
});

test('existing tag resumes the SAME planned version instead of bumping again', () => {
  const target = chooseReleaseTarget({ currentVersionName: '1.2.3', currentVersionCode: 20, plannedVersion: '1.2.4', existingTags: ['v1.2.4'] });
  assert.equal(target.action, 'resume');
  assert.equal(target.versionName, '1.2.4');
  assert.equal(target.versionCode, null);
});

test('resume never bumps another version even with a forced bump', () => {
  const target = chooseReleaseTarget({ currentVersionName: '1.2.4', currentVersionCode: 21, plannedVersion: null, existingTags: ['v1.2.4'] });
  assert.equal(target.action, 'resume');
  assert.equal(target.versionName, '1.2.4');
});

test('post-bump checkout without pending changesets resumes the current version tag', () => {
  const target = chooseReleaseTarget({ currentVersionName: '1.2.4', currentVersionCode: 21, plannedVersion: null, existingTags: ['v1.2.4'] });
  assert.equal(target.action, 'resume');
  assert.equal(target.versionName, '1.2.4');
});

test('no pending changesets and no existing tag fails safely', () => {
  const target = chooseReleaseTarget({ currentVersionName: '1.2.3', currentVersionCode: 20, plannedVersion: null, existingTags: [] });
  assert.equal(target.action, 'fail');
  assert.match(target.reason, /No pending Android changesets/);
});

test('validate-resume accepts a consistent tagged release', () => {
  const result = validateResumeRelease({
    tagVersion: '1.2.4', gradleVersionName: '1.2.4', gradleVersionCode: 21,
    metadataExists: true, metadataVersionName: '1.2.4', metadataVersionCode: 21, notesExists: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validate-resume fails safely when the tag version does not match the tagged source', () => {
  const result = validateResumeRelease({
    tagVersion: '1.2.4', gradleVersionName: '1.2.5', gradleVersionCode: 22,
    metadataExists: true, metadataVersionName: '1.2.4', metadataVersionCode: 21, notesExists: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /versionName "1\.2\.5"/);
  assert.match(result.errors.join(' '), /version mismatch/);
});

test('validate-resume fails safely when required release metadata is missing', () => {
  const result = validateResumeRelease({
    tagVersion: '1.2.4', gradleVersionName: '1.2.4', gradleVersionCode: 21,
    metadataExists: false, metadataVersionName: null, metadataVersionCode: null, notesExists: false,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /android-v1\.2\.4\.json/);
  assert.match(result.errors.join(' '), /android-v1\.2\.4\.md/);
});

test('classifies GitHub publication state', () => {
  assert.deepEqual(classifyGitHubPublication({ releaseExists: false, assetExists: false }), { action: 'publish' });
  assert.deepEqual(classifyGitHubPublication({ releaseExists: true, assetExists: false }), { action: 'upload-asset' });
  assert.deepEqual(classifyGitHubPublication({ releaseExists: true, assetExists: true }), { action: 'complete' });
});

test('treats transient GitHub HTTP failures as retryable and permanent ones as not', () => {
  for (const status of [500, 502, 503, 504]) assert.equal(isRetryableHttpStatus(status), true);
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(isRetryableHttpStatus(status), false);
});

test('retry delay budget is bounded and finite', () => {
  const delays = githubRetryDelays();
  assert.equal(delays.length, 4);
  assert.deepEqual(delays, [2, 5, 10, 20]);
});

function ghSequence(sequence) {
  let index = 0;
  const calls = [];
  const fn = (args) => {
    calls.push(args.join(' '));
    const step = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    return { ok: step.ok, status: step.ok ? 0 : 1, stdout: step.stdout ?? '', stderr: step.stderr ?? '' };
  };
  return { fn, calls };
}
const ok = (stdout = '') => ({ ok: true, stdout });
const httpError = (status) => ({ ok: false, stderr: `gh: HTTP ${status}: failure` });
const viewAssets = (assets) => ({ id: 1, assets: assets.map((name) => ({ name })) });
const noSleep = async () => undefined;

test('publish treats an existing release with the APK as complete and performs no further calls', async () => {
  const gh = ghSequence([
    ok(JSON.stringify(viewAssets(['NFCompra-release.apk']))),
  ]);
  const logs = [];
  const result = await publishAndroidRelease({ version: '1.2.4', title: 't', notesPath: 'n', apkPath: 'NFCompra-release.apk', run: gh.fn, log: (line) => logs.push(line), sleep: noSleep });
  assert.equal(result.action, 'complete');
  assert.equal(gh.calls.length, 1);
  assert.match(logs.join(' '), /already published/);
});

test('publish creates a missing release then uploads the missing APK', async () => {
  const gh = ghSequence([
    httpError(404),
    ok(JSON.stringify({ id: 1 })),
    ok(JSON.stringify(viewAssets([]))),
    ok('uploaded'),
    ok(JSON.stringify(viewAssets(['NFCompra-release.apk']))),
  ]);
  const result = await publishAndroidRelease({ version: '1.2.4', title: 'NFCompra Android 1.2.4', notesPath: '.changes/releases/android-v1.2.4.md', apkPath: 'NFCompra-release.apk', run: gh.fn, log: () => undefined, sleep: noSleep });
  assert.equal(result.action, 'published');
  assert.match(gh.calls[0], /release view v1\.2\.4 --json id,assets/);
  assert.match(gh.calls[1], /release create v1\.2\.4 --target main --title NFCompra Android 1\.2\.4 --notes-file \.changes\/releases\/android-v1\.2\.4\.md/);
  assert.match(gh.calls[2], /release view v1\.2\.4 --json id,assets/);
  assert.match(gh.calls[3], /release upload v1\.2\.4 NFCompra-release\.apk/);
});

test('publish skips release creation when the release exists and only uploads the missing asset', async () => {
  const gh = ghSequence([
    ok(JSON.stringify(viewAssets([]))),
    ok('uploaded'),
    ok(JSON.stringify(viewAssets(['NFCompra-release.apk']))),
  ]);
  const result = await publishAndroidRelease({ version: '1.2.4', title: 't', notesPath: 'n', apkPath: 'NFCompra-release.apk', run: gh.fn, log: () => undefined, sleep: noSleep });
  assert.equal(result.action, 'published');
  assert.ok(gh.calls.every((call) => !call.includes(' release create ')));
  assert.equal(gh.calls.length, 3);
});

test('publish retries transient 503 responses and succeeds within the bounded budget', async () => {
  const gh = ghSequence([
    httpError(404),
    httpError(503),
    httpError(503),
    ok(JSON.stringify({ id: 1 })),
    ok(JSON.stringify(viewAssets([]))),
    ok('uploaded'),
    ok(JSON.stringify(viewAssets(['NFCompra-release.apk']))),
  ]);
  const sleeps = [];
  const logs = [];
  const result = await publishAndroidRelease({ version: '1.2.4', title: 't', notesPath: 'n', apkPath: 'NFCompra-release.apk', run: gh.fn, log: (line) => logs.push(line), sleep: async (ms) => sleeps.push(ms) });
  assert.equal(result.action, 'published');
  assert.deepEqual(sleeps, [2000, 5000]);
  assert.equal(logs.filter((line) => line.includes('retrying')).length, 2);
});

test('publish fails immediately on a permanent 401 without retrying', async () => {
  const gh = ghSequence([
    httpError(404),
    httpError(401),
    httpError(401),
  ]);
  const sleeps = [];
  await assert.rejects(
    () => publishAndroidRelease({ version: '1.2.4', title: 't', notesPath: 'n', apkPath: 'NFCompra-release.apk', run: gh.fn, log: () => undefined, sleep: async (ms) => sleeps.push(ms) }),
    /\(HTTP 401\)/,
  );
  assert.deepEqual(sleeps, []);
});

test('publish fails with a resumable message after transient retries are exhausted', async () => {
  const gh = ghSequence([
    httpError(404),
    httpError(503),
    httpError(503),
    httpError(503),
    httpError(503),
    httpError(503),
    httpError(503),
  ]);
  const sleeps = [];
  await assert.rejects(
    () => publishAndroidRelease({ version: '1.2.4', title: 't', notesPath: 'n', apkPath: 'NFCompra-release.apk', run: gh.fn, log: () => undefined, sleep: async (ms) => sleeps.push(ms) }),
    /can be safely resumed by re-running the same release workflow/,
  );
  assert.equal(sleeps.length, 4);
});

test('publish retries a transient 503 on the asset upload and still verifies the asset', async () => {
  const gh = ghSequence([
    ok(JSON.stringify(viewAssets([]))),
    httpError(503),
    httpError(503),
    ok('uploaded'),
    ok(JSON.stringify(viewAssets(['NFCompra-release.apk']))),
  ]);
  const sleeps = [];
  const result = await publishAndroidRelease({ version: '1.2.4', title: 't', notesPath: 'n', apkPath: 'NFCompra-release.apk', run: gh.fn, log: () => undefined, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(result.action, 'published');
  assert.deepEqual(sleeps, [2000, 5000]);
});

test('atomic release push publishes main and the tag in one command', () => {
  assert.deepEqual(
    buildAtomicReleasePushArgs({ tagVersion: '1.2.4' }),
    ['push', '--atomic', 'origin', 'HEAD:main', 'refs/tags/v1.2.4'],
  );
});

test('atomic release push never uses force and never splits main and tag pushes', () => {
  const args = buildAtomicReleasePushArgs({ tagVersion: '1.2.4' });
  assert.equal(args[0], 'push');
  assert.equal(args.includes('--atomic'), true);
  assert.equal(args.includes('HEAD:main'), true);
  assert.equal(args.includes('refs/tags/v1.2.4'), true);
  assert.equal(args.includes('--force'), false);
  assert.equal(args.filter((arg) => arg === 'push').length, 1);
});

test('atomic release push requires a tag version', () => {
  assert.throws(() => buildAtomicReleasePushArgs({}), /tagVersion is required/);
});

test('resume and complete release actions never produce a fresh atomic publication action', () => {
  const resume = chooseReleaseTarget({ currentVersionName: '1.2.4', currentVersionCode: 21, plannedVersion: null, existingTags: ['v1.2.4'] });
  const plannedResume = chooseReleaseTarget({ currentVersionName: '1.2.3', currentVersionCode: 20, plannedVersion: '1.2.4', existingTags: ['v1.2.4'] });
  assert.notEqual(resume.action, 'fresh');
  assert.notEqual(plannedResume.action, 'fresh');
});

function workflowFile() {
  return readFileSync(fileURLToPath(new URL('../.github/workflows/release-android.yml', import.meta.url)), 'utf8');
}

function workflowStep(workflow, name) {
  const marker = `- name: ${name}`;
  const index = workflow.indexOf(marker);
  if (index === -1) throw new Error(`Step not found in workflow: ${name}`);
  const rest = workflow.slice(index);
  const next = rest.indexOf('\n      - name:', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

test('fresh release workflow publishes main and the tag atomically via the tested helper', () => {
  const workflow = workflowFile();
  const freshStep = workflowStep(workflow, 'Publish release commit and tag (fresh)');
  assert.match(freshStep, /buildAtomicReleasePushArgs/);
  assert.match(freshStep, /git "\$\{PUSH_ARGS\[@\]\}"/);
  assert.doesNotMatch(freshStep, /git push origin/);
  assert.doesNotMatch(freshStep, /--force/);
});

test('workflow has no sequential main push or standalone tag push', () => {
  const workflow = workflowFile();
  assert.doesNotMatch(workflow, /git push origin HEAD:main/);
  assert.doesNotMatch(workflow, /git push origin "v\$VERSION"/);
  assert.doesNotMatch(workflow, /git push origin v\$VERSION/);
  assert.doesNotMatch(workflow, /git push origin/);
  assert.doesNotMatch(workflow, /--force/);
});

test('resume and GitHub Release publication steps never run git pushes', () => {
  const workflow = workflowFile();
  assert.doesNotMatch(workflowStep(workflow, 'Checkout release source (resume)'), /git push/);
  assert.doesNotMatch(workflowStep(workflow, 'Publish GitHub Release'), /git push/);
});

test('atomic release publication is gated to the fresh action only', () => {
  const workflow = workflowFile();
  const freshStep = workflowStep(workflow, 'Publish release commit and tag (fresh)');
  assert.match(freshStep, /steps\.target\.outputs\.action == 'fresh'/);
});
