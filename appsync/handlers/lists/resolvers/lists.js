import { randomUUID } from "node:crypto";
import * as listsDb from "../lib/lists.js";
import { creatorExists, getCreatorsByIds } from "../lib/creators.js";
import { toCreator } from "../helper/creators.js";
import {
  MAX_CREATORS_PER_LIST,
  MAX_LISTS_PER_USER,
  clampPageSize,
  decodeToken,
  encodeToken,
  isUuid,
  normalizeDescription,
  normalizeName,
  toUserList,
  validateDescription,
  validateName,
} from "../helper/lists.js";

const requireUserId = (event) => {
  const userId = event.identity?.sub;
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

const requireUuid = (value, label) => {
  if (!isUuid(value)) throw new Error(`Invalid ${label}`);
};

const requireOwnedList = async (userId, listId) => {
  requireUuid(listId, "list id");
  const list = await listsDb.getList(userId, listId);
  if (!list) throw new Error("List not found");
  return list;
};

const assertUniqueName = (lists, name, exceptId) => {
  const taken = lists.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new Error(`You already have a list called "${name}"`);
};

const byUpdatedDesc = (a, b) => b.updatedAt.localeCompare(a.updatedAt);

export const listMyListsHandler = async (event) => {
  const userId = requireUserId(event);
  const lists = await listsDb.getListsByUser(userId);
  return lists.map(toUserList).sort(byUpdatedDesc);
};

export const getUserListHandler = async (event) => {
  const userId = requireUserId(event);
  const { id } = event.arguments;
  if (!isUuid(id)) return null;
  const list = await listsDb.getList(userId, id);
  return list ? toUserList(list) : null;
};

export const createUserListHandler = async (event) => {
  const userId = requireUserId(event);
  const name = normalizeName(event.arguments.input?.name);
  const description = normalizeDescription(event.arguments.input?.description);
  validateName(name);
  validateDescription(description);

  const existing = await listsDb.getListsByUser(userId);
  if (existing.length >= MAX_LISTS_PER_USER) {
    throw new Error(`You can create up to ${MAX_LISTS_PER_USER} lists`);
  }
  assertUniqueName(existing, name);

  const now = new Date().toISOString();
  const list = {
    id: randomUUID(),
    userId,
    name,
    ...(description && { description }),
    creatorCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await listsDb.createList(list);
  return toUserList(list);
};

export const updateUserListHandler = async (event) => {
  const userId = requireUserId(event);
  const { id, input = {} } = event.arguments;
  await requireOwnedList(userId, id);

  const data = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined && input.name !== null) {
    const name = normalizeName(input.name);
    validateName(name);
    assertUniqueName(await listsDb.getListsByUser(userId), name, id);
    data.name = name;
  }
  if (input.description !== undefined && input.description !== null) {
    const description = normalizeDescription(input.description);
    validateDescription(description);
    data.description = description;
  }

  const updated = await listsDb.updateList(userId, id, data);
  return toUserList(updated);
};

export const deleteUserListHandler = async (event) => {
  const userId = requireUserId(event);
  const { id } = event.arguments;
  await requireOwnedList(userId, id);

  const members = await listsDb.getAllMembers(id);
  await listsDb.deleteMembers(id, members.map((m) => m.creatorId));
  await listsDb.deleteList(userId, id);
  return true;
};

export const addCreatorToListHandler = async (event) => {
  const userId = requireUserId(event);
  const { listId, creatorId } = event.arguments;
  requireUuid(listId, "list id");
  requireUuid(creatorId, "creator id");
  if (!(await creatorExists(creatorId))) throw new Error("Creator not found");

  const result = await listsDb.addMember({
    userId,
    listId,
    creatorId,
    now: new Date().toISOString(),
    maxCreators: MAX_CREATORS_PER_LIST,
  });

  const list = await requireOwnedList(userId, listId);
  if (result.listBlocked && !result.alreadyMember) {
    throw new Error(`This list already has the maximum of ${MAX_CREATORS_PER_LIST} creators`);
  }
  return toUserList(list);
};

export const removeCreatorFromListHandler = async (event) => {
  const userId = requireUserId(event);
  const { listId, creatorId } = event.arguments;
  requireUuid(listId, "list id");
  requireUuid(creatorId, "creator id");

  const outcome = await listsDb.removeMember({ userId, listId, creatorId, now: new Date().toISOString() });
  if (outcome === "list_not_found") throw new Error("List not found");

  return toUserList(await requireOwnedList(userId, listId));
};

export const listCreatorsInListHandler = async (event) => {
  const userId = requireUserId(event);
  const { listId, limit, nextToken } = event.arguments;
  await requireOwnedList(userId, listId);

  const page = await listsDb.getMembersPage({
    listId,
    limit: clampPageSize(limit),
    exclusiveStartKey: decodeToken(nextToken),
  });

  const ids = page.items.map((m) => m.creatorId);
  const rows = await getCreatorsByIds(ids);
  const byId = new Map(rows.map((row) => [row.id, toCreator(row)]));

  return {
    items: ids.map((id) => byId.get(id)).filter(Boolean),
    nextToken: encodeToken(page.lastEvaluatedKey),
  };
};

export const getCreatorListIdsHandler = async (event) => {
  const userId = requireUserId(event);
  const { creatorId } = event.arguments;
  if (!isUuid(creatorId)) return [];
  return listsDb.getListIdsForCreator(userId, creatorId);
};
