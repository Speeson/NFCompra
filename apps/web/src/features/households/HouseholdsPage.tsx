import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';

import { MembersPanel } from './MembersPanel';
import { fetchMembers, memberQueryKey } from './household-api';
import { createHousehold, deleteHousehold, fetchHouseholds, fetchItems, fetchLists, householdQueryKey, itemQueryKey, listQueryKey, updateHousehold, type Household } from '../shopping-list/queries';

export function HouseholdsPage({ onNavigate, startCreating = false }: { onNavigate(path: string): void; startCreating?: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(startCreating);
  const [name, setName] = useState('');
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const creation = useMutation({
    mutationFn: createHousehold,
    onSuccess: ({ household }) => {
      queryClient.setQueryData<Household[]>(householdQueryKey, (current = []) => [...current, household]);
      queryClient.setQueryData(listQueryKey(household.id), []);
      setCreating(false);
      setName('');
      onNavigate(`/households/${encodeURIComponent(household.id)}`);
    },
  });
  const renameHouseholdMutation = useMutation({
    mutationFn: ({ household, nextName }: { household: Household; nextName: string }) => updateHousehold(household, nextName),
    onSuccess: (updated) => queryClient.setQueryData<Household[]>(householdQueryKey, (current = []) => current.map((household) => household.id === updated.id ? updated : household)),
  });
  const deleteHouseholdMutation = useMutation({
    mutationFn: deleteHousehold,
    onSuccess: (_result, household) => {
      queryClient.setQueryData<Household[]>(householdQueryKey, (current = []) => current.filter((candidate) => candidate.id !== household.id));
      queryClient.removeQueries({ queryKey: listQueryKey(household.id), exact: true });
      queryClient.removeQueries({ queryKey: memberQueryKey(household.id), exact: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim()) creation.mutate(name.trim());
  }

  if (households.isPending) return <RouteState text="Cargando hogares..." />;
  if (households.isError) return <RouteState text="No se pudieron cargar los hogares." alert />;

  const hasHouseholds = Boolean(households.data?.length);
  return <section className="route-page">
    <header className="route-page__header route-page__header--compact"><div><h1>Tus hogares</h1><p>Organiza las listas y las personas con las que compras.</p></div>{hasHouseholds ? <button className="button" type="button" onClick={() => setCreating(true)}>Nuevo hogar</button> : null}</header>
    {creating || !hasHouseholds ? <form className="route-create-form" onSubmit={submit}><h2>{hasHouseholds ? 'Crear otro hogar' : 'Crea tu primer hogar'}</h2><label htmlFor="new-household-name">Nombre del nuevo hogar</label><input id="new-household-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoFocus /><div><button className="button" type="submit" disabled={creation.isPending}>{creation.isPending ? 'Creando...' : 'Crear hogar'}</button>{hasHouseholds ? <button className="button button--quiet" type="button" onClick={() => setCreating(false)}>Cancelar</button> : null}</div>{creation.isError ? <p role="alert">No se pudo crear el hogar.</p> : null}</form> : null}
    {hasHouseholds ? <div className="route-card-grid">{households.data!.map((household) => <HouseholdCard key={household.id} household={household} onNavigate={onNavigate} onRename={(nextName) => renameHouseholdMutation.mutate({ household, nextName })} onDelete={() => { if (window.confirm(`Se eliminará el hogar ${household.name}, sus listas y sus productos.`)) deleteHouseholdMutation.mutate(household); }} />)}</div> : null}
  </section>;
}

function HouseholdCard({ household, onNavigate, onRename, onDelete }: { household: Household; onNavigate(path: string): void; onRename(name: string): void; onDelete(): void }): JSX.Element {
  const lists = useQuery({ queryKey: listQueryKey(household.id), queryFn: () => fetchLists(household.id) });
  const members = useQuery({ queryKey: memberQueryKey(household.id), queryFn: () => fetchMembers(household.id) });
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(household.name);
  useEffect(() => { if (!isEditing) setDraftName(household.name); }, [household.name, isEditing]);
  const listCount = lists.data?.length ?? 0;
  const memberCount = members.data?.length ?? 0;
  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextName = draftName.trim();
    if (!nextName) return;
    onRename(nextName);
    setIsEditing(false);
  }
  return <article className="route-card route-card--household">
    {isEditing ? <form className="household-card-edit" onSubmit={save}>
      <label className="sr-only" htmlFor={`household-name-${household.id}`}>Nombre del hogar</label>
      <input id={`household-name-${household.id}`} aria-label="Nombre del hogar" value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={100} autoFocus />
      <button className="household-card-action household-card-action--save" type="submit" aria-label={`Guardar hogar ${household.name}`}>✓</button>
      <button className="household-card-action" type="button" aria-label={`Cancelar edición de ${household.name}`} onClick={() => { setDraftName(household.name); setIsEditing(false); }}>×</button>
    </form> : <h2 className="route-card__name">{household.name}</h2>}
    {lists.isPending ? <p className="route-card__metric" role="status">Cargando listas...</p> : lists.isError ? <p className="route-card__metric" role="alert">No se pudieron cargar las listas.</p> : <p className="route-card__metric">{listCount} {listCount === 1 ? 'lista activa' : 'listas activas'}</p>}
    {members.isPending ? <p className="route-card__members" role="status">Cargando usuarios...</p> : members.isError ? <p className="route-card__members" role="alert">Usuarios no disponibles</p> : <p className="route-card__members">{memberCount} {memberCount === 1 ? 'usuario activo' : 'usuarios activos'}</p>}
    <div className="household-card-actions" aria-label={`Acciones de ${household.name}`}>
      {!isEditing ? <button className="household-card-action" type="button" aria-label={`Editar ${household.name}`} onClick={() => setIsEditing(true)}>✎</button> : null}
      <button className="household-card-action household-card-action--danger" type="button" aria-label={`Eliminar ${household.name}`} onClick={onDelete}>×</button>
    </div>
    <button className="button" type="button" aria-label={`Abrir ${household.name}`} onClick={() => onNavigate(`/households/${encodeURIComponent(household.id)}`)}>Abrir hogar</button>
  </article>;
}

export function HouseholdDetailPage({ householdId, currentUserId, onNavigate }: { householdId: string; currentUserId: string; onNavigate(path: string): void }): JSX.Element {
  const [tab, setTab] = useState<'lists' | 'members' | 'nfc'>('lists');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs = ['lists', 'members', 'nfc'] as const;
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const lists = useQuery({ queryKey: listQueryKey(householdId), queryFn: () => fetchLists(householdId) });
  const itemQueries = useQueries({ queries: (lists.data ?? []).map((list) => ({ queryKey: itemQueryKey(list.id), queryFn: () => fetchItems(list.id) })) });
  if (households.isPending) return <RouteState text="Cargando hogar..." />;
  const household = households.data?.find((candidate) => candidate.id === householdId);
  if (!household) return <RouteState text="No se encontró este hogar." alert />;
  const panelId = (name: typeof tab) => `household-${householdId}-${name}-panel`;
  const tabId = (name: typeof tab) => `household-${householdId}-${name}-tab`;

  function activateTab(index: number): void {
    tabRefs.current[index]?.focus();
    setTab(tabs[index]);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined;
    if (target === undefined) return;
    event.preventDefault();
    activateTab(target);
  }

  return <section className="route-page"><button className="back-link" type="button" onClick={() => onNavigate('/households')}>← Volver a hogares</button><header><p className="eyebrow">Hogar</p><h1>{household.name}</h1></header>
    <div role="tablist" aria-label="Secciones del hogar" className="route-tabs">
      {tabs.map((name, index) => <button key={name} ref={(element) => { tabRefs.current[index] = element; }} id={tabId(name)} role="tab" type="button" tabIndex={tab === name ? 0 : -1} aria-controls={panelId(name)} aria-selected={tab === name} onClick={() => setTab(name)} onKeyDown={(event) => onTabKeyDown(event, index)}>{name === 'lists' ? 'Listas' : name === 'members' ? 'Miembros' : 'NFC'}</button>)}
    </div>
    {tab === 'lists' ? <section className="route-panel route-panel--flat" id={panelId('lists')} role="tabpanel" aria-labelledby={tabId('lists')}>{lists.isPending ? <p role="status">Cargando listas...</p> : lists.isError ? <p role="alert">No se pudieron cargar las listas.</p> : !lists.data?.length ? <p className="route-page__empty">No hay listas asociadas a este hogar.</p> : <ul className="household-list-summary">{lists.data.map((list, index) => {
      const items = itemQueries[index];
      const pending = items.data?.filter((item) => !item.isChecked).length ?? 0;
      const total = items.data?.length ?? 0;
      return <li key={list.id}><div><strong>{list.name}</strong>{items.isPending ? <span role="status">Cargando productos...</span> : items.isError ? <span role="alert">Productos no disponibles</span> : <span>{pending} pendientes · {total} productos</span>}</div><button className="button" type="button" onClick={() => onNavigate(`/lists/${encodeURIComponent(list.id)}`)}>Abrir</button></li>;
    })}</ul>}</section> : null}
    {tab === 'members' ? <section id={panelId('members')} role="tabpanel" aria-labelledby={tabId('members')}><MembersPanel householdId={householdId} currentUserId={currentUserId} /></section> : null}
    {tab === 'nfc' ? <section id={panelId('nfc')} role="tabpanel" aria-labelledby={tabId('nfc')}><NfcGuidance householdName={household.name} /></section> : null}
  </section>;
}

export function NfcGuidance({ householdName }: { householdName: string }): JSX.Element {
  return <section className="route-panel" aria-label="NFC"><h2>Pegatina NFC de {householdName}</h2><p>Al escanear una pegatina vinculada se abrirá el contexto de compra de este hogar.</p><p role="alert">La gestión de pegatinas NFC todavía no está disponible en esta versión.</p></section>;
}

function RouteState({ text, alert = false }: { text: string; alert?: boolean }): JSX.Element {
  return <main className="route-page"><p role={alert ? 'alert' : 'status'}>{text}</p></main>;
}
