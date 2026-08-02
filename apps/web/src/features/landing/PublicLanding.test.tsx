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
    expect(screen.getByRole('link', { name: 'NFC' })).toHaveAttribute('href', '#nfc');
    expect(screen.getByText('Lista compartida')).toBeVisible();
    expect(screen.getByText('Compra sin fricción')).toBeVisible();
    expect(screen.getByText('Para todo el hogar')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Iniciar sesión' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeVisible();
  });

  it('presenta NFC como una capacidad próxima', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} },
    }, { status: 401 })));

    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'NFC, muy pronto' })).toBeVisible();
    expect(screen.getByText(/Estamos preparando NFC para que añadas productos con solo acercar tu móvil/i)).toBeVisible();
  });

  it('entrega el modo de autenticación elegido a la aplicación', () => {
    const onOpenAuth = vi.fn();
    render(<PublicLanding onOpenAuth={onOpenAuth} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Iniciar sesión' })[0]);

    expect(onOpenAuth).toHaveBeenNthCalledWith(1, 'register');
    expect(onOpenAuth).toHaveBeenNthCalledWith(2, 'login');
  });
});
