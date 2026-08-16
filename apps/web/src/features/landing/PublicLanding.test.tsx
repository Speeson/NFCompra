import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../app/App';
import { AuthProvider } from '../auth/AuthProvider';
import { ThemeProvider } from '../../theme/theme';
import { PublicLanding } from './PublicLanding';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
  delete document.documentElement.dataset.theme;
});

describe('la landing pública', () => {
  it('muestra la propuesta de compra NFC a visitantes anónimos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} },
    }, { status: 401 })));

    render(<ThemeProvider><AuthProvider><App /></AuthProvider></ThemeProvider>);

    expect(await screen.findByRole('heading', { name: 'NFCompra' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'NFCompra' })).toHaveAttribute('href', '#inicio');
    expect(screen.getByRole('link', { name: 'Cómo funciona' })).toHaveAttribute('href', '#como-funciona');
    expect(screen.getByRole('link', { name: 'Hogares' })).toHaveAttribute('href', '#hogares');
    expect(screen.getByRole('link', { name: 'Aplicación web' })).toHaveAttribute('href', '#web');
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '#catalogo');
    expect(screen.getByRole('link', { name: 'Android' })).toHaveAttribute('href', '#android');
    expect(screen.getByRole('link', { name: 'NFC' })).toHaveAttribute('href', '#nfc');
    expect(screen.getByText('Lista compartida')).toBeVisible();
    expect(screen.getByText('Compra sin fricción')).toBeVisible();
    expect(screen.getByText('Para todo el hogar')).toBeVisible();
    expect(screen.getByText('Favoritos por usuario')).toBeVisible();
    expect(screen.getByText('APK con avisos de actualización')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Iniciar sesión' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Registrarse' })).toHaveLength(1);
  });

  it('explica que las pegatinas NFC abren el hogar al que están vinculadas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} },
    }, { status: 401 })));

    render(<ThemeProvider><AuthProvider><App /></AuthProvider></ThemeProvider>);

    expect(await screen.findByRole('heading', { name: 'NFC listo para tu hogar' })).toBeVisible();
    expect(screen.getByText(/Las pegatinas NFC usan un enlace HTTPS del hogar/)).toBeVisible();
  });

  it('menciona catálogo, favoritos y Android', () => {
    const onOpenAuth = vi.fn();
    render(<ThemeProvider><PublicLanding onOpenAuth={onOpenAuth} /></ThemeProvider>);

    expect(screen.getByRole('heading', { name: 'La web también funciona como aplicación.' })).toBeVisible();
    expect(screen.getByText('Acceso desde iPhone')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Productos, categorías y favoritos para buscar menos.' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'La app Android lista para comprar, entrar y actualizar.' })).toBeVisible();
    expect(screen.getByText('Catálogo y favoritos sincronizados')).toBeVisible();
    expect(screen.getAllByText('Biometría opcional')).toHaveLength(2);
    expect(screen.getByText('Nueva APK disponible')).toBeVisible();
  });

  it('tiene sistema como tema por defecto y lo aplica globalmente', () => {
    render(<ThemeProvider><PublicLanding onOpenAuth={vi.fn()} /></ThemeProvider>);

    const toggle = screen.getByRole('button', { name: /Tema:/ });
    expect(toggle).toHaveAttribute('aria-label', expect.stringContaining('Tema: sistema'));
    expect(toggle).toHaveAttribute('aria-label', expect.stringContaining('Cambiar a oscuro'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('permite alternar, persistir y aplicar el tema explícito', () => {
    render(<ThemeProvider><PublicLanding onOpenAuth={vi.fn()} /></ThemeProvider>);

    const toggle = screen.getByRole('button', { name: /Tema:/ });
    fireEvent.click(toggle);

    expect(localStorage.getItem('nfcompra.theme')).toBe('dark');
    expect(localStorage.getItem('nfcompra.landing-theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: /Tema: oscuro/ })).toBeVisible();

    fireEvent.click(toggle);
    expect(localStorage.getItem('nfcompra.theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: /Tema: claro/ })).toBeVisible();

    fireEvent.click(toggle);
    expect(localStorage.getItem('nfcompra.theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('migra la preferencia de tema de la antigua landing a la clave global', () => {
    localStorage.setItem('nfcompra.landing-theme', 'dark');
    render(<ThemeProvider><PublicLanding onOpenAuth={vi.fn()} /></ThemeProvider>);

    expect(localStorage.getItem('nfcompra.theme')).toBe('dark');
    expect(localStorage.getItem('nfcompra.landing-theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('sigue la preferencia del sistema a través de prefers-color-scheme', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
    }));
    render(<ThemeProvider><PublicLanding onOpenAuth={vi.fn()} /></ThemeProvider>);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: /Tema: sistema \(oscuro\)/ })).toBeVisible();
  });

  it('entrega el modo de autenticación elegido a la aplicación', () => {
    const onOpenAuth = vi.fn();
    render(<ThemeProvider><PublicLanding onOpenAuth={onOpenAuth} /></ThemeProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Registrarse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(onOpenAuth).toHaveBeenNthCalledWith(1, 'register');
    expect(onOpenAuth).toHaveBeenNthCalledWith(2, 'login');
  });
});
