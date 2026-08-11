import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';

import { MembersPanel } from './MembersPanel';
import { activeHouseholdStorageKey, readActiveHouseholdId, writeActiveHouseholdId } from './active-household';
import { fetchMembers, memberQueryKey } from './household-api';
import { createHousehold, deleteHousehold, fetchHouseholds, fetchItems, fetchLists, householdQueryKey, itemQueryKey, leaveHousehold, listQueryKey, updateHousehold, type Household } from '../shopping-list/queries';

export function HouseholdsPage({ currentUserId, onNavigate, startCreating = false }: { currentUserId: string; onNavigate(path: string): void; startCreating?: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(startCreating);
  const [name, setName] = useState('');
  const [expandedHouseholdId, setExpandedHouseholdId] = useState<string | null>(null);
  const [activeHouseholdId, setActiveHouseholdId] = useState(() => readActiveHouseholdId());
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
  const removeFromCache = (household: Household): void => {
    queryClient.setQueryData<Household[]>(householdQueryKey, (current = []) => current.filter((candidate) => candidate.id !== household.id));
    queryClient.removeQueries({ queryKey: listQueryKey(household.id), exact: true });
    queryClient.removeQueries({ queryKey: memberQueryKey(household.id), exact: true });
    if (activeHouseholdId === household.id) {
      writeActiveHouseholdId(null);
      setActiveHouseholdId(null);
    }
    if (expandedHouseholdId === household.id) setExpandedHouseholdId(null);
  };
  const deleteHouseholdMutation = useMutation({ mutationFn: deleteHousehold, onSuccess: (_result, household) => removeFromCache(household) });
  const leaveHouseholdMutation = useMutation({ mutationFn: leaveHousehold, onSuccess: (_result, household) => removeFromCache(household) });

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === activeHouseholdStorageKey) setActiveHouseholdId(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
    {hasHouseholds ? <div className="route-card-grid">{households.data!.map((household) => <HouseholdCard
      key={household.id}
      household={household}
      currentUserId={currentUserId}
      active={activeHouseholdId === household.id}
      expanded={expandedHouseholdId === household.id}
      onToggleExpanded={() => setExpandedHouseholdId((current) => current === household.id ? null : household.id)}
      onOpen={() => {
        if (activeHouseholdId === household.id) onNavigate(`/lists?household=${encodeURIComponent(household.id)}`);
        else {
          writeActiveHouseholdId(household.id);
          setActiveHouseholdId(household.id);
          setExpandedHouseholdId(household.id);
        }
      }}
      onRename={(nextName) => renameHouseholdMutation.mutate({ household, nextName })}
      onDelete={() => { if (window.confirm(`Se eliminara el hogar ${household.name}, sus listas y sus productos.`)) deleteHouseholdMutation.mutate(household); }}
      onLeave={() => leaveHouseholdMutation.mutate(household)}
    />)}</div> : null}
  </section>;
}

function HouseholdCard({ household, currentUserId, active, expanded, onToggleExpanded, onOpen, onRename, onDelete, onLeave }: { household: Household; currentUserId: string; active: boolean; expanded: boolean; onToggleExpanded(): void; onOpen(): void; onRename(name: string): void; onDelete(): void; onLeave(): void }): JSX.Element {
  const lists = useQuery({ queryKey: listQueryKey(household.id), queryFn: () => fetchLists(household.id) });
  const members = useQuery({ queryKey: memberQueryKey(household.id), queryFn: () => fetchMembers(household.id) });
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(household.name);
  const [showMembers, setShowMembers] = useState(false);
  const [showNfc, setShowNfc] = useState(false);
  useEffect(() => { if (!isEditing) setDraftName(household.name); }, [household.name, isEditing]);
  useEffect(() => { if (!expanded) setShowMembers(false); }, [expanded]);
  const listCount = lists.data?.length ?? 0;
  const memberCount = members.data?.length ?? 0;
  const isOwner = members.data?.some((member) => member.userId === currentUserId && member.role === 'owner') ?? household.ownerId === currentUserId;

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextName = draftName.trim();
    if (!nextName) return;
    onRename(nextName);
    setIsEditing(false);
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onToggleExpanded();
  }

  return <article className={active ? 'route-card route-card--household is-active' : 'route-card route-card--household'} aria-label={household.name} aria-expanded={expanded} tabIndex={0} onClick={onToggleExpanded} onKeyDown={onCardKeyDown}>
    <div className="household-card-main">
      {isEditing ? <form className="household-card-edit" onSubmit={save} onClick={(event) => event.stopPropagation()}>
        <label className="sr-only" htmlFor={`household-name-${household.id}`}>Nombre del hogar</label>
        <input id={`household-name-${household.id}`} aria-label="Nombre del hogar" value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={100} autoFocus />
        <button className="household-card-action household-card-action--save" type="submit" aria-label={`Guardar hogar ${household.name}`}>✓</button>
        <button className="household-card-action" type="button" aria-label={`Cancelar edicion de ${household.name}`} onClick={() => { setDraftName(household.name); setIsEditing(false); }}>×</button>
      </form> : <div className="household-card-title">
        <h2 className="route-card__name">{household.name}</h2>
        {lists.isPending ? <p className="route-card__metric" role="status">Cargando listas...</p> : lists.isError ? <p className="route-card__metric" role="alert">No se pudieron cargar las listas.</p> : <p className="route-card__metric">{listCount} {listCount === 1 ? 'lista activa' : 'listas activas'}</p>}
      </div>}
      {members.isPending ? <p className="route-card__members" role="status">Cargando usuarios...</p> : members.isError ? <p className="route-card__members" role="alert">Usuarios no disponibles</p> : <p className="route-card__members">{memberCount} {memberCount === 1 ? 'usuario activo' : 'usuarios activos'}</p>}
      <div className="household-card-actions" aria-label={`Acciones de ${household.name}`}>
        {isOwner ? <>
          {!isEditing ? <button className="household-card-action" type="button" aria-label={`Editar ${household.name}`} onClick={(event) => { event.stopPropagation(); setIsEditing(true); }}>✎</button> : null}
          <button className="household-card-action household-card-action--danger" type="button" aria-label={`Eliminar ${household.name}`} onClick={(event) => { event.stopPropagation(); onDelete(); }}>×</button>
        </> : <>
          <button className="household-card-action" type="button" aria-label={`Solo el dueño puede editar ${household.name}`} disabled onClick={(event) => event.stopPropagation()}>✎</button>
          <button className="household-card-action household-card-action--danger" type="button" aria-label={`Salir de ${household.name}`} onClick={(event) => { event.stopPropagation(); onLeave(); }}><LogoutIcon /></button>
        </>}
      </div>
      <button className="button" type="button" aria-label={`${active ? 'Acceder' : 'Abrir'} ${household.name}`} onClick={(event) => { event.stopPropagation(); onOpen(); }}>{active ? 'Acceder' : 'Abrir'}</button>
    </div>
    {expanded ? <div className="household-card-expanded" onClick={(event) => event.stopPropagation()}>
      <div className="household-card-expanded__meta">
        <div><strong>{isOwner ? 'Dueño del hogar' : 'Miembro del hogar'}</strong><span>{active ? 'Hogar abierto' : 'Hogar disponible'}</span></div>
      </div>
      <button className="button household-card-wide-action" type="button" aria-label={`Miembros de ${household.name}`} onClick={(event) => { event.stopPropagation(); setShowMembers((current) => !current); }}>👤 Miembros</button>
      <button className="button button--quiet household-card-wide-action" type="button" aria-label={`Codigo NFC de ${household.name}`} onClick={(event) => { event.stopPropagation(); setShowNfc(true); }}>⧉ Codigo NFC</button>
      {showMembers ? <div className="household-card-panel"><MembersPanel householdId={household.id} currentUserId={currentUserId} /></div> : null}
    </div> : null}
    {showNfc ? <NfcCodeDialog household={household} onClose={() => setShowNfc(false)} /> : null}
  </article>;
}

function NfcCodeDialog({ household, onClose }: { household: Household; onClose(): void }): JSX.Element {
  const nfcUrl = `https://nfcompra.esgarpe.dev/household/${household.id}/lists`;
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    await navigator.clipboard?.writeText(nfcUrl);
    setCopied(true);
  }
  return <div className="modal-backdrop" role="presentation" onClick={(event) => event.stopPropagation()}>
    <div className="nfc-code-dialog" role="dialog" aria-modal="true" aria-labelledby={`nfc-code-title-${household.id}`}>
      <h2 id={`nfc-code-title-${household.id}`}>Codigo NFC</h2>
      <p>{household.name}</p>
      <label>Codigo URL / URI<input readOnly value={nfcUrl} onFocus={(event) => event.currentTarget.select()} /></label>
      <div className="nfc-code-dialog__actions">
        <button className="button" type="button" onClick={() => void copy()}><CopyIcon />Copiar</button>
        <button className="button button--quiet" type="button" onClick={onClose}>Cerrar</button>
      </div>
      {copied ? <p role="status">Codigo NFC copiado</p> : null}
    </div>
  </div>;
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
  if (!household) return <RouteState text="No se encontro este hogar." alert />;
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
    {tab === 'nfc' ? <section id={panelId('nfc')} role="tabpanel" aria-labelledby={tabId('nfc')}><NfcGuidance household={household} /></section> : null}
  </section>;
}

export function NfcGuidance({ household }: { household: Household }): JSX.Element {
  const nfcUrl = `https://nfcompra.esgarpe.dev/household/${household.id}/lists`;
  return <section className="route-panel" aria-label="NFC"><h2>Pegatina NFC de {household.name}</h2><label>Codigo URL / URI<input readOnly value={nfcUrl} onFocus={(event) => event.currentTarget.select()} /></label></section>;
}

function LogoutIcon(): JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M14 8l4 4-4 4M8 12h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CopyIcon(): JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function RouteState({ text, alert = false }: { text: string; alert?: boolean }): JSX.Element {
  return <main className="route-page"><p role={alert ? 'alert' : 'status'}>{text}</p></main>;
}
