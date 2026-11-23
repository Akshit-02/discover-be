import { getUserById, upsertUser } from "../lib/users.js";
import { buildProfileUpdate, toUser } from "../helper/profile.js";

const requireUserId = (event) => {
  const userId = event.identity?.sub;
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

export const getUserByIdHandler = async (event) => {
  const userId = requireUserId(event);
  const { id } = event.arguments;
  if (!id) throw new Error("id is required");
  if (id !== userId) throw new Error("Unauthorized");
  return toUser(await getUserById(id)) || null;
};

export const getMeHandler = async (event) => {
  const userId = requireUserId(event);
  return toUser(await getUserById(userId)) || null;
};

export const updateMyProfileHandler = async (event) => {
  const userId = requireUserId(event);
  const update = buildProfileUpdate(event.arguments.input);
  const now = new Date().toISOString();
  const email = event.identity?.claims?.email;

  const saved = await upsertUser(
    userId,
    { ...update, updatedAt: now },
    { createdAt: now, ...(email && { email: email.toLowerCase() }) },
  );
  return toUser(saved);
};
