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
  const owners = membersQuery.data?.filter((member) => member.role === 'owner') ?? [];
  const members = membersQuery.data?.filter((member) => member.role === 'member') ?? [];
  return <section className="members-panel" aria-label="Gestion de miembros">
    <h2>Miembros</h2>
    <section className="members-panel__section" aria-label="Dueno">
      <h3>Dueño</h3>
      <ul>{owners.map((member) => <li key={member.userId} className="members-panel__person"><MemberIdentity name={member.name} email={member.email} /><span>Propietario</span></li>)}</ul>
    </section>
    <section className="members-panel__section" aria-label="Miembros">
      <h3>Miembros</h3>
      {members.length ? <ul>{members.map((member) => <li key={member.userId} className={isOwner ? 'members-panel__person members-panel__person--removable' : 'members-panel__person'}>
        {isOwner ? <button className="members-panel__remove" type="button" aria-label={`Eliminar a ${member.name}`} onClick={() => remove.mutate(member.userId)}>×</button> : null}
        <MemberIdentity name={member.name} email={member.email} />
        {isOwner ? null : <span>Miembro</span>}
      </li>)}</ul> : <p className="members-panel__empty">Todavia no hay miembros invitados.</p>}
    </section>
    {message ? <p role="alert">{message}</p> : null}
    {isOwner ? <>
      <form className="members-panel__invite" onSubmit={submit}><label>Correo para invitar<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><button className="button" type="submit" disabled={invite.isPending}>Enviar invitación</button></form>
      <section className="members-panel__section" aria-label="Invitaciones pendientes">
        <h3>Invitaciones pendientes</h3>
        {invitationsQuery.isError ? <p role="alert">{errorMessage(invitationsQuery.error)}</p> : <ul>{invitationsQuery.data?.filter((invitation) => invitation.status === 'pending').map((invitation) => <li key={invitation.id} className="members-panel__person"><MemberIdentity name={invitation.email} email="Pendiente" /><button className="button button--quiet" type="button" onClick={() => revoke.mutate(invitation.id)}>Revocar invitación de {invitation.email}</button></li>)}</ul>}
      </section>
    </> : null}
  </section>;
}

function MemberIdentity({ name, email }: { name: string; email: string }): JSX.Element {
  return <span className="members-panel__identity"><strong>{name}</strong><small>{email}</small></span>;
}

function errorMessage(error: unknown): string { return error instanceof ApiError ? error.message : 'No se pudo completar la solicitud.'; }
