import { useState, type FormEvent, type JSX } from 'react';

type HouseholdSetupProps = { onCreate(name: string): Promise<void>; error?: string; isCreating?: boolean };

export function HouseholdSetup({ onCreate, error, isCreating = false }: HouseholdSetupProps): JSX.Element {
  const [name, setName] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName('');
  }
  return <main className="shopping-list">
    <p className="eyebrow">Primer paso</p><h1>Crea tu hogar</h1><p>Necesitas un hogar para organizar tus listas de la compra.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="household-name">Nombre del hogar</label><input id="household-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
      <button type="submit" disabled={isCreating}>{isCreating ? 'Creando…' : 'Crear hogar'}</button>
    </form>
    {error ? <p role="alert">{error}</p> : null}
  </main>;
}
