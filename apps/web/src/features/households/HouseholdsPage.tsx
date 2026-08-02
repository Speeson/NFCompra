import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';

import { MembersPanel } from './MembersPanel';
import { createHousehold, fetchHouseholds, fetchLists, householdQueryKey, listQueryKey, type Household } from '../shopping-list/queries';

export function HouseholdsPage({ onNavigate, startCreating = false }: { onNavigate(path: string): void; startCreating?: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(startCreating);
  const [name, setName] = useState('');
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const creation = useMutation({
    mutationFn: createHousehold,
    onSuccess: ({ household, defaultList }) => {
      queryClient.setQueryData<Household[]>(householdQueryKey, (current = []) => [...current, household]);
      queryClient.setQueryData(listQueryKey(household.id), [defaultList]);
      setCreating(false);
      setName('');
      onNavigate(`/households/${encodeURIComponent(household.id)}`);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim()) creation.mutate(name.trim());
  }
  if (households.isPending) return <RouteState text="Cargando hogares…" />;
  if (households.isError) return <RouteState text="No se pudieron cargar los hogares." alert />;
  const hasHouseholds = Boolean(households.data?.length);
  return <section className="route-page"><header className="route-page__header"><div><p className="eyebrow">Hogares</p><h1>Tus hogares</h1><p>Organiza las listas y las personas con las que compras.</p></div>{hasHouseholds ? <button className="button" type="button" onClick={() => setCreating(true)}>Nuevo hogar</button> : null}</header>
    {creating || !hasHouseholds ? <form className="route-create-form" onSubmit={submit}><h2>{hasHouseholds ? 'Crear otro hogar' : 'Crea tu primer hogar'}</h2><label htmlFor="new-household-name">Nombre del nuevo hogar</label><input id="new-household-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoFocus /><div><button className="button" type="submit" disabled={creation.isPending}>{creation.isPending ? 'Creando…' : 'Crear hogar'}</button>{hasHouseholds ? <button className="button button--quiet" type="button" onClick={() => setCreating(false)}>Cancelar</button> : null}</div>{creation.isError ? <p role="alert">No se pudo crear el hogar.</p> : null}</form> : null}
    {hasHouseholds ? <div className="route-card-grid">{households.data!.map((household) => <HouseholdCard key={household.id} household={household} onNavigate={onNavigate} />)}</div> : null}
  </section>;
}

function HouseholdCard({ household, onNavigate }: { household: Household; onNavigate(path: string): void }): JSX.Element {
  const lists = useQuery({ queryKey: listQueryKey(household.id), queryFn: () => fetchLists(household.id) });
  return <article className="route-card"><p className="eyebrow">Hogar</p><h2>{household.name}</h2>{lists.isPending ? <p role="status">Cargando listas…</p> : lists.isError ? <p role="alert">No se pudieron cargar las listas.</p> : <p>{lists.data?.length ?? 0} {(lists.data?.length ?? 0) === 1 ? 'lista activa' : 'listas activas'}</p>}<button className="button" type="button" onClick={() => onNavigate(`/households/${encodeURIComponent(household.id)}`)}>Abrir {household.name}</button></article>;
}

export function HouseholdDetailPage({ householdId, currentUserId, onNavigate }: { householdId: string; currentUserId: string; onNavigate(path: string): void }): JSX.Element {
  const [tab, setTab] = useState<'lists' | 'members' | 'nfc'>('lists');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs = ['lists', 'members', 'nfc'] as const;
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const lists = useQuery({ queryKey: listQueryKey(householdId), queryFn: () => fetchLists(householdId) });
  if (households.isPending) return <RouteState text="Cargando hogar…" />;
  const household = households.data?.find((candidate) => candidate.id === householdId);
  if (!household) return <RouteState text="No se encontró este hogar." alert />;
  const panelId = (name: typeof tab) => `household-${householdId}-${name}-panel`;
  const tabId = (name: typeof tab) => `household-${householdId}-${name}-tab`;
  function activateTab(index: number): void { tabRefs.current[index]?.focus(); setTab(tabs[index]); }
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined;
    if (target === undefined) return;
    event.preventDefault(); activateTab(target);
  }
  return <section className="route-page"><header><p className="eyebrow">Hogar</p><h1>{household.name}</h1></header>
    <div role="tablist" aria-label="Secciones del hogar" className="route-tabs">
      {tabs.map((name, index) => <button key={name} ref={(element) => { tabRefs.current[index] = element; }} id={tabId(name)} role="tab" type="button" tabIndex={tab === name ? 0 : -1} aria-controls={panelId(name)} aria-selected={tab === name} onClick={() => setTab(name)} onKeyDown={(event) => onTabKeyDown(event, index)}>{name === 'lists' ? 'Listas' : name === 'members' ? 'Miembros' : 'NFC'}</button>)}
    </div>
    {tab === 'lists' ? <section className="route-panel" id={panelId('lists')} role="tabpanel" aria-labelledby={tabId('lists')}><h2>Listas</h2>{lists.isPending ? <p role="status">Cargando listas…</p> : lists.isError ? <p role="alert">No se pudieron cargar las listas.</p> : <ul className="route-list">{lists.data?.map((list) => <li key={list.id}><strong>{list.name}</strong><button type="button" onClick={() => onNavigate(`/lists/${encodeURIComponent(list.id)}`)}>Abrir {list.name}</button></li>)}</ul>}</section> : null}
    {tab === 'members' ? <section id={panelId('members')} role="tabpanel" aria-labelledby={tabId('members')}><MembersPanel householdId={householdId} currentUserId={currentUserId} /></section> : null}
    {tab === 'nfc' ? <section id={panelId('nfc')} role="tabpanel" aria-labelledby={tabId('nfc')}><NfcGuidance householdName={household.name} /></section> : null}
  </section>;
}

export function NfcGuidance({ householdName }: { householdName: string }): JSX.Element { return <section className="route-panel" aria-label="NFC"><h2>Pegatina NFC de {householdName}</h2><p>Al escanear una pegatina vinculada se abrirá el contexto de compra de este hogar.</p><p role="alert">La gestión de pegatinas NFC todavía no está disponible en esta versión.</p></section>; }
function RouteState({ text, alert = false }: { text: string; alert?: boolean }): JSX.Element { return <main className="route-page"><p role={alert ? 'alert' : 'status'}>{text}</p></main>; }
