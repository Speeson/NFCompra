import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { JSX } from 'react';

import { fetchMembers, memberQueryKey, type HouseholdMember } from '../households/household-api';
import { fetchNotifications, notificationsQueryKey, type Notification } from '../notifications/notification-api';
import { fetchHouseholds, fetchItems, fetchLists, householdQueryKey, itemQueryKey, listQueryKey, type ApiShoppingItem, type Household, type ShoppingList } from '../shopping-list/queries';

interface DashboardPageProps {
  userName: string;
  onNavigate(path: string): void;
}

type HouseholdData = { household: Household; members: HouseholdMember[]; lists: Array<{ list: ShoppingList; items: ApiShoppingItem[] }> };

function householdPath(householdId: string): string { return `/?household=${encodeURIComponent(householdId)}`; }

export function DashboardPage({ userName, onNavigate }: DashboardPageProps): JSX.Element {
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const notifications = useQuery({ queryKey: notificationsQueryKey, queryFn: fetchNotifications });
  const householdQueries = useQueries({
    queries: (households.data ?? []).map((household) => ({
      queryKey: ['dashboard', household.id] as const,
      queryFn: async (): Promise<HouseholdData> => {
        const [members, lists] = await Promise.all([fetchMembers(household.id), fetchLists(household.id)]);
        const items = await Promise.all(lists.map(async (list) => ({ list, items: await fetchItems(list.id) })));
        return { household, members, lists: items };
      },
    })),
  });

  if (households.isPending) return <section className="dashboard" aria-busy="true"><p role="status">Cargando el resumen…</p></section>;
  if (households.isError) return <section className="dashboard"><p role="alert">No se pudo cargar el resumen de hogares.</p></section>;
  if (!households.data?.length) return <section className="dashboard"><header><p className="eyebrow">Resumen</p><h1>Hola, {userName}</h1></header><p className="dashboard__empty">Todavía no tienes hogares.</p><QuickActions onNavigate={onNavigate} /></section>;

  const details = householdQueries.filter((query): query is UseQueryResult<HouseholdData> & { data: HouseholdData } => Boolean(query.data)).map((query) => query.data);
  const isLoadingDetails = householdQueries.some((query) => query.isPending);
  const hasDetailError = householdQueries.some((query) => query.isError);

  return <section className="dashboard">
    <header className="dashboard__header"><div><p className="eyebrow">Resumen</p><h1>Hola, {userName}</h1><p>Todo lo importante de tus hogares, de un vistazo.</p></div></header>
    {isLoadingDetails ? <p role="status">Cargando los detalles de tus hogares…</p> : null}
    {hasDetailError ? <p role="alert">No se pudo cargar toda la información de los hogares.</p> : null}
    <div className="dashboard__households">
      {details.map((detail) => <HouseholdCard key={detail.household.id} detail={detail} onNavigate={onNavigate} />)}
    </div>
    <RecentActivity notifications={notifications.data} isPending={notifications.isPending} isError={notifications.isError} onNavigate={onNavigate} />
    <QuickActions onNavigate={onNavigate} />
  </section>;
}

function HouseholdCard({ detail, onNavigate }: { detail: HouseholdData; onNavigate(path: string): void }): JSX.Element {
  const items = detail.lists.flatMap(({ items: listItems }) => listItems);
  const pending = items.filter((item) => !item.isChecked).length;
  return <article className="dashboard__household-card">
    <div><p className="eyebrow">Hogar</p><h2>{detail.household.name}</h2></div>
    <dl className="dashboard__stats"><div><dt>Miembros</dt><dd>{detail.members.length} {detail.members.length === 1 ? 'miembro' : 'miembros'}</dd></div><div><dt>Listas</dt><dd>{detail.lists.length} {detail.lists.length === 1 ? 'lista' : 'listas'}</dd></div><div><dt>Pendientes</dt><dd>{pending} {pending === 1 ? 'pendiente' : 'pendientes'}</dd></div></dl>
    <div className="dashboard__list-progress">{detail.lists.map(({ list, items: listItems }) => <button key={list.id} type="button" onClick={() => onNavigate(`/?household=${encodeURIComponent(detail.household.id)}&list=${encodeURIComponent(list.id)}`)}><strong>{list.name}</strong><span>{listItems.filter((item) => item.isChecked).length} de {listItems.length} artículos comprados</span></button>)}</div>
    <button className="button" type="button" onClick={() => onNavigate(householdPath(detail.household.id))}>Abrir {detail.household.name}</button>
  </article>;
}

function RecentActivity({ notifications, isPending, isError, onNavigate }: { notifications: Notification[] | undefined; isPending: boolean; isError: boolean; onNavigate(path: string): void }): JSX.Element {
  return <section className="dashboard__activity" aria-labelledby="recent-activity-title"><h2 id="recent-activity-title">Actividad reciente</h2>{isPending ? <p role="status">Cargando actividad reciente…</p> : null}{isError ? <p role="alert">No se pudo cargar la actividad reciente.</p> : null}{!isPending && !isError && !notifications?.length ? <p className="dashboard__empty">No tienes actividad reciente.</p> : null}<ul>{notifications?.slice(0, 5).map((notification) => <li key={notification.id}><button type="button" onClick={() => onNavigate(notification.listId && notification.householdId ? `/?household=${encodeURIComponent(notification.householdId)}&list=${encodeURIComponent(notification.listId)}` : notification.householdId ? householdPath(notification.householdId) : '/') }><strong>{notification.title}</strong><span>{notification.body}</span></button></li>)}</ul></section>;
}

function QuickActions({ onNavigate }: { onNavigate(path: string): void }): JSX.Element {
  return <section className="dashboard__quick-actions" aria-labelledby="quick-actions-title"><h2 id="quick-actions-title">Acciones rápidas</h2><div><button className="button" type="button" onClick={() => onNavigate('/households?create=1')}>Crear hogar</button><button className="button button--secondary" type="button" onClick={() => onNavigate('/lists?create=1')}>Crear lista</button><button className="button button--quiet" type="button" onClick={() => onNavigate('/nfc')}>Abrir NFC</button></div></section>;
}
