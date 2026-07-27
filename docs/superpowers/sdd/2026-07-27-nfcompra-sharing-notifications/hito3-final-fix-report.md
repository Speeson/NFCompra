# Informe de correcciones finales de Hito 3A

Fecha: 2026-07-27.

Alcance: solo los tres hallazgos `Important` de la revision final. No se han realizado operaciones remotas, despliegues, cambios de Hito 4 ni persistencia nueva de secretos.

## Resultado por hallazgo

1. Enlace HTTPS de invitacion en Android
   - Causa: el correo construia la ruta publica con `APP_BASE_URL`, pero el manifiesto Android solo declaraba `nfcompra://app/invitations/accept`.
   - Correccion: Android acepta la ruta exacta `https://nfcompra.esgarpe.dev/invitations/accept?token=...` y conserva el esquema personalizado existente. El parser limita esquema, host y ruta, y decodifica el token.
   - Limite deliberado: el filtro HTTPS no usa `android:autoVerify` ni introduce `assetlinks.json`, NFC u otra ampliacion de Hito 4. Android puede mostrar su selector de aplicaciones.

2. Token pendiente durante recreacion de `Activity`
   - Causa: `InvitationTokenHandoff` se creaba como un campo nuevo y solo conservaba el token en esa instancia.
   - Correccion: `MainActivity` restaura y guarda el token pendiente mediante `savedInstanceState`. La aceptacion correcta y la cancelacion llaman a la misma limpieza antes de una recreacion posterior.
   - Seguridad: el token no se escribe en preferencias, ficheros, base de datos ni logs; el `Intent` consumido vuelve a quedar sin `data`.

3. Centro de notificaciones Android
   - Causa: solo habia refresco al entrar/volver a primer plano; ademas, `markRead` se ejecutaba antes de emitir navegacion y no se refrescaban lista/contador despues.
   - Correccion: un polling secuencial de 15 segundos se ejecuta solo con sesion autenticada y ciclo de vida `RESUMED`. El destino se emite antes de marcar como leida; si el marcado falla, la navegacion continua y aparece un aviso global que los refrescos no eliminan hasta que la persona lo cierra. Si funciona, se vuelven a consultar notificaciones y contador.

## TDD: RED

Primero se anadieron pruebas para:

- entregar a Android el token de la URL HTTPS publica;
- restaurar un token pendiente y mantener ausente uno ya limpiado tras recreacion;
- repetir consultas durante el polling activo;
- navegar y publicar un error accionable aunque falle `markRead`;
- refrescar lista y contador tras un `markRead` correcto.

Comando:

```powershell
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :feature:sharing:testDebugUnitTest --tests '*InvitationTokenHandoffTest' --tests '*SharingViewModelTest'
```

Resultado RED observado: fallo de compilacion esperado con referencias inexistentes a `receiveLink`, constructor con estado restaurado, `savedStateToken`, `pollNotifications` y `notificationActionError`.

Una primera ejecucion sin `ANDROID_HOME` fallo antes de compilar por SDK no localizado; se corrigio el entorno y se repitio el comando anterior para obtener el RED funcional.

## TDD: GREEN

Tras la implementacion minima se repitio exactamente el comando RED.

Resultado GREEN observado: `BUILD SUCCESSFUL`; las pruebas objetivo terminaron sin fallos.

La prueba de integracion del enlace de correo se ejecuto con:

```powershell
npm --workspace @nfcompra/api run test -- --run test/shopping-lists.integration.test.ts
```

Resultado: 1 fichero y 17 pruebas superadas. La prueba usa `APP_BASE_URL=https://nfcompra.esgarpe.dev` y comprueba la ruta `/invitations/accept?token=`.

La revision de codigo previa al commit encontro una carrera: un polling correcto podia limpiar el aviso de un `markRead` fallido antes de que se mostrara. Se amplio primero la prueba para refrescar despues del fallo:

```powershell
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :feature:sharing:testDebugUnitTest --tests '*SharingViewModelTest.notification click navigates and exposes a dismissible global error when marking read fails*'
```

Resultado RED observado: 1 prueba ejecutada, 1 fallo en la asercion que esperaba conservar el aviso tras refrescar. Tras limitar la limpieza a `dismissNotificationActionError()`, el mismo comando termino con `BUILD SUCCESSFUL`.

## Verificacion final

Desde la raiz:

```powershell
npm run api:test
npx --workspace @nfcompra/api tsc --noEmit
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
git diff --check
```

Desde `apps/android`:

```powershell
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```

Resultados:

- API: 4 ficheros, 36 pruebas superadas; TypeScript sin errores.
- PWA: 6 ficheros, 31 pruebas superadas; typecheck y build correctos.
- Android: 39 pruebas unitarias en los modulos ejecutados, 0 fallos/errores; pruebas Compose compiladas y APK `debug` ensamblado.
- El manifiesto empaquetado contiene `scheme="https"`, `host="nfcompra.esgarpe.dev"` y `path="/invitations/accept"`.

## Commit local

Unico commit previsto para esta ola:

```text
fix(android): close final Hito 3A review findings
```

Este informe forma parte de ese mismo commit; su SHA exacto se comunica al finalizar, ya que un commit no puede incluir de forma estable su propio hash. No se ejecuta `git push`.
