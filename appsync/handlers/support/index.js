import Logger from "/opt/nodejs/logger.js";
import { listMySupportMessagesHandler, submitSupportMessageHandler } from "./resolvers/support.js";

export const handler = async (event) => {
  Logger.log("Event:", JSON.stringify(event, null, 2));

  switch (event.fieldName) {
    case "submitSupportMessage":
      return submitSupportMessageHandler(event);
    case "listMySupportMessages":
      return listMySupportMessagesHandler(event);
    default:
      throw new Error(`Unknown field: ${event.fieldName}`);
  }
};
