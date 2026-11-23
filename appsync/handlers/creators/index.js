import Logger from "/opt/nodejs/logger.js";
import { listCreatorsHandler } from "./resolvers/creators.js";

export const handler = async (event) => {
  Logger.log("Event:", JSON.stringify(event, null, 2));

  switch (event.fieldName) {
    case "listCreators":
      return listCreatorsHandler(event);
    default:
      throw new Error(`Unknown field: ${event.fieldName}`);
  }
};
