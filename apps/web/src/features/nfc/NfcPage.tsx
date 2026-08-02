import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { fetchHouseholds, householdQueryKey } from '../shopping-list/queries';

export function NfcPage(): JSX.Element {
  const households = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  if (households.isPending) return <main className="route-page"><p role="status">Cargando hogares para NFC…</p></main>;
  if (households.isError) return <main className="route-page"><p role="alert">No se pudieron cargar los hogares para NFC.</p></main>;
  return <section className="route-page"><header><p className="eyebrow">NFC</p><h1>Pegatinas NFC</h1><p>Una pegatina abre directamente el contexto de compra del hogar elegido.</p></header><section className="route-panel"><h2>Hogares disponibles</h2><ul className="route-list">{households.data?.map((household) => <li key={household.id}>{household.name}</li>)}</ul><p role="alert">La gestión de pegatinas NFC todavía no está disponible en esta versión.</p></section></section>;
}
