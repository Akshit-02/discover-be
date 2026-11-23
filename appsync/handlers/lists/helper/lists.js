export const MAX_LISTS_PER_USER = 100;
export const MAX_CREATORS_PER_LIST = 50;
export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 300;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === "string" && UUID_REGEX.test(value);

export const toUserList = (item) => ({
  id: item.id,
  name: item.name,
  description: item.description || null,
  creatorCount: Math.max(item.creatorCount || 0, 0),
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const normalizeName = (name) => (typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "");

export const normalizeDescription = (description) =>
  typeof description === "string" ? description.trim() : "";

export const validateName = (name) => {
  if (!name) throw new Error("List name is required");
  if (name.length > MAX_NAME_LENGTH) throw new Error(`List name must be ${MAX_NAME_LENGTH} characters or fewer`);
};

export const validateDescription = (description) => {
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`);
  }
};

export const clampPageSize = (limit) => Math.min(Math.max(limit || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

export const encodeToken = (key) => (key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null);

export const decodeToken = (token) => {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid nextToken");
  }
};
