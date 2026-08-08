import type { Env } from '../env';
import type { EmailSender } from '../email/email-sender';
import { isHouseholdMember, isHouseholdOwner } from '../households/repository';
import type { AuthUser } from '../middleware/auth';
import { errorResponse, notFound } from '../shared/http';
import { acceptInvitation, acceptInvitationById, createOrRenewInvitation, InvitationAcceptanceError, listHouseholdMembers, listInvitations, removeHouseholdMember, revokeInvitation } from './repository';

const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length > 0 && email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email) ? email : null;
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try { return await request.json() as Record<string, unknown>; } catch { return null; }
}

function invalidInput(): Response {
  return errorResponse('VALIDATION_ERROR', 'La solicitud no es valida.', 422);
}

function invitationError(code: InvitationAcceptanceError['code']): Response {
  const messages: Record<InvitationAcceptanceError['code'], string> = {
    INVALID_INVITATION_TOKEN: 'La invitacion no es valida.',
    INVITATION_EXPIRED: 'La invitacion ha caducado.',
    INVITATION_REVOKED: 'La invitacion ha sido revocada.',
    INVITATION_ALREADY_ACCEPTED: 'La invitacion ya se ha utilizado.',
    INVITATION_EMAIL_MISMATCH: 'La invitacion no corresponde a esta cuenta.',
  };
  return errorResponse(code, messages[code], code === 'INVITATION_EMAIL_MISMATCH' ? 403 : 400);
}

export async function handleInvitationRoute(request: Request, env: Env, user: AuthUser, emailSender: EmailSender): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === '/v1/invitations/accept') {
    if (request.method !== 'POST') return null;
    if (!user.emailVerifiedAt) return errorResponse('EMAIL_NOT_VERIFIED', 'Debes verificar tu correo antes de aceptar una invitacion.', 403);
    const input = await body(request);
    const rawToken = typeof input?.token === 'string' && input.token.trim() ? input.token.trim() : null;
    if (!rawToken || rawToken.length > 512) return invalidInput();
    try {
      const accepted = await acceptInvitation(env, { rawToken, userId: user.id, userEmail: user.email.trim().toLowerCase() });
      return Response.json(accepted);
    } catch (error) {
      if (error instanceof InvitationAcceptanceError) return invitationError(error.code);
      throw error;
    }
  }

  const notificationInvitationMatch = path.match(/^\/v1\/invitations\/([^/]+)\/accept$/);
  if (notificationInvitationMatch) {
    if (request.method !== 'POST') return null;
    if (!user.emailVerifiedAt) return errorResponse('EMAIL_NOT_VERIFIED', 'Debes verificar tu correo antes de aceptar una invitacion.', 403);
    try {
      return Response.json(await acceptInvitationById(env, { invitationId: notificationInvitationMatch[1], userId: user.id, userEmail: user.email.trim().toLowerCase() }));
    } catch (error) {
      if (error instanceof InvitationAcceptanceError) return invitationError(error.code);
      throw error;
    }
  }

  const invitationMatch = path.match(/^\/v1\/households\/([^/]+)\/invitations(?:\/([^/]+))?$/);
  if (invitationMatch) {
    const [, householdId, invitationId] = invitationMatch;
    if (!(await isHouseholdOwner(env, householdId, user.id))) return errorResponse('FORBIDDEN', 'No tienes permisos para gestionar este hogar.', 403);
    if (!invitationId && request.method === 'GET') return Response.json({ invitations: await listInvitations(env, householdId) });
    if (!invitationId && request.method === 'POST') {
      const input = await body(request);
      const email = parseEmail(input?.email);
      if (!email) return invalidInput();
      if (await isHouseholdMember(env, householdId, user.id) && await isHouseholdMemberByEmail(env, householdId, email)) {
        return errorResponse('ALREADY_HOUSEHOLD_MEMBER', 'Esta persona ya pertenece al hogar.', 409);
      }
      const rawToken = createRawToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const invitation = await createOrRenewInvitation(env, { householdId, invitedBy: user.id, invitedEmail: email, rawToken, expiresAt });
      const household = await env.DB.prepare('SELECT name FROM households WHERE id = ?').bind(householdId).first<{ name: string }>();
      const householdName = household?.name ?? 'Hogar';
      const url = `${env.APP_BASE_URL}/invitations/accept?token=${encodeURIComponent(rawToken)}`;
      try {
        await emailSender.sendInvitation({ to: email, householdName, inviterName: user.name, url });
      } catch {
        return errorResponse('EMAIL_DELIVERY_FAILED', 'No se pudo enviar la invitacion.', 503);
      }
      return Response.json({ invitation }, { status: 201 });
    }
    if (invitationId && request.method === 'DELETE') {
      if (!(await revokeInvitation(env, householdId, invitationId))) return notFound();
      return Response.json({ status: 'revoked' });
    }
    return null;
  }

  const memberMatch = path.match(/^\/v1\/households\/([^/]+)\/members(?:\/([^/]+))?$/);
  if (!memberMatch) return null;
  const [, householdId, memberUserId] = memberMatch;
  if (!memberUserId && request.method === 'GET') {
    if (!(await isHouseholdMember(env, householdId, user.id))) return errorResponse('FORBIDDEN', 'No tienes permisos para consultar este hogar.', 403);
    return Response.json({ members: await listHouseholdMembers(env, householdId) });
  }
  if (!(await isHouseholdOwner(env, householdId, user.id))) return errorResponse('FORBIDDEN', 'No tienes permisos para gestionar este hogar.', 403);
  if (!memberUserId || request.method !== 'DELETE') return null;
  const result = await removeHouseholdMember(env, { householdId, requesterId: user.id, memberUserId });
  if (result === 'self') return errorResponse('CANNOT_REMOVE_SELF', 'No puedes eliminarte del hogar.', 409);
  if (result === 'forbidden') return errorResponse('FORBIDDEN', 'No tienes permisos para gestionar este hogar.', 403);
  if (result === 'not_found') return notFound();
  return Response.json({ status: 'removed' });
}

function createRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function isHouseholdMemberByEmail(env: Env, householdId: string, email: string): Promise<boolean> {
  return !!(await env.DB.prepare(`
    SELECT 1 FROM household_members INNER JOIN users ON users.id = household_members.user_id
    WHERE household_members.household_id = ? AND users.email = ?
  `).bind(householdId, email).first());
}
