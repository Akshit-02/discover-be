import Logger from "/opt/nodejs/logger.js";
import {
  addCreatorToListHandler,
  createUserListHandler,
  deleteUserListHandler,
  getCreatorListIdsHandler,
  getUserListHandler,
  listCreatorsInListHandler,
  listMyListsHandler,
  removeCreatorFromListHandler,
  updateUserListHandler,
} from "./resolvers/lists.js";

export const handler = async (event) => {
  Logger.log("Event:", JSON.stringify(event, null, 2));

  switch (event.fieldName) {
    case "listMyLists":
      return listMyListsHandler(event);
    case "getUserList":
      return getUserListHandler(event);
    case "listCreatorsInList":
      return listCreatorsInListHandler(event);
    case "getCreatorListIds":
      return getCreatorListIdsHandler(event);
    case "createUserList":
      return createUserListHandler(event);
    case "updateUserList":
      return updateUserListHandler(event);
    case "deleteUserList":
      return deleteUserListHandler(event);
    case "addCreatorToList":
      return addCreatorToListHandler(event);
    case "removeCreatorFromList":
      return removeCreatorFromListHandler(event);
    default:
      throw new Error(`Unknown field: ${event.fieldName}`);
  }
};
