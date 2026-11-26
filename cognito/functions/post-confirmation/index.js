import { genericCreateIfNotExists } from "/opt/nodejs/dynamodb.js";
import Logger from "/opt/nodejs/logger.js";

const { USERS_TABLE, CREDITS_TABLE } = process.env;
const SIGNUP_CREDITS = 30;
const SIGNUP_CREDIT_DAYS = 30;

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

  // Signup grant. Non-fatal: the API creates the same wallet lazily if this fails.
  try {
    await genericCreateIfNotExists({
      tableName: CREDITS_TABLE,
      pkName: "pk",
      item: {
        pk: `USER#${userPayload.id}`,
        sk: "WALLET",
        userId: userPayload.id,
        balance: SIGNUP_CREDITS,
        paidBalance: 0,
        granted: SIGNUP_CREDITS,
        expiresAt: new Date(Date.parse(now) + SIGNUP_CREDIT_DAYS * 86_400_000).toISOString(),
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    Logger.error("Signup credits error:", error);
  }

  return event;
};
