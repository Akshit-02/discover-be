import { genericGet, genericUpsert } from "/opt/nodejs/dynamodb.js";

const { USERS_TABLE } = process.env;

export const getUserById = (id) => genericGet({ tableName: USERS_TABLE, key: { id } });

export const upsertUser = (id, data, insertOnlyData) =>
  genericUpsert({ tableName: USERS_TABLE, key: { id }, data, insertOnlyData });
