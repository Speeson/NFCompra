import { useState, type FormEvent, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../api/client';
import { createInvitation, fetchInvitations, fetchMembers, invitationQueryKey, memberQueryKey, removeMember, revokeInvitation } from './household-api';

export function MembersPanel({ householdId, currentUserId }: { householdId: string; currentUserId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string>();
  const membersQuery = useQuery({ queryKey: memberQueryKey(householdId), queryFn: () => fetchMembers(householdId) });
  const isOwner = membersQuery.data?.some((member) => member.userId === currentUserId && member.role === 'owner') ?? false;
  const invitationsQuery = useQuery({ queryKey: invitationQueryKey(householdId), queryFn: () => fetchInvitations(householdId), enabled: isOwner });
  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: memberQueryKey(householdId), exact: true });
  const invalidateInvitations = () => queryClient.invalidateQueries({ queryKey: invitationQueryKey(householdId), exact: true });
  const invite = useMutation({ mutationFn: (target: string) => createInvitation(householdId, target), onSuccess: () => { setEmail(''); void invalidateInvitations(); }, onError: (error) => setMessage(errorMessage(error)) });
  const revoke = useMutation({ mutationFn: (id: string) => revokeInvitation(householdId, id), onSuccess: () => void invalidateInvitations(), onError: (error) => setMessage(errorMessage(error)) });
  const remove = useMutation({ mutationFn: (id: string) => removeMember(householdId, id), onSuccess: () => void invalidateMembers(), onError: (error) => setMessage(errorMessage(error)) });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const target = email.trim();
    if (target) { setMessage(undefined); invite.mutate(target); }
  }

  if (membersQuery.isPending) return <section aria-label="Miembros"><p role="status">Cargando miembros…</p></section>;
  if (membersQuery.isError) return <section aria-label="Miembros"><p role="alert">{errorMessage(membersQuery.error)}</p></section>;
  return <section aria-label="Miembros">
    <h2>Miembros</h2>
    <ul>{membersQuery.data?.map((member) => <li key={member.userId}>{member.name} ({member.email}) {member.role === 'owner' ? 'Propietaria' : 'Miembro'}
      {isOwner && member.role === 'member' ? <button type="button" onClick={() => remove.mutate(member.userId)}>Eliminar a {member.name}</button> : null}
    </li>)}</ul>
    {message ? <p role="alert">{message}</p> : null}
    {isOwner ? <>
      <form onSubmit={submit}><label>Correo para invitar<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><button type="submit" disabled={invite.isPending}>Enviar invitación</button></form>
      <h3>Invitaciones pendientes</h3>
      {invitationsQuery.isError ? <p role="alert">{errorMessage(invitationsQuery.error)}</p> : <ul>{invitationsQuery.data?.filter((invitation) => invitation.status === 'pending').map((invitation) => <li key={invitation.id}>{invitation.email}<button type="button" onClick={() => revoke.mutate(invitation.id)}>Revocar invitación de {invitation.email}</button></li>)}</ul>}
    </> : null}
  </section>;
}

function errorMessage(error: unknown): string { return error instanceof ApiError ? error.message : 'No se pudo completar la solicitud.'; }
