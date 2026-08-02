import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { HouseholdDetailPage, HouseholdsPage } from './HouseholdsPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function respond(url: string): Response {
  if (url.endsWith('/households')) return Response.json({ households: [{ id: 'home-1', name: 'Casa' }] });
  if (url.endsWith('/households/home-1/lists')) return Response.json({ lists: [{ id: 'list-1', householdId: 'home-1', name: 'Compra', isDefault: true, version: 1, createdAt: '', updatedAt: '' }] });
  if (url.endsWith('/households/home-1/members')) return Response.json({ members: [{ userId: 'user-1', name: 'Ana', email: 'ana@example.test', role: 'owner', createdAt: '' }] });
  if (url.endsWith('/households/home-1/invitations')) return Response.json({ invitations: [] });
  return Response.json({ error: { message: 'Ruta inesperada' } }, { status: 404 });
}

function renderPage(node: ReactNode): void { render(<QueryClientProvider client={createWebQueryClient()}>{node}</QueryClientProvider>); }

describe('household route views', () => {
  it('shows a household card and opens its exact detail route', async () => {
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))));
    renderPage(<HouseholdsPage onNavigate={navigate} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir Casa' }));

    expect(navigate).toHaveBeenCalledWith('/households/home-1');
  });

  it('keeps list and member workflows in separate household detail tabs', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))));
    renderPage(<HouseholdDetailPage householdId="home-1" currentUserId="user-1" onNavigate={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeVisible();
    expect(screen.getByText('Compra')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Miembros' }));
    expect(await screen.findByRole('heading', { name: 'Miembros' })).toBeVisible();
  });
});
