import { hashToken } from '../auth/token-service';
import type { Env } from '../env';

export interface Invitation {
  id: string;
  householdId: string;
  email: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  invitedBy: string;
  createdAt: string;
}

export interface HouseholdMember {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  createdAt: string;
}

interface InvitationRow {
  id: string;
  household_id: string;
  invited_email: string;
  status: Invitation['status'];
  expires_at: string;
  invited_by: string;
  created_at: string;
}

export class InvitationAcceptanceError extends Error {
  constructor(readonly code: 'INVALID_INVITATION_TOKEN' | 'INVITATION_EXPIRED' | 'INVITATION_REVOKED' | 'INVITATION_ALREADY_ACCEPTED' | 'INVITATION_EMAIL_MISMATCH') {
    super(code);
  }
}

function invitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    householdId: row.household_id,
    email: row.invited_email,
    status: row.status,
    expiresAt: row.expires_at,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  };
}

export async function createOrRenewInvitation(env: Env, input: { householdId: string; invitedBy: string; invitedEmail: string; rawToken: string; expiresAt: string }): Promise<Invitation> {
  const now = new Date().toISOString();
  const tokenHash = await hashToken(input.rawToken);
  const id = crypto.randomUUID();
  const row = await env.DB.prepare(`
    INSERT INTO invitations (id, household_id, invited_email, token_hash, status, expires_at, accepted_at, revoked_at, invited_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, NULL, NULL, ?, ?, ?)
    ON CONFLICT(household_id, invited_email) WHERE status = 'pending' DO UPDATE SET
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      accepted_at = NULL,
      revoked_at = NULL,
      updated_at = excluded.updated_at
    RETURNING id, household_id, invited_email, status, expires_at, invited_by, created_at
  `).bind(id, input.householdId, input.invitedEmail, tokenHash, input.expiresAt, input.invitedBy, now, now).first<InvitationRow>();
  if (!row) throw new Error('No se pudo crear la invitacion.');
  return invitation(row);
}

export async function acceptInvitation(env: Env, input: { rawToken: string; userId: string; userEmail: string }): Promise<{ invitation: Invitation; householdId: string }> {
  const tokenHash = await hashToken(input.rawToken);
  const row = await env.DB.prepare(`
    SELECT id, household_id, invited_email, status, expires_at, invited_by, created_at
    FROM invitations WHERE token_hash = ?
  `).bind(tokenHash).first<InvitationRow>();
  if (!row) throw new InvitationAcceptanceError('INVALID_INVITATION_TOKEN');
  if (row.status === 'accepted') throw new InvitationAcceptanceError('INVITATION_ALREADY_ACCEPTED');
  if (row.status === 'revoked') throw new InvitationAcceptanceError('INVITATION_REVOKED');
  if (row.status === 'expired' || row.expires_at <= new Date().toISOString()) {
    if (row.status === 'pending') await env.DB.prepare("UPDATE invitations SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'").bind(new Date().toISOString(), row.id).run();
    throw new InvitationAcceptanceError('INVITATION_EXPIRED');
  }
  if (row.invited_email !== input.userEmail) throw new InvitationAcceptanceError('INVITATION_EMAIL_MISMATCH');

  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE invitations
      SET status = 'accepted', accepted_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND expires_at > ?
    `).bind(now, now, row.id, now),
    env.DB.prepare(`
      INSERT OR IGNORE INTO household_members (household_id, user_id, role, created_at)
      SELECT household_id, ?, 'member', ?
      FROM invitations WHERE id = ? AND status = 'accepted' AND accepted_at = ?
    `).bind(input.userId, now, row.id, now),
  ]);
  if (results[0].meta.changes !== 1) {
    const latest = await env.DB.prepare('SELECT status, expires_at FROM invitations WHERE id = ?').bind(row.id).first<{ status: Invitation['status']; expires_at: string }>();
    if (latest?.status === 'accepted') throw new InvitationAcceptanceError('INVITATION_ALREADY_ACCEPTED');
    if (latest?.status === 'revoked') throw new InvitationAcceptanceError('INVITATION_REVOKED');
    if (latest?.status === 'expired' || (latest && latest.expires_at <= now)) throw new InvitationAcceptanceError('INVITATION_EXPIRED');
    throw new InvitationAcceptanceError('INVALID_INVITATION_TOKEN');
  }
  const accepted = await env.DB.prepare(`
    SELECT id, household_id, invited_email, status, expires_at, invited_by, created_at
    FROM invitations WHERE id = ?
  `).bind(row.id).first<InvitationRow>();
  if (!accepted) throw new Error('No se pudo recuperar la invitacion aceptada.');
  return { invitation: invitation(accepted), householdId: accepted.household_id };
}

export async function listHouseholdMembers(env: Env, householdId: string): Promise<HouseholdMember[]> {
  const rows = await env.DB.prepare(`
    SELECT household_members.user_id, users.name, users.email, household_members.role, household_members.created_at
    FROM household_members INNER JOIN users ON users.id = household_members.user_id
    WHERE household_members.household_id = ?
    ORDER BY CASE household_members.role WHEN 'owner' THEN 0 ELSE 1 END, household_members.created_at ASC
  `).bind(householdId).all<{ user_id: string; name: string; email: string; role: HouseholdMember['role']; created_at: string }>();
  return rows.results.map((row) => ({ userId: row.user_id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at }));
}

export async function removeHouseholdMember(env: Env, input: { householdId: string; requesterId: string; memberUserId: string }): Promise<'removed' | 'forbidden' | 'self'> {
  if (input.requesterId === input.memberUserId) return 'self';
  const requester = await env.DB.prepare("SELECT role FROM household_members WHERE household_id = ? AND user_id = ? AND role = 'owner'")
    .bind(input.householdId, input.requesterId).first();
  if (!requester) return 'forbidden';
  await env.DB.prepare("DELETE FROM household_members WHERE household_id = ? AND user_id = ? AND role = 'member'")
    .bind(input.householdId, input.memberUserId).run();
  return 'removed';
}

export async function listInvitations(env: Env, householdId: string): Promise<Invitation[]> {
  const rows = await env.DB.prepare(`
    SELECT id, household_id, invited_email, status, expires_at, invited_by, created_at
    FROM invitations WHERE household_id = ? ORDER BY created_at DESC
  `).bind(householdId).all<InvitationRow>();
  return rows.results.map(invitation);
}

export async function revokeInvitation(env: Env, householdId: string, invitationId: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE invitations SET status = 'revoked', revoked_at = ?, updated_at = ?
    WHERE id = ? AND household_id = ? AND status = 'pending'
  `).bind(new Date().toISOString(), new Date().toISOString(), invitationId, householdId).run();
  return result.meta.changes === 1;
}
