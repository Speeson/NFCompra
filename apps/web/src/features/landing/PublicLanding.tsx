import type { JSX } from 'react';

import logo from '../../assets/brand/nfcompra-logo.png';

type AuthMode = 'login' | 'register';

interface PublicLandingProps {
  onOpenAuth(mode: AuthMode): void;
}

export function PublicLanding({ onOpenAuth }: PublicLandingProps): JSX.Element {
  return <div className="public-landing">
    <header className="public-landing__header">
      <nav className="public-landing__nav" aria-label="Navegación principal">
        <a className="public-landing__brand" href="#inicio">
          <img className="public-landing__brand-logo" src={logo} alt="NFCompra" />
        </a>
        <div className="public-landing__links">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#hogares">Hogares</a>
          <a href="#catalogo">Catálogo</a>
          <a href="#android">Android</a>
          <a href="#nfc">NFC</a>
        </div>
        <div className="public-landing__access">
          <button className="button button--quiet" type="button" onClick={() => onOpenAuth('login')}>Iniciar sesión</button>
          <button className="button" type="button" onClick={() => onOpenAuth('register')}>Registrarse</button>
        </div>
      </nav>
    </header>

    <main>
      <section className="public-landing__hero public-landing__hero--updated" id="inicio" aria-labelledby="landing-title">
        <div className="public-landing__hero-copy">
          <p className="public-landing__eyebrow">PWA + Android + NFC</p>
          <h1 id="landing-title">Tu compra, con solo acercar.</h1>
          <p className="public-landing__lead">
            NFCompra organiza hogares, listas compartidas, catálogo de supermercado y favoritos para añadir productos más rápido desde la web o desde la app Android.
          </p>
          <div className="public-landing__actions">
            <button className="button" type="button" onClick={() => onOpenAuth('register')}>Registrarse</button>
            <button className="button button--secondary" type="button" onClick={() => onOpenAuth('login')}>Iniciar sesión</button>
          </div>
          <div className="public-landing__badges" aria-label="Funciones principales">
            <span>Catálogo con autocompletado</span>
            <span>Favoritos por usuario</span>
            <span>App Android desarrollada</span>
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
                <span>Mercadona</span>
                <strong>Lista semanal</strong>
              </div>
              <button type="button" aria-label="Cambiar vista">▦</button>
            </div>
            <div className="landing-phone__input">
              <span>Producto</span>
              <strong>Leche</strong>
              <em>− 1 +</em>
            </div>
            <div className="landing-section-preview landing-section-preview--pending">
              <h3>Pendientes</h3>
              <p><span /> Leche <b>2</b></p>
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
          <article><span aria-hidden="true">🔔</span><h3>Notificaciones</h3><p>Consulta invitaciones y avisos desde la campanita sin salir de la pantalla.</p></article>
          <article><span aria-hidden="true">☁</span><h3>Offline-first en Android</h3><p>Room conserva hogares, listas y productos; la cola sincroniza cambios cuando vuelve la conexión.</p></article>
          <article><span aria-hidden="true">📌</span><h3>Lista fijada</h3><p>Ancla una lista habitual para abrirla rápido desde Inicio en modo vista supermercado.</p></article>
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
          <h2 id="android-title">Instalable en móvil real para uso personal.</h2>
          <p>
            La app Android ya tiene login, registro, recuperación por OTP, catálogo, favoritos, modo vista supermercado, listas fijadas y caché local del catálogo para acelerar búsquedas tras el primer uso.
          </p>
        </div>
        <div className="public-landing__android-features">
          <span>Launcher con logo NFCompra</span>
          <span>Navbar flotante</span>
          <span>Cache local por cuenta</span>
          <span>Favoritos sincronizados</span>
        </div>
      </section>

      <section className="public-landing__nfc" id="nfc" aria-labelledby="nfc-title">
        <div>
          <p className="public-landing__eyebrow">NFC ya disponible</p>
          <h2 id="nfc-title">NFC listo para tu hogar</h2>
          <p>Las pegatinas NFC ya funcionan: cada una abre el hogar al que está vinculada. Así puedes entrar directamente en el contexto correcto desde la cocina, la nevera o la zona donde prepares la compra.</p>
        </div>
        <span className="public-landing__nfc-mark" aria-hidden="true">NFC</span>
      </section>
    </main>
  </div>;
}
