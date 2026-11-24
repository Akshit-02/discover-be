const DATE_FIELDS = new Set(["createdAt", "updatedAt"]);
// Contact details are paid reveals: never sent with creator rows, only whether they exist.
const PRIVATE_FIELDS = new Set(["email", "phone"]);

const toCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const toIso = (value) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const present = (value) => typeof value === "string" && value.trim() !== "";

export const toCreator = (row) => ({
  ...Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !PRIVATE_FIELDS.has(key))
      .map(([key, value]) => {
        const field = toCamel(key);
        return [field, DATE_FIELDS.has(field) && value != null ? toIso(value) : value];
      }),
  ),
  hasEmail: present(row.email),
  hasPhone: present(row.phone),
});
