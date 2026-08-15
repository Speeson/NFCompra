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
