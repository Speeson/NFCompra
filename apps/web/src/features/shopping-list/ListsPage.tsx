import { useQueries, useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { fetchHouseholds, fetchItems, fetchLists, householdQueryKey, itemQueryKey, listQueryKey } from './queries';

export function ListsPage({ onNavigate }: { onNavigate(path: string): void }): JSX.Element {
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const homes = households.data ?? [];
  const listQueries = useQueries({ queries: homes.map((home) => ({ queryKey: listQueryKey(home.id), queryFn: () => fetchLists(home.id) })) });
  const lists = listQueries.flatMap((query) => query.data ?? []);
  const itemQueries = useQueries({ queries: lists.map((list) => ({ queryKey: itemQueryKey(list.id), queryFn: () => fetchItems(list.id) })) });
  if (households.isPending) return <main className="route-page"><p role="status">Cargando listas…</p></main>;
  if (households.isError) return <main className="route-page"><p role="alert">No se pudieron cargar las listas.</p></main>;
  return <section className="route-page"><header><p className="eyebrow">Mis listas</p><h1>Listas activas</h1></header>{!homes.length ? <p className="route-page__empty">Todavía no hay listas activas.</p> : <div className="route-list-groups">{homes.map((home, homeIndex) => <section key={home.id} className="route-panel"><h2>{home.name}</h2>{listQueries[homeIndex].isPending ? <p role="status">Cargando listas…</p> : <ul className="route-list">{(listQueries[homeIndex].data ?? []).map((list) => { const items = itemQueries[lists.findIndex((candidate) => candidate.id === list.id)]?.data ?? []; const pending = items.filter((item) => !item.isChecked).length; return <li key={list.id}><div><strong>{list.name}</strong><span>{pending} pendientes</span></div><button type="button" onClick={() => onNavigate(`/lists/${encodeURIComponent(list.id)}`)}>Abrir {list.name}</button></li>; })}</ul>}</section>)}</div>}</section>;
}
