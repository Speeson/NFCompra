import type { Env } from '../env';
import type { AuthUser } from '../middleware/auth';
import { isHouseholdMember } from '../households/repository';
import { errorResponse } from '../shared/http';
import { claimOperation, completeMissingItemOperation, completeOperation, createShoppingItem, createShoppingList, deleteCheckedShoppingItems, deleteShoppingItem, findShoppingItem, isListMember, listShoppingItems, listShoppingLists, replayOperation, updateShoppingItem, type ItemPatch } from './repository';
import { boundedText, jsonObject, normalizedName, operationId, optionalBoundedText } from './validation';

const householdListsPattern = /^\/v1\/households\/([^/]+)\/lists$/;
const listItemsPattern = /^\/v1\/lists\/([^/]+)\/items$/;
const checkedItemsPattern = /^\/v1\/lists\/([^/]+)\/items\/checked$/;
const itemPattern = /^\/v1\/items\/([^/]+)$/;

export async function handleListRoute(request: Request, env: Env, user: AuthUser): Promise<Response | null> {
  const checkedItemsMatch = new URL(request.url).pathname.match(checkedItemsPattern);
  if (checkedItemsMatch) return handleCheckedItemsRoute(request, env, user, checkedItemsMatch[1]);
  const singleItemMatch = new URL(request.url).pathname.match(itemPattern);
  if (singleItemMatch) return handleItemRoute(request, env, user, singleItemMatch[1]);
  const itemMatch = new URL(request.url).pathname.match(listItemsPattern);
  if (itemMatch) return handleItemsRoute(request, env, user, itemMatch[1]);
  const match = new URL(request.url).pathname.match(householdListsPattern);
  if (!match) return null;
  const householdId = match[1];
  if (!(await isHouseholdMember(env, householdId, user.id))) return errorResponse('FORBIDDEN', 'No tienes acceso a este hogar.', 403);
  if (request.method === 'GET') return Response.json({ lists: await listShoppingLists(env, householdId) });
  if (request.method !== 'POST') return null;
  const body = await jsonObject(request);
  const name = boundedText(body?.name, 100);
  if (!name) return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
  return Response.json({ list: await createShoppingList(env, householdId, name) }, { status: 201 });
}

async function handleCheckedItemsRoute(request: Request, env: Env, user: AuthUser, listId: string): Promise<Response | null> {
  if (request.method !== 'DELETE') return null;
  if (!(await isListMember(env, listId, user.id))) return errorResponse('FORBIDDEN', 'No tienes acceso a esta lista.', 403);
  const body = await jsonObject(request);
  const op = operationId(body?.operationId);
  if (!op) return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
  const claimed = await claimOperation(env, op, user.id);
  const replay = operationResponse(claimed);
  if (replay) return replay;
  if (claimed.state !== 'claimed') return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  const removed = await deleteCheckedShoppingItems(env, listId, claimed.leaseToken);
  if (removed === null) return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  const responseBody = JSON.stringify({ removed });
  if (!(await completeOperation(env, op, user.id, claimed.leaseToken, 200, responseBody))) return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  return new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json' } });
}

async function handleItemRoute(request: Request, env: Env, user: AuthUser, itemId: string): Promise<Response | null> {
  if (request.method !== 'PATCH' && request.method !== 'DELETE') return null;
  const body = await jsonObject(request);
  const op = operationId(body?.operationId);
  const expectedVersion = body?.expectedVersion;
  if (!op || !Number.isInteger(expectedVersion) || (expectedVersion as number) < 1) return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
  const patch = request.method === 'PATCH' ? itemPatch(body) : undefined;
  if (request.method === 'PATCH' && !patch) return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
  const pending = await replayOperation(env, op, user.id);
  const previous = operationResponse(pending);
  if (previous) return previous;
  const current = await findShoppingItem(env, itemId);
  if (!current) return missingItemResponse();
  if (!(await isListMember(env, current.listId, user.id))) return errorResponse('FORBIDDEN', 'No tienes acceso a esta lista.', 403);
  const claimed = await claimOperation(env, op, user.id);
  const replay = operationResponse(claimed);
  if (replay) return replay;
  if (claimed.state !== 'claimed') return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  if (request.method === 'DELETE') {
    if (!(await deleteShoppingItem(env, itemId, expectedVersion as number, claimed.leaseToken))) {
      const latest = await findShoppingItem(env, itemId);
      if (!latest) return missingItemResponse(env, op, user.id, claimed.leaseToken);
      const responseBody = JSON.stringify({ error: { code: 'ITEM_VERSION_CONFLICT', message: 'El producto ha cambiado.', details: { current: latest } } });
      await completeOperation(env, op, user.id, claimed.leaseToken, 409, responseBody);
      return new Response(responseBody, { status: 409, headers: { 'content-type': 'application/json' } });
    }
    const responseBody = JSON.stringify({ status: 'deleted' });
    if (!(await completeOperation(env, op, user.id, claimed.leaseToken, 200, responseBody))) return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
    return new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const updated = await updateShoppingItem(env, itemId, expectedVersion as number, user.id, patch!, claimed.leaseToken);
  if (!updated) {
    const latest = await findShoppingItem(env, itemId);
    if (!latest) return missingItemResponse(env, op, user.id, claimed.leaseToken);
    const responseBody = JSON.stringify({ error: { code: 'ITEM_VERSION_CONFLICT', message: 'El producto ha cambiado.', details: { current: latest } } });
    await completeOperation(env, op, user.id, claimed.leaseToken, 409, responseBody);
    return new Response(responseBody, { status: 409, headers: { 'content-type': 'application/json' } });
  }
  const responseBody = JSON.stringify({ item: updated });
  if (!(await completeOperation(env, op, user.id, claimed.leaseToken, 200, responseBody))) return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  return new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json' } });
}

function itemPatch(body: Record<string, unknown> | null): ItemPatch | null {
  if (!body) return null;
  const patch: ItemPatch = {};
  if (Object.hasOwn(body, 'name')) {
    const name = boundedText(body.name, 200);
    if (!name) return null;
    patch.name = name;
    patch.normalizedName = normalizedName(name);
  }
  if (Object.hasOwn(body, 'quantity')) {
    if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity <= 0) return null;
    patch.quantity = body.quantity;
  }
  for (const [field, maximumLength] of [['unit', 50], ['category', 100], ['note', 500]] as const) {
    if (Object.hasOwn(body, field)) {
      const value = optionalBoundedText(body[field], maximumLength);
      if (value === undefined) return null;
      patch[field] = value;
    }
  }
  if (Object.hasOwn(body, 'isChecked')) {
    if (typeof body.isChecked !== 'boolean') return null;
    patch.isChecked = body.isChecked;
  }
  if (Object.hasOwn(body, 'position')) {
    if (!Number.isInteger(body.position)) return null;
    patch.position = body.position as number;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

async function handleItemsRoute(request: Request, env: Env, user: AuthUser, listId: string): Promise<Response | null> {
  if (!(await isListMember(env, listId, user.id))) return errorResponse('FORBIDDEN', 'No tienes acceso a esta lista.', 403);
  if (request.method === 'GET') {
    const search = new URL(request.url).searchParams.get('search');
    return Response.json({ items: await listShoppingItems(env, listId, search?.trim() ? normalizedName(search.trim()) : null) });
  }
  if (request.method !== 'POST') return null;
  const body = await jsonObject(request);
  const name = boundedText(body?.name, 200);
  const quantity = body?.quantity === undefined ? 1 : body.quantity;
  const unit = optionalBoundedText(body?.unit, 50);
  const category = optionalBoundedText(body?.category, 100);
  const note = optionalBoundedText(body?.note, 500);
  const position = body?.position === undefined ? 0 : body.position;
  const op = operationId(body?.operationId);
  if (!name || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || unit === undefined || category === undefined || note === undefined || typeof position !== 'number' || !Number.isInteger(position) || !op) return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
  const claimed = await claimOperation(env, op, user.id);
  const replay = operationResponse(claimed);
  if (replay) return replay;
  if (claimed.state !== 'claimed') return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  const item = await createShoppingItem(env, { listId, name, normalizedName: normalizedName(name), quantity, unit, category, note, isChecked: false, position, createdBy: user.id, updatedBy: user.id }, claimed.leaseToken);
  if (!item) return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  const responseBody = JSON.stringify({ item });
  if (!(await completeOperation(env, op, user.id, claimed.leaseToken, 201, responseBody))) return errorResponse('OPERATION_LOST', 'La operación ya no tiene un lease válido.', 409);
  return new Response(responseBody, { status: 201, headers: { 'content-type': 'application/json' } });
}

function operationResponse(claim: Awaited<ReturnType<typeof claimOperation>> | null): Response | null {
  if (!claim) return null;
  if (claim.state === 'claimed') return null;
  if (claim.state === 'replay') return new Response(claim.body, { status: claim.status, headers: { 'content-type': 'application/json' } });
  return errorResponse(claim.state === 'pending' ? 'OPERATION_IN_PROGRESS' : 'OPERATION_ID_REUSED', 'El identificador de operación ya está en uso.', 409);
}

async function missingItemResponse(env?: Env, operationId?: string, userId?: string, leaseToken?: string): Promise<Response> {
  const body = JSON.stringify({ error: { code: 'ITEM_NOT_FOUND', message: 'El producto no existe.', details: {} } });
  if (!env || !operationId || !userId || !leaseToken) return new Response(body, { status: 404, headers: { 'content-type': 'application/json' } });
  await completeMissingItemOperation(env, operationId, userId, leaseToken, body);
  return operationResponse(await replayOperation(env, operationId, userId)) ?? new Response(body, { status: 404, headers: { 'content-type': 'application/json' } });
}
