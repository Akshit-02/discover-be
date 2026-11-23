import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  BatchGetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

let dbClient;

export function getDynamoClient() {
  if (!dbClient) {
    const client = new DynamoDBClient();
    dbClient = DynamoDBDocumentClient.from(client);
  }
  return dbClient;
}

const hasKeys = (obj) => obj && Object.keys(obj).length > 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const genericGet = async ({ tableName, key }) => {
  const db = getDynamoClient();
  const response = await db.send(
    new GetCommand({ TableName: tableName, Key: key }),
  );
  return response.Item;
};

export const genericScan = async ({
  tableName,
  filterExpression,
  expressionAttributeValues = {},
  expressionAttributeNames = {},
  exclusiveStartKey,
  limit,
}) => {
  const db = getDynamoClient();
  const response = await db.send(
    new ScanCommand({
      TableName: tableName,
      ...(filterExpression && { FilterExpression: filterExpression }),
      ...(hasKeys(expressionAttributeValues) && {
        ExpressionAttributeValues: expressionAttributeValues,
      }),
      ...(hasKeys(expressionAttributeNames) && {
        ExpressionAttributeNames: expressionAttributeNames,
      }),
      ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      ...(limit && { Limit: limit }),
    }),
  );
  return {
    items: response.Items || [],
    lastEvaluatedKey: response.LastEvaluatedKey || null,
  };
};

export const genericQuery = async ({
  tableName,
  keyConditionExpression,
  expressionAttributeValues,
  expressionAttributeNames = {},
  indexName,
  filterExpression,
  exclusiveStartKey,
  limit,
  sortDescending = false,
  options = {},
}) => {
  const db = getDynamoClient();
  const response = await db.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(hasKeys(expressionAttributeNames) && {
        ExpressionAttributeNames: expressionAttributeNames,
      }),
      ...(indexName && { IndexName: indexName }),
      ...(filterExpression && { FilterExpression: filterExpression }),
      ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      ...(limit && { Limit: limit }),
      ScanIndexForward: !sortDescending,
      ...options,
    }),
  );
  return {
    items: response.Items || [],
    lastEvaluatedKey: response.LastEvaluatedKey || null,
  };
};

export const genericCreate = async ({ tableName, item }) => {
  const db = getDynamoClient();
  await db.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
};

export const genericCreateIfNotExists = async ({ tableName, item, pkName }) => {
  const db = getDynamoClient();
  try {
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(#pk)",
        ExpressionAttributeNames: { "#pk": pkName },
      }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
};

/**
 * Updates only non-null fields of an existing item; fails if the item is missing.
 */
export const genericUpdate = async ({ tableName, key, data }) => {
  const updateExpression = [];
  const expressionAttributeValues = {};
  const expressionAttributeNames = {};

  Object.entries(data).forEach(([field, value]) => {
    if (field in key || value === undefined || value === null) return;
    updateExpression.push(`#${field} = :${field}`);
    expressionAttributeNames[`#${field}`] = field;
    expressionAttributeValues[`:${field}`] = value;
  });

  if (updateExpression.length === 0) {
    throw new Error("No valid attributes to update");
  }

  expressionAttributeNames["#pk"] = Object.keys(key)[0];

  const db = getDynamoClient();
  const result = await db.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpression.join(", ")}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ConditionExpression: "attribute_exists(#pk)",
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes;
};

/**
 * Creates the item if missing, otherwise overwrites only the given fields.
 * `insertOnlyData` fields are written on first insert only, e.g. createdAt.
 */
export const genericUpsert = async ({
  tableName,
  key,
  data,
  insertOnlyData = {},
}) => {
  const setExpressions = [];
  const expressionAttributeValues = {};
  const expressionAttributeNames = {};

  Object.entries(data).forEach(([field, value]) => {
    if (field in key || value === undefined) return;
    setExpressions.push(`#${field} = :${field}`);
    expressionAttributeNames[`#${field}`] = field;
    expressionAttributeValues[`:${field}`] = value;
  });

  Object.entries(insertOnlyData).forEach(([field, value]) => {
    if (field in key || field in data || value === undefined) return;
    setExpressions.push(`#${field} = if_not_exists(#${field}, :${field})`);
    expressionAttributeNames[`#${field}`] = field;
    expressionAttributeValues[`:${field}`] = value;
  });

  if (setExpressions.length === 0) {
    throw new Error("No valid attributes to upsert");
  }

  const db = getDynamoClient();
  const result = await db.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${setExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes;
};

export const genericIncrement = async ({
  tableName,
  key,
  field,
  incrementBy = 1,
}) => {
  const db = getDynamoClient();
  const result = await db.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: "ADD #field :incrementBy",
      ExpressionAttributeNames: { "#field": field },
      ExpressionAttributeValues: { ":incrementBy": incrementBy },
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes;
};

/**
 * Runs raw TransactWriteItems entries (`{ Put }` / `{ Update }` / `{ Delete }` / `{ ConditionCheck }`)
 * atomically. Throws TransactionCanceledException with `CancellationReasons` when a condition fails.
 */
export const genericTransactWrite = async ({ items }) => {
  const db = getDynamoClient();
  await db.send(new TransactWriteCommand({ TransactItems: items }));
  return true;
};

export const genericDelete = async ({ tableName, key }) => {
  const db = getDynamoClient();
  await db.send(new DeleteCommand({ TableName: tableName, Key: key }));
  return true;
};

const BATCH_WRITE_CHUNK_SIZE = 25;
const BATCH_GET_CHUNK_SIZE = 100;
const BATCH_MAX_ATTEMPTS = 5;

/**
 * `requests` are raw write requests (`{ PutRequest: { Item } }` / `{ DeleteRequest: { Key } }`),
 * chunked to 25 with UnprocessedItems retried with backoff.
 */
export const genericBatchWrite = async ({ tableName, requests }) => {
  if (!requests?.length) return 0;

  const db = getDynamoClient();
  let written = 0;

  for (let i = 0; i < requests.length; i += BATCH_WRITE_CHUNK_SIZE) {
    let pending = requests.slice(i, i + BATCH_WRITE_CHUNK_SIZE);

    for (let attempt = 0; pending.length && attempt < BATCH_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(2 ** attempt * 50);

      const response = await db.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: pending } }),
      );

      const unprocessed = response.UnprocessedItems?.[tableName] || [];
      written += pending.length - unprocessed.length;
      pending = unprocessed;
    }

    if (pending.length) {
      throw new Error(
        `BatchWrite to ${tableName} left ${pending.length} unprocessed items`,
      );
    }
  }

  return written;
};

/**
 * Fetches many items by key, chunked to 100 with UnprocessedKeys retried with backoff.
 */
export const genericBatchGet = async ({
  tableName,
  keys,
  projectionExpression,
  expressionAttributeNames = {},
}) => {
  if (!keys?.length) return [];

  const db = getDynamoClient();
  const items = [];

  for (let i = 0; i < keys.length; i += BATCH_GET_CHUNK_SIZE) {
    let pending = keys.slice(i, i + BATCH_GET_CHUNK_SIZE);

    for (let attempt = 0; pending.length && attempt < BATCH_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(2 ** attempt * 50);

      const response = await db.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: pending,
              ...(projectionExpression && {
                ProjectionExpression: projectionExpression,
              }),
              ...(hasKeys(expressionAttributeNames) && {
                ExpressionAttributeNames: expressionAttributeNames,
              }),
            },
          },
        }),
      );

      items.push(...(response.Responses?.[tableName] || []));
      pending = response.UnprocessedKeys?.[tableName]?.Keys || [];
    }

    if (pending.length) {
      throw new Error(
        `BatchGet from ${tableName} left ${pending.length} unprocessed keys`,
      );
    }
  }

  return items;
};

/**
 * Scans a whole table using parallel segments, handing each page to `onPage`.
 * Return `false` from `shouldContinue` to stop early.
 */
export const genericParallelScan = async ({
  tableName,
  totalSegments = 4,
  projectionExpression,
  filterExpression,
  expressionAttributeNames = {},
  expressionAttributeValues = {},
  onPage,
  shouldContinue = () => true,
}) => {
  const db = getDynamoClient();
  let scannedPages = 0;

  const scanSegment = async (segment) => {
    let exclusiveStartKey;

    do {
      if (!shouldContinue()) return false;

      const response = await db.send(
        new ScanCommand({
          TableName: tableName,
          Segment: segment,
          TotalSegments: totalSegments,
          ...(projectionExpression && {
            ProjectionExpression: projectionExpression,
          }),
          ...(filterExpression && { FilterExpression: filterExpression }),
          ...(hasKeys(expressionAttributeNames) && {
            ExpressionAttributeNames: expressionAttributeNames,
          }),
          ...(hasKeys(expressionAttributeValues) && {
            ExpressionAttributeValues: expressionAttributeValues,
          }),
          ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
        }),
      );

      scannedPages++;
      await onPage(response.Items || [], segment);
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return true;
  };

  const results = await Promise.all(
    Array.from({ length: totalSegments }, (_, segment) => scanSegment(segment)),
  );

  return { completed: results.every(Boolean), scannedPages };
};
