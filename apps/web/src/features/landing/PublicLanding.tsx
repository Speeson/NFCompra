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
        <a className="public-landing__brand" href="#inicio"><img className="public-landing__brand-logo" src={logo} alt="NFCompra" /></a>
        <div className="public-landing__links">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#hogares">Hogares</a>
          <a href="#nfc">NFC</a>
        </div>
        <button className="button button--quiet" type="button" onClick={() => onOpenAuth('login')}>Iniciar sesión</button>
      </nav>
    </header>
    <main>
      <section className="public-landing__hero" id="inicio" aria-labelledby="landing-title">
        <div>
          <p className="public-landing__eyebrow">La lista que se mueve contigo</p>
          <h1 id="landing-title">Tu compra, con solo acercar.</h1>
          <p className="public-landing__lead">Organiza lo que hace falta en casa, compártelo y prepara la compra desde cualquier móvil.</p>
          <div className="public-landing__actions">
            <button className="button" type="button" onClick={() => onOpenAuth('register')}>Registrarse</button>
            <button className="button button--secondary" type="button" onClick={() => onOpenAuth('login')}>Iniciar sesión</button>
          </div>
        </div>
        <aside className="public-landing__preview" aria-label="Vista previa de una lista de compra">
          <div className="public-landing__preview-header"><span>Compra de casa</span><span>3 pendientes</span></div>
          <ul>
            <li><span aria-hidden="true">○</span> Leche <small>2 l</small></li>
            <li><span aria-hidden="true">○</span> Tomates <small>1 kg</small></li>
            <li className="is-complete"><span aria-hidden="true">✓</span> Pan integral</li>
          </ul>
        </aside>
      </section>

      <section className="public-landing__section" id="como-funciona" aria-labelledby="benefits-title">
        <p className="public-landing__eyebrow">Pensada para el día a día</p>
        <h2 id="benefits-title">Menos mensajes, más compra hecha.</h2>
        <div className="public-landing__benefits">
          <article><span aria-hidden="true">↗</span><h3>Lista compartida</h3><p>Todos ven qué falta y qué ya está en el carrito.</p></article>
          <article><span aria-hidden="true">✓</span><h3>Compra sin fricción</h3><p>Añade, marca y ordena productos en segundos.</p></article>
          <article id="hogares"><span aria-hidden="true">⌂</span><h3>Para todo el hogar</h3><p>Una lista clara para quienes comparten casa y recados.</p></article>
        </div>
      </section>

      <section className="public-landing__nfc" id="nfc" aria-labelledby="nfc-title">
        <div>
          <p className="public-landing__eyebrow">NFC ya disponible</p>
          <h2 id="nfc-title">NFC listo para tu hogar</h2>
          <p>Las pegatinas NFC ya funcionan: cada una abre el hogar al que está vinculada.</p>
        </div>
        <span className="public-landing__nfc-mark" aria-hidden="true">NFC</span>
      </section>
    </main>
  </div>;
}
