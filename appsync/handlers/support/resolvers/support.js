import { randomUUID } from "node:crypto";
import { countMessagesSince, createMessage, getMessagesByUser, getUser } from "../lib/support.js";
import { DAILY_LIMIT, LIST_LIMIT, toSupportMessage, validateMessageInput } from "../helper/support.js";

const requireUserId = (event) => {
  const userId = event.identity?.sub;
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

export const submitSupportMessageHandler = async (event) => {
  const userId = requireUserId(event);
  const fields = validateMessageInput(event.arguments.input);

  const now = new Date();
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  if ((await countMessagesSince(userId, since, DAILY_LIMIT)) >= DAILY_LIMIT) {
    throw new Error("You've sent a lot of messages today. Please email connect@kudozz.in instead.");
  }

  // Contact details come from the caller's identity/profile, never from arguments.
  const user = await getUser(userId);
  const email = (user?.email || event.identity?.claims?.email || "").toLowerCase();
  const createdAt = now.toISOString();
  const item = {
    id: randomUUID(),
    userId,
    ...(email && { email }),
    ...(user?.name && { name: user.name }),
    ...(user?.companyName && { companyName: user.companyName }),
    ...fields,
    status: "OPEN",
    createdAt,
    updatedAt: createdAt,
  };
  await createMessage(item);
  return toSupportMessage(item);
};

export const listMySupportMessagesHandler = async (event) => {
  const userId = requireUserId(event);
  return (await getMessagesByUser(userId, LIST_LIMIT)).map(toSupportMessage);
};
