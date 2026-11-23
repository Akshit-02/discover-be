import Logger from "/opt/nodejs/logger.js";
import { getUserByIdHandler } from "./resolvers/users.js";

export const handler = async (event) => {
  Logger.log("Event:", JSON.stringify(event, null, 2));

  switch (event.fieldName) {
    case "getUserById":
      return getUserByIdHandler(event);
    default:
      throw new Error(`Unknown field: ${event.fieldName}`);
  }
};
