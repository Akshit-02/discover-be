import { genericCreateIfNotExists } from "/opt/nodejs/dynamodb.js";
import Logger from "/opt/nodejs/logger.js";

const { USERS_TABLE } = process.env;

export const handler = async (event) => {
  Logger.log("Event Post-confirmation:", JSON.stringify(event, null, 2));

  const { userName, request, triggerSource } = event;
  if (triggerSource !== "PostConfirmation_ConfirmSignUp") return event;

  const { sub, email, name } = request.userAttributes;
  const now = new Date().toISOString();

  const userPayload = {
    id: sub || userName,
    email: email.toLowerCase(),
    ...(name && { name }),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await genericCreateIfNotExists({
      tableName: USERS_TABLE,
      item: userPayload,
      pkName: "id",
    });
  } catch (error) {
    Logger.error("Post-confirmation error:", error);
    throw error;
  }

  return event;
};
