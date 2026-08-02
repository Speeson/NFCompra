import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { NfcPage } from './NfcPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('NfcPage', () => {
  it('shows linked-household guidance without claiming an unavailable management action succeeded', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }] }))));
    render(<QueryClientProvider client={createWebQueryClient()}><NfcPage /></QueryClientProvider>);

    expect(await screen.findByText('Casa')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('La gestión de pegatinas NFC todavía no está disponible');
    expect(screen.queryByText('Pegatina vinculada')).not.toBeInTheDocument();
  });
});
