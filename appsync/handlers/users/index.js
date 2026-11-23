import Logger from "/opt/nodejs/logger.js";
import { getMeHandler, getUserByIdHandler, updateMyProfileHandler } from "./resolvers/users.js";

export const handler = async (event) => {
  Logger.log("Event:", JSON.stringify(event, null, 2));

  switch (event.fieldName) {
    case "getUserById":
      return getUserByIdHandler(event);
    case "getMe":
      return getMeHandler(event);
    case "updateMyProfile":
      return updateMyProfileHandler(event);
    default:
      throw new Error(`Unknown field: ${event.fieldName}`);
  }
};
