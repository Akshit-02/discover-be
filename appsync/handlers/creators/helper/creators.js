const DATE_FIELDS = new Set(["createdAt", "updatedAt"]);

const toCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const toIso = (value) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const toCreator = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const field = toCamel(key);
      return [field, DATE_FIELDS.has(field) && value != null ? toIso(value) : value];
    }),
  );
