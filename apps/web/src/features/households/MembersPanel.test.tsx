import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { MembersPanel } from './MembersPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('MembersPanel', () => {
  it('lets an owner invite people and manage pending invitations and members', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households/home-1/members')) return Promise.resolve(Response.json({ members: [
        { userId: 'owner-1', name: 'Ana', email: 'ana@example.test', role: 'owner', createdAt: '2026-07-27T00:00:00.000Z' },
        { userId: 'member-1', name: 'Bea', email: 'bea@example.test', role: 'member', createdAt: '2026-07-27T00:00:00.000Z' },
      ] }));
      if (url.endsWith('/households/home-1/invitations') && init?.method === 'POST') return Promise.resolve(Response.json({ invitation: { id: 'invite-2', householdId: 'home-1', email: 'cora@example.test', status: 'pending', expiresAt: '2026-08-03T00:00:00.000Z', invitedBy: 'owner-1', createdAt: '2026-07-27T00:00:00.000Z' } }, { status: 201 }));
      if (url.endsWith('/households/home-1/invitations')) return Promise.resolve(Response.json({ invitations: [{ id: 'invite-1', householdId: 'home-1', email: 'cora@example.test', status: 'pending', expiresAt: '2026-08-03T00:00:00.000Z', invitedBy: 'owner-1', createdAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/households/home-1/invitations/invite-1') && init?.method === 'DELETE') return Promise.resolve(Response.json({ status: 'revoked' }));
      if (url.endsWith('/households/home-1/members/member-1') && init?.method === 'DELETE') return Promise.resolve(Response.json({ status: 'removed' }));
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QueryClientProvider client={createWebQueryClient()}><MembersPanel householdId="home-1" currentUserId="owner-1" /></QueryClientProvider>);

    const ownerSection = await screen.findByRole('region', { name: 'Dueno' });
    const memberSection = screen.getByRole('region', { name: 'Miembros' });
    expect(within(ownerSection).getByText('Ana')).toBeVisible();
    expect(within(ownerSection).getByText('ana@example.test')).toBeVisible();
    expect(within(memberSection).getByText('Bea')).toBeVisible();
    expect(within(memberSection).getByText('bea@example.test')).toBeVisible();
    expect(within(memberSection).getByRole('button', { name: 'Eliminar a Bea' })).toHaveTextContent('×');
    fireEvent.change(screen.getByLabelText('Correo para invitar'), { target: { value: 'cora@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/households/home-1/invitations') && init?.method === 'POST')).toBe(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Revocar invitación de cora@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Bea' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/households/home-1/invitations/invite-1') && init?.method === 'DELETE')).toBe(true));
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/households/home-1/members/member-1') && init?.method === 'DELETE')).toBe(true);
  });

  it('keeps member details read-only for a non-owner', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/households/home-1/members')) return Promise.resolve(Response.json({ members: [{ userId: 'member-1', name: 'Bea', email: 'bea@example.test', role: 'member', createdAt: '2026-07-27T00:00:00.000Z' }] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));
    render(<QueryClientProvider client={createWebQueryClient()}><MembersPanel householdId="home-1" currentUserId="member-1" /></QueryClientProvider>);
    await screen.findByText('bea@example.test');
    const memberSection = screen.getByRole('region', { name: 'Miembros' });
    expect(within(memberSection).getByText('bea@example.test')).toBeVisible();
    expect(screen.queryByLabelText('Correo para invitar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar|Revocar/ })).not.toBeInTheDocument();
  });
});
