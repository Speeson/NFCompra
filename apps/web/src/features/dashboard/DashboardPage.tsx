import { useQueries, useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { fetchMembers, memberQueryKey, type HouseholdMember } from '../households/household-api';
import { fetchNotifications, notificationsQueryKey, type Notification } from '../notifications/notification-api';
import { fetchHouseholds, fetchItems, fetchLists, householdQueryKey, itemQueryKey, listQueryKey, type ApiShoppingItem, type Household, type ShoppingList } from '../shopping-list/queries';

interface DashboardPageProps {
  userName: string;
  onNavigate(path: string): void;
}

function householdPath(householdId: string): string { return `/?household=${encodeURIComponent(householdId)}`; }

export function DashboardPage({ userName, onNavigate }: DashboardPageProps): JSX.Element {
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const notifications = useQuery({ queryKey: notificationsQueryKey, queryFn: fetchNotifications });
  const householdList = households.data ?? [];
  const memberQueries = useQueries({ queries: householdList.map((household) => ({ queryKey: memberQueryKey(household.id), queryFn: () => fetchMembers(household.id) })) });
  const listQueries = useQueries({ queries: householdList.map((household) => ({ queryKey: listQueryKey(household.id), queryFn: () => fetchLists(household.id) })) });
  const lists = listQueries.flatMap((query) => query.data ?? []);
  const itemQueries = useQueries({ queries: lists.map((list) => ({ queryKey: itemQueryKey(list.id), queryFn: () => fetchItems(list.id) })) });
  const itemQueryByListId = new Map(lists.map((list, index) => [list.id, itemQueries[index]]));

  if (households.isPending) return <section className="dashboard" aria-busy="true"><p role="status">Cargando el resumen…</p></section>;
  if (households.isError) return <section className="dashboard"><p role="alert">No se pudo cargar el resumen de hogares.</p></section>;
  if (!households.data?.length) return <section className="dashboard"><header><p className="eyebrow">Resumen</p><h1>Hola, {userName}</h1></header><p className="dashboard__empty">Todavía no tienes hogares.</p><QuickActions onNavigate={onNavigate} /></section>;

  return <section className="dashboard">
    <header className="dashboard__header"><div><p className="eyebrow">Resumen</p><h1>Hola, {userName}</h1><p>Todo lo importante de tus hogares, de un vistazo.</p></div></header>
    {memberQueries.some((query) => query.isPending) || listQueries.some((query) => query.isPending) || itemQueries.some((query) => query.isPending) ? <p role="status">Cargando los detalles de tus hogares…</p> : null}
    <div className="dashboard__households">
      {householdList.map((household, index) => <HouseholdCard key={household.id} household={household} members={memberQueries[index].data} lists={listQueries[index].data} isPending={memberQueries[index].isPending || listQueries[index].isPending} memberOrListError={memberQueries[index].isError || listQueries[index].isError} itemQueryByListId={itemQueryByListId} onNavigate={onNavigate} />)}
    </div>
    <RecentActivity notifications={notifications.data} isPending={notifications.isPending} isError={notifications.isError} onNavigate={onNavigate} />
    <QuickActions onNavigate={onNavigate} />
  </section>;
}

function HouseholdCard({ household, members, lists, isPending, memberOrListError, itemQueryByListId, onNavigate }: { household: Household; members: HouseholdMember[] | undefined; lists: ShoppingList[] | undefined; isPending: boolean; memberOrListError: boolean; itemQueryByListId: Map<string, { data?: ApiShoppingItem[]; isError: boolean; isPending: boolean } | undefined>; onNavigate(path: string): void }): JSX.Element {
  const listDetails = (lists ?? []).map((list) => ({ list, items: itemQueryByListId.get(list.id)?.data ?? [] }));
  const hasItemError = (lists ?? []).some((list) => itemQueryByListId.get(list.id)?.isError);
  const hasPendingItems = (lists ?? []).some((list) => itemQueryByListId.get(list.id)?.isPending ?? true);
  const items = listDetails.flatMap(({ items: listItems }) => listItems);
  const pending = items.filter((item) => !item.isChecked).length;
  return <article className="dashboard__household-card">
    <div><p className="eyebrow">Hogar</p><h2>{household.name}</h2></div>
    {memberOrListError || hasItemError ? <p role="alert">No se pudo cargar este hogar.</p> : isPending || hasPendingItems ? <p role="status">Cargando este hogar…</p> : <><dl className="dashboard__stats"><div><dt>Miembros</dt><dd>{members?.length ?? 0} {(members?.length ?? 0) === 1 ? 'miembro' : 'miembros'}</dd></div><div><dt>Listas</dt><dd>{listDetails.length} {listDetails.length === 1 ? 'lista' : 'listas'}</dd></div><div><dt>Pendientes</dt><dd>{pending} {pending === 1 ? 'pendiente' : 'pendientes'}</dd></div></dl><div className="dashboard__list-progress">{listDetails.map(({ list, items: listItems }) => <button key={list.id} type="button" onClick={() => onNavigate(`/?household=${encodeURIComponent(household.id)}&list=${encodeURIComponent(list.id)}`)}><strong>{list.name}</strong><span>{listItems.filter((item) => item.isChecked).length} de {listItems.length} artículos comprados</span></button>)}</div></>}
    <button className="button" type="button" onClick={() => onNavigate(householdPath(household.id))}>Abrir {household.name}</button>
  </article>;
}

function RecentActivity({ notifications, isPending, isError, onNavigate }: { notifications: Notification[] | undefined; isPending: boolean; isError: boolean; onNavigate(path: string): void }): JSX.Element {
  return <section className="dashboard__activity" aria-labelledby="recent-activity-title"><h2 id="recent-activity-title">Actividad reciente</h2>{isPending ? <p role="status">Cargando actividad reciente…</p> : null}{isError ? <p role="alert">No se pudo cargar la actividad reciente.</p> : null}{!isPending && !isError && !notifications?.length ? <p className="dashboard__empty">No tienes actividad reciente.</p> : null}<ul>{notifications?.slice(0, 5).map((notification) => <li key={notification.id}><button type="button" onClick={() => onNavigate(notification.listId && notification.householdId ? `/?household=${encodeURIComponent(notification.householdId)}&list=${encodeURIComponent(notification.listId)}` : notification.householdId ? householdPath(notification.householdId) : '/') }><strong>{notification.title}</strong><span>{notification.body}</span></button></li>)}</ul></section>;
}

function QuickActions({ onNavigate }: { onNavigate(path: string): void }): JSX.Element {
  return <section className="dashboard__quick-actions" aria-labelledby="quick-actions-title"><h2 id="quick-actions-title">Acciones rápidas</h2><div><button className="button" type="button" onClick={() => onNavigate('/households?create=1')}>Crear hogar</button><button className="button button--secondary" type="button" onClick={() => onNavigate('/lists?create=1')}>Crear lista</button><button className="button button--quiet" type="button" onClick={() => onNavigate('/nfc')}>Abrir NFC</button></div></section>;
}
