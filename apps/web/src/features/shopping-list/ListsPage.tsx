import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type CSSProperties, type FormEvent, type JSX } from 'react';

import { createList, fetchHouseholds, fetchItems, fetchLists, householdQueryKey, itemQueryKey, listQueryKey, type ShoppingList } from './queries';

export function ListsPage({ onNavigate, startCreating = false }: { onNavigate(path: string): void; startCreating?: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(startCreating);
  const [householdId, setHouseholdId] = useState('');
  const [name, setName] = useState('');
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const homes = households.data ?? [];
  const listQueries = useQueries({ queries: homes.map((home) => ({ queryKey: listQueryKey(home.id), queryFn: () => fetchLists(home.id) })) });
  const lists = listQueries.flatMap((query) => query.data ?? []);
  const itemQueries = useQueries({ queries: lists.map((list) => ({ queryKey: itemQueryKey(list.id), queryFn: () => fetchItems(list.id) })) });

  useEffect(() => { if (!householdId && homes[0]) setHouseholdId(homes[0].id); }, [homes, householdId]);

  const creation = useMutation({
    mutationFn: ({ targetHouseholdId, listName }: { targetHouseholdId: string; listName: string }) => createList(targetHouseholdId, listName),
    onSuccess: (list) => {
      queryClient.setQueryData<ShoppingList[]>(listQueryKey(list.householdId), (current = []) => [...current, list]);
      setCreating(false);
      setName('');
      onNavigate(`/lists/${encodeURIComponent(list.id)}`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (householdId && name.trim()) creation.mutate({ targetHouseholdId: householdId, listName: name.trim() });
  }

  if (households.isPending) return <main className="route-page"><p role="status">Cargando listas…</p></main>;
  if (households.isError) return <main className="route-page"><p role="alert">No se pudieron cargar las listas.</p></main>;

  return <section className="route-page">
    <header className="route-page__header route-page__header--compact">
      <div><h1>Listas activas</h1></div>
      {homes.length ? <button className="button" type="button" onClick={() => setCreating(true)}>Crear nueva lista</button> : null}
    </header>

    {!homes.length ? <div className="route-page__empty"><p>Primero necesitas crear un hogar.</p><button className="button" type="button" onClick={() => onNavigate('/households?create=1')}>Crear hogar</button></div> : null}

    {creating && homes.length ? <form className="route-create-form route-create-form--list" onSubmit={submit}>
      <h2>Crear lista</h2>
      <label htmlFor="new-list-household">Hogar</label>
      <select id="new-list-household" value={householdId} onChange={(event) => setHouseholdId(event.target.value)}>{homes.map((home) => <option key={home.id} value={home.id}>{home.name}</option>)}</select>
      <label htmlFor="new-route-list-name">Nombre de la nueva lista</label>
      <input id="new-route-list-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoFocus />
      <div><button className="button" type="submit" disabled={creation.isPending}>{creation.isPending ? 'Creando...' : 'Crear lista'}</button><button className="button button--quiet" type="button" onClick={() => setCreating(false)}>Cancelar</button></div>
      {creation.isError ? <p role="alert">No se pudo crear la lista.</p> : null}
    </form> : null}

    {homes.length ? <div className="route-list-household-groups">{homes.map((home, homeIndex) => {
      const query = listQueries[homeIndex];
      const groupTitleId = `route-list-household-${home.id}`;
      const homeLists = query.data ?? [];
      return <section key={home.id} className="route-list-household-group" style={householdGlowStyle(home.id)} aria-labelledby={groupTitleId}>
        <header className="route-list-household-group__header">
          <p className="eyebrow">Hogar</p>
          <h2 id={groupTitleId}>{home.name}</h2>
        </header>
        {query.isPending ? <p className="route-list-household-group__status" role="status">Cargando listas…</p> : null}
        {query.isError ? <p className="route-list-household-group__status" role="alert">No se pudieron cargar las listas de este hogar.</p> : null}
        {!query.isPending && !query.isError && !homeLists.length ? <p className="route-list-household-group__status">No hay listas asociadas a este hogar.</p> : null}
        {!query.isPending && !query.isError && homeLists.length ? <div className="route-list-household-group__cards">{homeLists.map((list) => {
          const itemQuery = itemQueries[lists.findIndex((candidate) => candidate.id === list.id)];
          return <article key={list.id} className="route-list-card">
            <div className="route-list-card__list">
              <strong>{list.name}</strong>
              {!itemQuery || itemQuery.isPending ? <span role="status">Cargando productos…</span> : itemQuery.isError ? <span role="alert">No se pudieron cargar los productos.</span> : <span>{itemQuery.data.filter((item) => !item.isChecked).length} pendientes</span>}
            </div>
            <button className="button" type="button" aria-label={`Abrir ${list.name}`} onClick={() => onNavigate(`/lists/${encodeURIComponent(list.id)}`)}>Abrir lista</button>
          </article>;
        })}</div> : null}
      </section>;
    })}</div> : null}
  </section>;
}

function householdGlowStyle(householdId: string): CSSProperties {
  const palette = ['#10b981', '#84cc16', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899'];
  let hash = 0;
  for (const character of householdId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { '--household-glow': palette[hash % palette.length] } as CSSProperties;
}
