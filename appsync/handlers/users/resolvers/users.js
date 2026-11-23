import { getUserById } from "../lib/users.js";

export const getUserByIdHandler = async (event) => {
  const { id } = event.arguments;
  if (!id) throw new Error("id is required");
  return (await getUserById(id)) || null;
};
