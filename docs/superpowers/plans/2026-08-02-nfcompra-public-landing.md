# NFCompra Public Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la entrada anónima por una landing compacta Fresco + NFC con modales accesibles de inicio de sesión y registro.

**Architecture:** `AppRoute` mantiene las rutas de enlace existentes y añade un estado de modal solo para la landing raíz anónima. Los formularios conservan sus llamadas a `useSession`; los nuevos componentes solo cambian su contenedor y presentación. El sistema de tokens pasa de azul a verde bosque y lima eléctrica.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library y CSS propio.

## Global Constraints

- No cambiar API, D1 ni los campos de registro en este hito.
- No afirmar que NFC ya está operativo; comunicarlo como capacidad próxima.
- Las rutas de verificación, recuperación, restablecimiento e invitaciones no cambian.
- Los modales son accesibles: diálogo etiquetado, Escape, cierre explícito y retorno de foco.
- No subir, desplegar ni crear PR sin autorización expresa.
- Actualizar README solo tras verificación real.

---

### Task 1: Landing anónima y sistema visual Fresco + NFC

**Files:**
- Create: `apps/web/src/features/landing/PublicLanding.tsx`
- Create: `apps/web/src/features/landing/PublicLanding.test.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `onOpenAuth(mode: 'login' | 'register'): void` de `PublicLanding`.
- Produces: una entrada anónima con navbar, hero, preview de lista, tres beneficios y sección NFC, más los disparadores de modal.

- [ ] **Step 1: Escribir pruebas de landing que fallen**
  - Renderizar `App` anónima y exigir marca NFCompra, enlaces Cómo funciona/Hogares/NFC, headline «Tu compra, con solo acercar.», tres beneficios y botones de acceso.
  - Comprobar que el enlace NFC describe la capacidad futura sin decir que ya está activa.
  - Ejecutar: `npm --workspace @nfcompra/web run test -- PublicLanding.test.tsx`.
  - Esperado: fallo porque la ruta anónima muestra actualmente `LoginPage`.

- [ ] **Step 2: Implementar la estructura mínima**
  - Crear `PublicLanding` semántico con `header/nav/main/section`, IDs para scroll y contenido exacto aprobado.
  - En `AppRoute`, si el estado es anónimo y la ruta es `/`, mostrar la landing en vez de `LoginPage`; conservar `/login` y `/register` como rutas directas.
  - Cambiar tokens a verde bosque `#10271e`, verde principal `#1c7144`, lima `#dcff72`, página `#f8fcf9`; crear estilos responsivos sin dependencias nuevas.

- [ ] **Step 3: Verificar**
  - Ejecutar la prueba dirigida y `npm --workspace @nfcompra/web run typecheck`.
  - Esperado: verde.

- [ ] **Step 4: Commit local**
  - Ejecutar `git diff --check`.
  - Commit: `feat(web): add public NFC landing`.

### Task 2: Modales de autenticación y preservación de rutas

**Files:**
- Create: `apps/web/src/features/auth/AuthModal.tsx`
- Modify: `apps/web/src/features/auth/LoginPage.tsx`
- Modify: `apps/web/src/features/auth/RegisterPage.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/features/auth/auth.test.tsx`
- Modify: `README.md`

**Interfaces:**
- `AuthModal({ mode, onClose, onSwitch }): JSX.Element` contiene las variantes reutilizables de login/registro.
- `LoginPage` y `RegisterPage` continúan funcionando para rutas directas, sin duplicar la lógica de `useSession`.

- [ ] **Step 1: Escribir pruebas RED de interacción**
  - Pulsar «Iniciar sesión» y comprobar un `role="dialog"` etiquetado con email, contraseña y cierre.
  - Pulsar «Crear cuenta», comprobar formulario actual (nombre, email, contraseña), cambiar entre modos, cerrar con Escape y confirmar que el foco vuelve al botón inicial.
  - Confirmar que `/auth/verify`, `/auth/reset-password`, `/auth/forgot-password` e invitaciones siguen mostrando sus pantallas.
  - Ejecutar las pruebas dirigidas y confirmar fallo.

- [ ] **Step 2: Implementar modal accesible y reutilizar formularios**
  - Extraer contenidos de login y registro a componentes reutilizables que reciban navegación/cierre, sin cambiar payloads API.
  - Implementar overlay, `role="dialog"`, `aria-modal`, título asociado, botón cerrar, Escape y retorno de foco.
  - Mantener los enlaces de recuperación y reenvío como navegación a sus rutas existentes.

- [ ] **Step 3: Ejecutar toda la verificación web**
  - Ejecutar:
```powershell
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
```
  - Esperado: pruebas, tipos y build correctos.

- [ ] **Step 4: Documentar y commit local**
  - Actualizar README solo si los comandos anteriores pasan, indicando landing pública, modales y rutas conservadas.
  - Ejecutar `git diff --check`.
  - Commit: `feat(web): add modal authentication landing`.

### Task 3: Revisión de integración visual

**Files:**
- Modify: `README.md` solo si hace falta corregir documentación verificada.

- [ ] **Step 1: Revisar manualmente en desarrollo**
  - Ejecutar `npm run web:dev` con la API local disponible.
  - Confirmar la landing a ancho móvil y escritorio, navegación por teclado, modales, enlaces de contraseña y regreso del foco.

- [ ] **Step 2: Comprobación final**
  - Repetir pruebas, tipos, build y `git diff --check`.
  - No desplegar: dejar cualquier publicación posterior para una autorización separada.

- [ ] **Step 3: Commit local si hay cambios documentados**
  - Crear un commit únicamente si la revisión exige una corrección rastreable.

