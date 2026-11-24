import Logger from "/opt/nodejs/logger.js";
import { creatorFilterOptionsHandler, listCreatorsHandler } from "./resolvers/creators.js";
import {
  myCreditsHandler,
  openCreatorProfileHandler,
  revealCreatorContactHandler,
} from "./resolvers/credits.js";
import { InsufficientCreditsError } from "./helper/credits.js";

const routes = {
  listCreators: listCreatorsHandler,
  creatorFilterOptions: creatorFilterOptionsHandler,
  myCredits: myCreditsHandler,
  openCreatorProfile: openCreatorProfileHandler,
  revealCreatorContact: revealCreatorContactHandler,
};

export const handler = async (event) => {
  Logger.log("Event:", JSON.stringify(event, null, 2));

  const route = routes[event.fieldName];
  if (!route) throw new Error(`Unknown field: ${event.fieldName}`);
  try {
    return await route(event);
  } catch (error) {
    // The resolver turns this into a GraphQL error with errorType "InsufficientCredits".
    if (error instanceof InsufficientCreditsError) {
      return { __error: { message: error.message, type: error.name, info: error.info } };
    }
    throw error;
  }
};
