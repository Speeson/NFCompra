import { useEffect, useMemo, useState, type JSX } from 'react';

import logo from '../../assets/brand/nfcompra-logo.png';

type AuthMode = 'login' | 'register';
type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface PublicLandingProps {
  onOpenAuth(mode: AuthMode): void;
}

const themeStorageKey = 'nfcompra.landing-theme';
const themeOptions: ThemePreference[] = ['system', 'dark', 'light'];

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function PublicLanding({ onOpenAuth }: PublicLandingProps): JSX.Element {
  const [themePreference, setThemePreference] = useState(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveTheme('system'));
  const theme = themePreference === 'system' ? systemTheme : themePreference;
  const nextThemePreference = useMemo(() => themeOptions[(themeOptions.indexOf(themePreference) + 1) % themeOptions.length], [themePreference]);
  const themeLabel = themePreference === 'system' ? `Tema: sistema (${theme === 'dark' ? 'oscuro' : 'claro'})` : `Tema: ${themePreference === 'dark' ? 'oscuro' : 'claro'}`;
  const themeIcon = themePreference === 'system' ? '◐' : themePreference === 'dark' ? '☾' : '☀';

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const updateTheme = () => setSystemTheme(media.matches ? 'dark' : 'light');
    updateTheme();
    media.addEventListener('change', updateTheme);
    return () => media.removeEventListener('change', updateTheme);
  }, []);

  useEffect(() => {
    try {
      if (themePreference === 'system') localStorage.removeItem(themeStorageKey);
      else localStorage.setItem(themeStorageKey, themePreference);
    } catch {
      // Ignore private browsing storage failures; theme still works for the session.
    }
  }, [themePreference]);

  function cycleTheme(): void {
    setThemePreference(nextThemePreference);
  }

  return <div className="public-landing" data-theme={theme}>
    <header className="public-landing__header">
      <nav className="public-landing__nav" aria-label="Navegación principal">
        <a className="public-landing__brand" href="#inicio">
          <img className="public-landing__brand-logo" src={logo} alt="NFCompra" />
        </a>
        <div className="public-landing__links">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#hogares">Hogares</a>
          <a href="#web">Aplicación web</a>
          <a href="#catalogo">Catálogo</a>
          <a href="#android">Android</a>
          <a href="#nfc">NFC</a>
        </div>
        <div className="public-landing__access">
          <button className="public-landing__theme-toggle" type="button" aria-label={`${themeLabel}. Cambiar a ${nextThemePreference === 'system' ? 'sistema' : nextThemePreference === 'dark' ? 'oscuro' : 'claro'}`} title={themeLabel} onClick={cycleTheme}>
            <span aria-hidden="true">{themeIcon}</span>
          </button>
          <button className="button button--quiet" type="button" onClick={() => onOpenAuth('login')}>Iniciar sesión</button>
          <button className="button" type="button" onClick={() => onOpenAuth('register')}>Registrarse</button>
        </div>
      </nav>
    </header>

    <main>
      <section className="public-landing__hero public-landing__hero--updated" id="inicio" aria-labelledby="landing-title">
        <div className="public-landing__hero-copy">
          <p className="public-landing__eyebrow">PWA + Android + NFC</p>
          <h1 id="landing-title">NFCompra</h1>
          <p className="public-landing__lead">
            Hogares, listas compartidas, catálogo, favoritos y pegatinas NFC para abrir la compra correcta desde Android, iPhone o navegador.
          </p>
          <div className="public-landing__badges" aria-label="Funciones principales">
            <span>App Link NFC con fallback web</span>
            <span>Favoritos por usuario</span>
            <span>APK con avisos de actualización</span>
          </div>
        </div>

        <aside className="public-landing__device-stage" aria-label="Vista previa de NFCompra">
          <div className="landing-phone landing-phone--web">
            <div className="landing-phone__topbar">
              <img src={logo} alt="" />
              <span>NFCompra</span>
              <b aria-hidden="true">🔔</b>
            </div>
            <div className="landing-phone__card landing-phone__card--list">
              <div>
                <span>Casa</span>
                <strong>Compra semanal</strong>
              </div>
              <button type="button" aria-label="Cambiar vista">▦</button>
            </div>
            <div className="landing-phone__input">
              <span>Producto</span>
              <strong>Leche entera</strong>
              <em>− 1 +</em>
            </div>
            <div className="landing-section-preview landing-section-preview--pending">
              <h3>Pendientes</h3>
              <p><span /> Leche entera <b>2</b></p>
              <p><span /> Queso rallado <b>1</b></p>
              <p><span /> Tomate frito <b>3</b></p>
            </div>
            <div className="landing-section-preview landing-section-preview--checked">
              <h3>Comprados</h3>
              <p><span>✓</span> Pan integral <b>1</b></p>
            </div>
          </div>

          <div className="landing-phone landing-phone--android">
            <div className="landing-phone__catalog-title">
              <span>Catálogo</span>
              <button type="button" aria-label="Notificaciones">🔔</button>
            </div>
            <div className="landing-search">Buscar productos</div>
            <div className="landing-favorites-card"><span>★</span><strong>Favoritos</strong></div>
            <div className="landing-nfc-chip">Código NFC: https://nfcompra.esgarpe.dev/household/...</div>
            <div className="landing-category-grid">
              <article><span>🥛</span><strong>Leche y huevos</strong></article>
              <article><span>🍎</span><strong>Fruta</strong></article>
              <article><span>🥖</span><strong>Panadería</strong></article>
              <article><span>🥤</span><strong>Bebidas</strong></article>
            </div>
            <div className="landing-bottom-nav">
              <span>Inicio</span>
              <span>Listas</span>
              <strong>Catálogo</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="public-landing__section" id="como-funciona" aria-labelledby="benefits-title">
        <p className="public-landing__eyebrow">Pensada para el día a día</p>
        <h2 id="benefits-title">Menos mensajes, más compra hecha.</h2>
        <div className="public-landing__benefits public-landing__benefits--six">
          <article><span aria-hidden="true">↗</span><h3>Lista compartida</h3><p>Todos ven qué falta y qué ya está comprado en tiempo real.</p></article>
          <article><span aria-hidden="true">✓</span><h3>Compra sin fricción</h3><p>Añade, marca, edita cantidades y vacía listas cuando termines la compra.</p></article>
          <article id="hogares"><span aria-hidden="true">⌂</span><h3>Para todo el hogar</h3><p>Crea varios hogares y varias listas por hogar para organizar supermercados o recados distintos.</p></article>
          <article><span aria-hidden="true">🔔</span><h3>Notificaciones</h3><p>Abre avisos, acepta invitaciones, marca como leídas o elimina todas desde la campanita.</p></article>
          <article><span aria-hidden="true">☁</span><h3>Offline en Android</h3><p>La app Android conserva datos locales y sincroniza cambios pendientes cuando vuelve la conexión.</p></article>
          <article><span aria-hidden="true">★</span><h3>Catálogo y favoritos</h3><p>Busca productos con tarjetas visuales y guarda favoritos para repetir compras habituales.</p></article>
        </div>
      </section>

      <section className="public-landing__webapp" id="web" aria-labelledby="webapp-title">
        <div className="public-landing__webapp-copy">
          <p className="public-landing__eyebrow">Aplicación web instalable</p>
          <h2 id="webapp-title">La web también funciona como aplicación.</h2>
          <p>
            En iPhone y ordenador puedes usar NFCompra desde el navegador como aplicación web: iniciar sesión, crear hogares, revisar listas, añadir productos con catálogo y gestionar invitaciones sin instalar nada desde una tienda.
          </p>
          <div className="public-landing__webapp-features">
            <span>Acceso desde iPhone</span>
            <span>Panel de hogares</span>
            <span>Catálogo y favoritos</span>
            <span>NFC como fallback web</span>
          </div>
        </div>
        <div className="landing-web-gallery" aria-label="Vistas de la aplicación web NFCompra">
          <article className="landing-browser landing-browser--dashboard">
            <div className="landing-browser__bar">
              <span />
              <span />
              <span />
              <strong>nfcompra.esgarpe.dev</strong>
            </div>
            <div className="landing-browser__header">
              <img src={logo} alt="" />
              <nav><b>Inicio</b><span>Hogares</span><span>Listas</span><span>Catálogo</span></nav>
              <button type="button" aria-label="Notificaciones">🔔</button>
            </div>
            <div className="landing-web-dashboard">
              <div className="landing-web-dashboard__welcome">
                <span>Hola, Esteban</span>
                <strong>Acciones rápidas arriba</strong>
              </div>
              <div className="landing-web-stats">
                <span><b>2</b> hogares</span>
                <span><b>5</b> listas</span>
                <span><b>3</b> pendientes</span>
              </div>
              <div className="landing-web-actions">
                <button type="button">Crear hogar</button>
                <button type="button">Abrir catálogo</button>
              </div>
            </div>
          </article>

          <article className="landing-browser landing-browser--lists">
            <div className="landing-browser__bar">
              <span />
              <span />
              <span />
              <strong>Listas activas</strong>
            </div>
            <div className="landing-web-listcards">
              <h3>Listas por hogar</h3>
              <div className="landing-web-listcard">
                <strong>Mercadona</strong>
                <span>Costa Marina III</span>
                <p><b>6</b> pendientes <b>3</b> comprados</p>
                <button type="button">Abrir lista</button>
              </div>
              <div className="landing-web-listcard landing-web-listcard--alt">
                <strong>Farmacia</strong>
                <span>Sevilla la Nueva</span>
                <p><b>2</b> pendientes <b>0</b> comprados</p>
                <button type="button">Ver lista</button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="public-landing__showcase" id="catalogo" aria-labelledby="catalog-title">
        <div>
          <p className="public-landing__eyebrow">Catálogo propio</p>
          <h2 id="catalog-title">Productos, categorías y favoritos para buscar menos.</h2>
          <p>
            El catálogo incluye categorías reales de supermercado, autocompletado, modo lista y modo tarjetas. Los favoritos aparecen primero en las búsquedas para repetir productos habituales sin perder tiempo.
          </p>
        </div>
        <div className="landing-catalog-panel" aria-label="Vista previa de catálogo y favoritos">
          <div className="landing-catalog-panel__search">Buscar: tomate</div>
          <article className="landing-product-card is-favorite"><span>★</span><strong>Tomate frito</strong><small>Favorito</small><b>+ 2 −</b></article>
          <article className="landing-product-card"><span>☆</span><strong>Tomate natural</strong><small>Verduras</small><b>+ 1 −</b></article>
          <article className="landing-product-card"><span>☆</span><strong>Salsa de tomate</strong><small>Aceite y salsas</small><b>+ 1 −</b></article>
        </div>
      </section>

      <section className="public-landing__android" id="android" aria-labelledby="android-title">
        <div className="public-landing__android-copy">
          <p className="public-landing__eyebrow">App Android ya desarrollada</p>
          <h2 id="android-title">La app Android lista para comprar, entrar y actualizar.</h2>
          <p>
            Inicia sesión, crea tu cuenta o recupera el acceso por OTP. Después puedes entrar con biometría, abrir hogares desde NFC, usar catálogo y favoritos sincronizados y recibir avisos cuando haya una nueva APK publicada.
          </p>
        </div>
        <div className="public-landing__android-panel">
          <div className="public-landing__android-features">
            <span>Login, registro y recuperación OTP</span>
            <span>Biometría opcional</span>
            <span>NFC al hogar correcto</span>
            <span>Catálogo y favoritos sincronizados</span>
          </div>
          <div className="landing-android-strip" aria-label="Vistas de la app Android">
            <article className="landing-android-screen landing-android-screen--auth">
              <div className="landing-android-screen__status"><span>9:41</span><span>5G</span></div>
              <img src={logo} alt="" />
              <strong>NFCompra</strong>
              <span className="landing-android-strip__primary">Iniciar sesión</span>
              <span>Crear cuenta</span>
              <small>Biometría opcional</small>
            </article>
            <article className="landing-android-screen landing-android-screen--catalog">
              <div className="landing-android-screen__status"><span>9:41</span><span>WiFi</span></div>
              <strong>Catálogo</strong>
              <span>Favoritos primero</span>
              <div className="landing-android-product is-favorite"><b>★</b><div><strong>Tomate frito</strong><small>Favorito</small></div></div>
              <div className="landing-android-product"><b>☆</b><div><strong>Leche entera</strong><small>Lácteos</small></div></div>
              <div className="landing-android-update">Nueva APK disponible</div>
            </article>
            <article className="landing-android-screen landing-android-screen--nfc">
              <div className="landing-android-screen__status"><span>9:41</span><span>NFC</span></div>
              <strong>Compra semanal</strong>
              <span>Casa principal</span>
              <p>Pendientes</p>
              <em>☐ Leche 2</em>
              <em>☐ Tomate frito 3</em>
              <p>Comprados</p>
              <em className="is-checked">☑ Pan integral 1</em>
            </article>
          </div>
        </div>
      </section>

      <section className="public-landing__nfc" id="nfc" aria-labelledby="nfc-title">
        <div>
          <p className="public-landing__eyebrow">NFC ya disponible</p>
          <h2 id="nfc-title">NFC listo para tu hogar</h2>
          <p>Las pegatinas NFC usan un enlace HTTPS del hogar. En Android pueden abrir la app instalada; si no está instalada o se usa iPhone, abren la versión web en el mismo hogar.</p>
        </div>
        <span className="public-landing__nfc-mark" aria-hidden="true">NFC</span>
      </section>
    </main>
  </div>;
}
