import { useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';

import { MembersPanel } from './MembersPanel';
import { fetchHouseholds, fetchLists, householdQueryKey, listQueryKey, type Household } from '../shopping-list/queries';

export function HouseholdsPage({ onNavigate }: { onNavigate(path: string): void }): JSX.Element {
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  if (households.isPending) return <RouteState text="Cargando hogares…" />;
  if (households.isError) return <RouteState text="No se pudieron cargar los hogares." alert />;
  return <section className="route-page"><header><p className="eyebrow">Hogares</p><h1>Tus hogares</h1><p>Organiza las listas y las personas con las que compras.</p></header>
    {!households.data?.length ? <p className="route-page__empty">Todavía no tienes hogares. Crea el primero desde tu lista de compra.</p> : <div className="route-card-grid">{households.data.map((household) => <HouseholdCard key={household.id} household={household} onNavigate={onNavigate} />)}</div>}
  </section>;
}

function HouseholdCard({ household, onNavigate }: { household: Household; onNavigate(path: string): void }): JSX.Element {
  const lists = useQuery({ queryKey: listQueryKey(household.id), queryFn: () => fetchLists(household.id) });
  return <article className="route-card"><p className="eyebrow">Hogar</p><h2>{household.name}</h2>{lists.isPending ? <p role="status">Cargando listas…</p> : lists.isError ? <p role="alert">No se pudieron cargar las listas.</p> : <p>{lists.data?.length ?? 0} {(lists.data?.length ?? 0) === 1 ? 'lista activa' : 'listas activas'}</p>}<button className="button" type="button" onClick={() => onNavigate(`/households/${encodeURIComponent(household.id)}`)}>Abrir {household.name}</button></article>;
}

export function HouseholdDetailPage({ householdId, currentUserId, onNavigate }: { householdId: string; currentUserId: string; onNavigate(path: string): void }): JSX.Element {
  const [tab, setTab] = useState<'lists' | 'members' | 'nfc'>('lists');
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const lists = useQuery({ queryKey: listQueryKey(householdId), queryFn: () => fetchLists(householdId) });
  if (households.isPending) return <RouteState text="Cargando hogar…" />;
  const household = households.data?.find((candidate) => candidate.id === householdId);
  if (!household) return <RouteState text="No se encontró este hogar." alert />;
  return <section className="route-page"><header><p className="eyebrow">Hogar</p><h1>{household.name}</h1></header>
    <div role="tablist" aria-label="Secciones del hogar" className="route-tabs">
      <button role="tab" type="button" aria-selected={tab === 'lists'} onClick={() => setTab('lists')}>Listas</button>
      <button role="tab" type="button" aria-selected={tab === 'members'} onClick={() => setTab('members')}>Miembros</button>
      <button role="tab" type="button" aria-selected={tab === 'nfc'} onClick={() => setTab('nfc')}>NFC</button>
    </div>
    {tab === 'lists' ? <section className="route-panel" aria-label="Listas"><h2>Listas</h2>{lists.isPending ? <p role="status">Cargando listas…</p> : lists.isError ? <p role="alert">No se pudieron cargar las listas.</p> : <ul className="route-list">{lists.data?.map((list) => <li key={list.id}><strong>{list.name}</strong><button type="button" onClick={() => onNavigate(`/lists/${encodeURIComponent(list.id)}`)}>Abrir {list.name}</button></li>)}</ul>}</section> : null}
    {tab === 'members' ? <MembersPanel householdId={householdId} currentUserId={currentUserId} /> : null}
    {tab === 'nfc' ? <NfcGuidance householdName={household.name} /> : null}
  </section>;
}

export function NfcGuidance({ householdName }: { householdName: string }): JSX.Element { return <section className="route-panel" aria-label="NFC"><h2>Pegatina NFC de {householdName}</h2><p>Al escanear una pegatina vinculada se abrirá el contexto de compra de este hogar.</p><p role="alert">La gestión de pegatinas NFC todavía no está disponible en esta versión.</p></section>; }
function RouteState({ text, alert = false }: { text: string; alert?: boolean }): JSX.Element { return <main className="route-page"><p role={alert ? 'alert' : 'status'}>{text}</p></main>; }
