import { genericGet } from "/opt/nodejs/dynamodb.js";

const { USERS_TABLE } = process.env;

export const getUserById = (id) => genericGet({ tableName: USERS_TABLE, key: { id } });
