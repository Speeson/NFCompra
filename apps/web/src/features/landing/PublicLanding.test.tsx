import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../app/App';
import { AuthProvider } from '../auth/AuthProvider';
import { PublicLanding } from './PublicLanding';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('la landing pública', () => {
  it('muestra la propuesta de compra NFC a visitantes anónimos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} },
    }, { status: 401 })));

    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Tu compra, con solo acercar.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'NFCompra' })).toHaveAttribute('href', '#inicio');
    expect(screen.getByRole('link', { name: 'Cómo funciona' })).toHaveAttribute('href', '#como-funciona');
    expect(screen.getByRole('link', { name: 'Hogares' })).toHaveAttribute('href', '#hogares');
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '#catalogo');
    expect(screen.getByRole('link', { name: 'Android' })).toHaveAttribute('href', '#android');
    expect(screen.getByRole('link', { name: 'NFC' })).toHaveAttribute('href', '#nfc');
    expect(screen.getByText('Lista compartida')).toBeVisible();
    expect(screen.getByText('Compra sin fricción')).toBeVisible();
    expect(screen.getByText('Para todo el hogar')).toBeVisible();
    expect(screen.getByText('Favoritos por usuario')).toBeVisible();
    expect(screen.getByText('App Android desarrollada')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Iniciar sesión' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Registrarse' })).toHaveLength(2);
  });

  it('explica que las pegatinas NFC abren el hogar al que están vinculadas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} },
    }, { status: 401 })));

    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'NFC listo para tu hogar' })).toBeVisible();
    expect(screen.getByText(/Las pegatinas NFC ya funcionan: cada una abre el hogar al que está vinculada/)).toBeVisible();
  });

  it('menciona catálogo, favoritos y Android', () => {
    const onOpenAuth = vi.fn();
    render(<PublicLanding onOpenAuth={onOpenAuth} />);

    expect(screen.getByRole('heading', { name: 'Productos, categorías y favoritos para buscar menos.' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Instalable en móvil real para uso personal.' })).toBeVisible();
    expect(screen.getByText('Favoritos sincronizados')).toBeVisible();
  });

  it('entrega el modo de autenticación elegido a la aplicación', () => {
    const onOpenAuth = vi.fn();
    render(<PublicLanding onOpenAuth={onOpenAuth} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Registrarse' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Iniciar sesión' })[0]);

    expect(onOpenAuth).toHaveBeenNthCalledWith(1, 'register');
    expect(onOpenAuth).toHaveBeenNthCalledWith(2, 'login');
  });
});
