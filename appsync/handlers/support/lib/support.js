import { genericCreate, genericGet, genericQuery } from "/opt/nodejs/dynamodb.js";

const { SUPPORT_MESSAGES_TABLE, USERS_TABLE } = process.env;

const userKey = (userId) => `USER#${userId}`;

export const getUser = (userId) => genericGet({ tableName: USERS_TABLE, key: { id: userId } });

export const createMessage = (item) =>
  genericCreate({
    tableName: SUPPORT_MESSAGES_TABLE,
    item: { pk: userKey(item.userId), sk: `MSG#${item.createdAt}#${item.id}`, ...item },
  });

/** Newest first. */
export const getMessagesByUser = async (userId, limit) =>
  (
    await genericQuery({
      tableName: SUPPORT_MESSAGES_TABLE,
      keyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      expressionAttributeValues: { ":pk": userKey(userId), ":sk": "MSG#" },
      sortDescending: true,
      limit,
    })
  ).items;

/** Counts messages since `sinceIso`, reading at most `cap` keys. */
export const countMessagesSince = async (userId, sinceIso, cap) =>
  (
    await genericQuery({
      tableName: SUPPORT_MESSAGES_TABLE,
      keyConditionExpression: "pk = :pk AND sk > :since",
      expressionAttributeValues: { ":pk": userKey(userId), ":since": `MSG#${sinceIso}` },
      limit: cap,
      options: { ProjectionExpression: "pk" },
    })
  ).items.length;
