import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateImpact } from './deploy-impact.mjs';

function impact(files, diffTextByFile = {}) {
  return calculateImpact(files, { diffTextByFile }).components;
}

test('Android Kotlin changed affects Android', () => {
  const result = impact(['apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListScreen.kt']);
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, true);
  assert.equal(result.web.changed, false);
  assert.equal(result.api.changed, false);
});

test('Android README does not affect Android release', () => {
  const result = impact(['apps/android/README.md']);
  assert.equal(result.androidBuild.changed, false);
  assert.equal(result.android.changed, false);
});

test('Android resource changed affects Android', () => {
  const result = impact(['apps/android/app/src/main/res/drawable/splash_logo.png']);
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, true);
});

test('Android build dependency change affects Android', () => {
  const result = impact(['apps/android/feature/auth/build.gradle.kts']);
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, true);
});

test('Android version-only bump does not create another release loop', () => {
  const file = 'apps/android/app/build.gradle.kts';
  const result = impact([file], {
    [file]: `@@\n-        versionCode = 13\n-        versionName = "0.1.12"\n+        versionCode = 14\n+        versionName = "0.1.13"\n`,
  });
  assert.equal(result.androidBuild.changed, false);
  assert.equal(result.android.changed, false);
});

test('Android Gradle cache setting affects build validation but not Android release', () => {
  const file = 'apps/android/gradle.properties';
  const result = impact([file], {
    [file]: `@@\n+org.gradle.caching=true\n`,
  });
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, false);
});

test('Android app-impacting Gradle property affects Android release', () => {
  const file = 'apps/android/gradle.properties';
  const result = impact([file], {
    [file]: `@@\n+android.nonTransitiveRClass=true\n`,
  });
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, true);
});

test('Android release workflow change affects build validation but not Android release', () => {
  const result = impact(['.github/workflows/release-android.yml']);
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, false);
});

test('Android Gradle wrapper executable fix affects build validation but not Android release', () => {
  const result = impact(['apps/android/gradlew']);
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, false);
});

test('Compose screen change affects Android release', () => {
  const result = impact(['apps/android/feature/auth/src/main/java/dev/esgarpe/nfcompra/feature/auth/LoginScreen.kt']);
  assert.equal(result.androidBuild.changed, true);
  assert.equal(result.android.changed, true);
});

test('Web source changed affects only Web', () => {
  const result = impact(['apps/web/src/app/App.tsx']);
  assert.equal(result.web.changed, true);
  assert.equal(result.api.changed, false);
  assert.equal(result.androidBuild.changed, false);
  assert.equal(result.android.changed, false);
});

test('API source changed affects only API', () => {
  const result = impact(['apps/api/src/index.ts']);
  assert.equal(result.api.changed, true);
  assert.equal(result.web.changed, false);
  assert.equal(result.androidBuild.changed, false);
  assert.equal(result.android.changed, false);
});

test('Root package lock affects Web and API workspaces', () => {
  const result = impact(['package-lock.json']);
  assert.equal(result.web.changed, true);
  assert.equal(result.api.changed, true);
  assert.equal(result.androidBuild.changed, false);
  assert.equal(result.android.changed, false);
});

test('Root package scripts-only change does not trigger product deployment', () => {
  const result = impact(['package.json'], {
    'package.json': `@@\n-    "web:test": "npm --workspace @nfcompra/web run test"\n+    "web:test": "npm --workspace @nfcompra/web run test",\n+    "deploy:impact": "node scripts/deploy-impact.mjs"\n`,
  });
  assert.equal(result.web.changed, false);
  assert.equal(result.api.changed, false);
  assert.equal(result.androidBuild.changed, false);
});

test('Docs changed affects no deployable component', () => {
  const result = impact(['docs/deployment.md']);
  assert.equal(result.web.changed, false);
  assert.equal(result.api.changed, false);
  assert.equal(result.androidBuild.changed, false);
  assert.equal(result.android.changed, false);
});

test('Changesets are release metadata and do not trigger deployment loops', () => {
  const result = impact(['.changes/pending/account-deletion.json']);
  assert.equal(result.web.changed, false);
  assert.equal(result.api.changed, false);
  assert.equal(result.androidBuild.changed, false);
  assert.equal(result.android.changed, false);
});
