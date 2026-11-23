import {
  genericBatchWrite,
  genericCreate,
  genericDelete,
  genericGet,
  genericQuery,
  genericTransactWrite,
  genericUpdate,
} from "/opt/nodejs/dynamodb.js";

const { USER_LISTS_TABLE } = process.env;

const userKey = (userId) => `USER#${userId}`;
const listKey = (listId) => `LIST#${listId}`;
const creatorKey = (creatorId) => `CREATOR#${creatorId}`;
const listItemKey = (userId, listId) => ({ pk: userKey(userId), sk: listKey(listId) });
const memberKey = (listId, creatorId) => ({ pk: listKey(listId), sk: creatorKey(creatorId) });

const queryAll = async (params) => {
  const items = [];
  let exclusiveStartKey;
  do {
    const page = await genericQuery({ tableName: USER_LISTS_TABLE, ...params, exclusiveStartKey });
    items.push(...page.items);
    exclusiveStartKey = page.lastEvaluatedKey || undefined;
  } while (exclusiveStartKey);
  return items;
};

/** Maps a cancelled transaction to the outcome of the highest-priority failed condition (last item wins). */
const transactionOutcome = (error, outcomes) => {
  if (error.name !== "TransactionCanceledException") throw error;
  const reasons = error.CancellationReasons || [];
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (reasons[i]?.Code === "ConditionalCheckFailed") return outcomes[i];
  }
  throw error;
};

export const getList = (userId, listId) =>
  genericGet({ tableName: USER_LISTS_TABLE, key: listItemKey(userId, listId) });

export const getListsByUser = (userId) =>
  queryAll({
    keyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    expressionAttributeValues: { ":pk": userKey(userId), ":sk": "LIST#" },
  });

export const createList = (list) =>
  genericCreate({
    tableName: USER_LISTS_TABLE,
    item: { ...listItemKey(list.userId, list.id), entityType: "LIST", ...list },
  });

export const updateList = (userId, listId, data) =>
  genericUpdate({ tableName: USER_LISTS_TABLE, key: listItemKey(userId, listId), data });

export const deleteList = (userId, listId) =>
  genericDelete({ tableName: USER_LISTS_TABLE, key: listItemKey(userId, listId) });

export const getMembersPage = ({ listId, limit, exclusiveStartKey }) =>
  genericQuery({
    tableName: USER_LISTS_TABLE,
    indexName: "byAddedAt",
    keyConditionExpression: "pk = :pk",
    expressionAttributeValues: { ":pk": listKey(listId) },
    sortDescending: true,
    limit,
    exclusiveStartKey,
  });

export const getAllMembers = (listId) =>
  queryAll({
    keyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    expressionAttributeValues: { ":pk": listKey(listId), ":sk": "CREATOR#" },
  });

export const deleteMembers = (listId, creatorIds) =>
  genericBatchWrite({
    tableName: USER_LISTS_TABLE,
    requests: creatorIds.map((creatorId) => ({ DeleteRequest: { Key: memberKey(listId, creatorId) } })),
  });

export const getListIdsForCreator = async (userId, creatorId) => {
  const items = await queryAll({
    indexName: "gsi1",
    keyConditionExpression: "gsi1pk = :pk AND begins_with(gsi1sk, :sk)",
    expressionAttributeValues: { ":pk": userKey(userId), ":sk": `${creatorKey(creatorId)}#` },
  });
  return items.map((item) => item.listId);
};

const failedConditions = (error) => {
  if (error.name !== "TransactionCanceledException") throw error;
  const failed = (error.CancellationReasons || []).map((r) => r?.Code === "ConditionalCheckFailed");
  if (!failed.some(Boolean)) throw error;
  return failed;
};

/**
 * Adds the member and bumps creatorCount atomically, only while the list exists and holds fewer than
 * `maxCreators`. Returns { added, alreadyMember, listBlocked } — listBlocked means the list is missing or full.
 */
export const addMember = async ({ userId, listId, creatorId, now, maxCreators }) => {
  try {
    await genericTransactWrite({
      items: [
        {
          Put: {
            TableName: USER_LISTS_TABLE,
            Item: {
              ...memberKey(listId, creatorId),
              gsi1pk: userKey(userId),
              gsi1sk: `${creatorKey(creatorId)}#${listKey(listId)}`,
              entityType: "LIST_MEMBER",
              userId,
              listId,
              creatorId,
              addedAt: now,
            },
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Update: {
            TableName: USER_LISTS_TABLE,
            Key: listItemKey(userId, listId),
            UpdateExpression: "ADD creatorCount :one SET updatedAt = :now",
            ConditionExpression: "attribute_exists(pk) AND (attribute_not_exists(creatorCount) OR creatorCount < :max)",
            ExpressionAttributeValues: { ":one": 1, ":now": now, ":max": maxCreators },
          },
        },
      ],
    });
    return { added: true, alreadyMember: false, listBlocked: false };
  } catch (error) {
    const [alreadyMember, listBlocked] = failedConditions(error);
    return { added: false, alreadyMember, listBlocked };
  }
};

/** Returns "removed" | "not_in_list" | "list_not_found". */
export const removeMember = async ({ userId, listId, creatorId, now }) => {
  try {
    await genericTransactWrite({
      items: [
        {
          Delete: {
            TableName: USER_LISTS_TABLE,
            Key: memberKey(listId, creatorId),
            ConditionExpression: "attribute_exists(pk) AND userId = :userId",
            ExpressionAttributeValues: { ":userId": userId },
          },
        },
        {
          Update: {
            TableName: USER_LISTS_TABLE,
            Key: listItemKey(userId, listId),
            UpdateExpression: "ADD creatorCount :minusOne SET updatedAt = :now",
            ConditionExpression: "attribute_exists(pk)",
            ExpressionAttributeValues: { ":minusOne": -1, ":now": now },
          },
        },
      ],
    });
    return "removed";
  } catch (error) {
    return transactionOutcome(error, ["not_in_list", "list_not_found"]);
  }
};
