# Despliegue inicial de produccion de NFCompra

## Objetivo

Publicar el MVP ya integrado en `main` sin exponer secretos en Git, con la API en Cloudflare Workers/D1 y la PWA en Vercel. Las URL publicas seran `https://api.nfcompra.esgarpe.dev` y `https://nfcompra.esgarpe.dev`.

## Orden de publicacion

1. Preparar la configuracion de produccion del Worker: conservar el enlace D1 `DB`, apuntarlo a `nfcompra-production`, permitir solamente el origen de la PWA y utilizar la URL web publica al crear enlaces de correo.
2. Cambiar el remitente de correo a `NFCompra <no-reply@esgarpe.dev>`, el dominio verificado de Resend. Mantener `JWT_SECRET` y `RESEND_API_KEY` exclusivamente como secretos de Worker.
3. Aplicar todas las migraciones D1 y desplegar el Worker. Comprobar primero `GET /health` en la URL temporal generada por Cloudflare.
4. Asociar el dominio personalizado `api.nfcompra.esgarpe.dev`, volver a comprobar salud y las cabeceras CORS desde el origen web definitivo.
5. Crear un proyecto Vercel cuyo directorio raiz es `apps/web`. Su variable de compilacion `VITE_API_BASE_URL` apuntara a `https://api.nfcompra.esgarpe.dev/v1`; por eso el navegador conserva el flujo de sesion con `credentials: include` y el Worker permite su origen explicito.
6. Asociar `nfcompra.esgarpe.dev` al proyecto Vercel. Despues de una compilacion valida, probar registro, correo de verificacion, inicio de sesion, hogar, lista, invitacion y notificaciones.

## Componentes y configuracion

- **D1**: ya creada como `nfcompra-production` en WEUR. El Worker usara el binding existente `DB`; el identificador de produccion solo se escribira en la configuracion de Wrangler, no es un secreto.
- **Worker**: se conserva el nombre `nfcompra-api`. Las variables no secretas seran `APP_BASE_URL=https://nfcompra.esgarpe.dev` y `ALLOWED_ORIGINS=https://nfcompra.esgarpe.dev`.
- **Secretos**: `JWT_SECRET` y `RESEND_API_KEY` se cargaran con `wrangler secret put`; no se guardaran en archivos, documentacion ni comandos que impriman sus valores.
- **PWA**: en produccion el cliente sustituye su base local `/v1` por `VITE_API_BASE_URL=https://api.nfcompra.esgarpe.dev/v1`. En desarrollo no cambia el proxy de Vite existente.
- **DNS**: se usaran los registros o vinculaciones exactas que presenten Cloudflare y Vercel. No se borraran registros existentes de otras aplicaciones.

## Verificacion y reversibilidad

Antes de cada dominio publico se verifican Worker, migraciones y build. Una migracion D1 solo se ejecuta una vez y no se revertira automaticamente; cualquier correccion se realizara mediante una nueva migracion. Si la PWA falla, se conserva el ultimo despliegue estable de Vercel y no se modifica D1. Si el envio de correo falla, la API devolvera su error de entrega existente sin revelar secretos.

## Fuera de alcance

NFC, App Links verificados, push, publicacion en tiendas y distribucion de APK no forman parte de este despliegue inicial. Se trataran en el Hito 4 despues de que la aplicacion web y la API esten estables en produccion.
