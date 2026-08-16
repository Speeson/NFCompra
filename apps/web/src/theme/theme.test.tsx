import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JSX } from 'react';

import { App } from '../app/App';
import { AuthProvider } from '../features/auth/AuthProvider';
import { readStoredTheme, resolveTheme, ThemeProvider, ThemeToggle } from './theme';

function ThemeHarness(): JSX.Element {
  return <div><ThemeToggle /></div>;
}

function renderThemed() {
  return render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
  delete document.documentElement.dataset.theme;
});

describe('theme global', () => {
  it('usa sistema como preferencia por defecto', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it('resuelve la preferencia del sistema mediante prefers-color-scheme', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('aplica el atributo de tema globalmente en el documento', () => {
    renderThemed();
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: /Tema:/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persiste la selección explícita y sobrevive a un nuevo montaje', () => {
    const first = renderThemed();
    fireEvent.click(screen.getByRole('button', { name: /Tema:/ }));
    expect(localStorage.getItem('nfcompra.theme')).toBe('dark');
    first.unmount();

    renderThemed();
    expect(screen.getByRole('button', { name: /Tema: oscuro/ })).toBeVisible();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('vuelve a sistema cuando se cicla de vuelta y no guarda clave extra', () => {
    renderThemed();
    const toggle = screen.getByRole('button', { name: /Tema:/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(localStorage.getItem('nfcompra.theme')).toBeNull();
    expect(localStorage.getItem('nfcompra.landing-theme')).toBeNull();
    expect(screen.getByRole('button', { name: /Tema: sistema/ })).toBeVisible();
  });

  it('migra la preferencia antigua de la landing a la clave global', () => {
    localStorage.setItem('nfcompra.landing-theme', 'dark');
    renderThemed();
    expect(localStorage.getItem('nfcompra.theme')).toBe('dark');
    expect(localStorage.getItem('nfcompra.landing-theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('observa los cambios del sistema y reacciona en tiempo real', async () => {
    let dark = false;
    const listeners: Array<() => void> = [];
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      get matches() { return dark; },
      media: query,
      onchange: null,
      addEventListener: (_type: string, callback: () => void) => listeners.push(callback),
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    })));

    renderThemed();
    expect(document.documentElement.dataset.theme).toBe('light');

    dark = true;
    listeners.forEach((callback) => callback());
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(screen.getByRole('button', { name: /Tema: sistema \(oscuro\)/ })).toBeVisible();
  });

  it('el tema sobrevive a la navegación entre rutas de la aplicación', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} },
    }, { status: 401 })));

    render(<ThemeProvider><AuthProvider><App /></AuthProvider></ThemeProvider>);
    expect(await screen.findByRole('heading', { name: 'NFCompra' })).toBeVisible();

    const toggle = screen.getByRole('button', { name: /Tema:/ });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');

    window.history.pushState({}, '', '/login');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByLabelText('Correo electrónico')).toBeVisible();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('nfcompra.theme')).toBe('dark');
  });
});
