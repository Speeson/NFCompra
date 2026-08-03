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
  it('creates a household from the households page and opens it', async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households') && init?.method === 'POST') return Promise.resolve(Response.json({ household: { id: 'home-2', name: 'Piso' } }));
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [] }));
      throw new Error(`Ruta inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<HouseholdsPage onNavigate={navigate} startCreating />);

    fireEvent.change(await screen.findByLabelText('Nombre del nuevo hogar'), { target: { value: 'Piso' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear hogar' }));

    expect(await screen.findByText('Piso')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/households$/), expect.objectContaining({ method: 'POST' }));
    expect(navigate).toHaveBeenCalledWith('/households/home-2');
  });

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

  it('connects tabs to their panels and supports roving keyboard navigation', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))));
    renderPage(<HouseholdDetailPage householdId="home-1" currentUserId="user-1" onNavigate={vi.fn()} />);

    const listsTab = await screen.findByRole('tab', { name: 'Listas' });
    const membersTab = screen.getByRole('tab', { name: 'Miembros' });
    expect(listsTab).toHaveAttribute('aria-controls', 'household-home-1-lists-panel');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', listsTab.id);
    fireEvent.keyDown(listsTab, { key: 'ArrowRight' });
    expect(membersTab).toHaveFocus();
    expect(membersTab).toHaveAttribute('aria-selected', 'true');
    expect(membersTab).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(membersTab, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'NFC' })).toHaveFocus();
  });
});
