export const INDUSTRIES = [
  "FASHION",
  "BEAUTY",
  "FOOD_BEVERAGE",
  "HEALTH_FITNESS",
  "ELECTRONICS",
  "TRAVEL",
  "FINANCE",
  "EDUCATION",
  "ENTERTAINMENT",
  "HOME_LIFESTYLE",
  "AUTOMOTIVE",
  "TECHNOLOGY",
  "AGENCY",
  "OTHER",
];
export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
export const MONTHLY_BUDGETS = ["UNDER_50K", "50K_2L", "2L_10L", "10L_PLUS", "NOT_SURE"];

const TEXT_LIMITS = { name: 80, jobTitle: 80, companyName: 120, city: 80, country: 80 };
const OPTIONAL_TEXT = ["jobTitle", "companyName", "city", "country"];

const clean = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");

const checkLength = (field, value) => {
  if (value.length > TEXT_LIMITS[field]) throw new Error(`${field} must be ${TEXT_LIMITS[field]} characters or fewer`);
};

const checkEnum = (field, value, allowed) => {
  if (value && !allowed.includes(value)) throw new Error(`Invalid ${field}`);
};

export const normalizePhone = (raw) => {
  const value = clean(raw);
  if (!value) return "";
  if (!/^\+?[\d\s()-]+$/.test(value)) throw new Error("Enter a valid phone number");
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new Error("Enter a valid phone number");
  return value.startsWith("+") ? `+${digits}` : digits;
};

export const normalizeWebsite = (raw) => {
  const value = clean(raw);
  if (!value) return "";
  if (value.length > 200) throw new Error("Website must be 200 characters or fewer");
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error("Enter a valid website, e.g. kudozz.in");
  }
  if (!["http:", "https:"].includes(url.protocol) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) {
    throw new Error("Enter a valid website, e.g. kudozz.in");
  }
  return url.toString().replace(/\/$/, "");
};

/** Validates and normalises the profile input. Empty strings mean "cleared". */
export const buildProfileUpdate = (input = {}) => {
  const name = clean(input.name);
  if (name.length < 2) throw new Error("Name must be at least 2 characters");
  checkLength("name", name);

  const update = { name };
  OPTIONAL_TEXT.forEach((field) => {
    if (input[field] === undefined || input[field] === null) return;
    const value = clean(input[field]);
    checkLength(field, value);
    update[field] = value;
  });

  if (input.phone !== undefined && input.phone !== null) update.phone = normalizePhone(input.phone);
  if (input.companyWebsite !== undefined && input.companyWebsite !== null) {
    update.companyWebsite = normalizeWebsite(input.companyWebsite);
  }

  [
    ["industry", INDUSTRIES],
    ["companySize", COMPANY_SIZES],
    ["monthlyBudget", MONTHLY_BUDGETS],
  ].forEach(([field, allowed]) => {
    if (input[field] === undefined || input[field] === null) return;
    const value = clean(input[field]);
    checkEnum(field, value, allowed);
    update[field] = value;
  });

  if (typeof input.marketingOptIn === "boolean") update.marketingOptIn = input.marketingOptIn;
  return update;
};

const OUTPUT_FIELDS = [
  "name",
  "phone",
  "jobTitle",
  "companyName",
  "companyWebsite",
  "industry",
  "companySize",
  "monthlyBudget",
  "city",
  "country",
];

export const toUser = (item) =>
  item && {
    id: item.id,
    email: item.email,
    ...Object.fromEntries(OUTPUT_FIELDS.map((f) => [f, item[f] || null])),
    marketingOptIn: Boolean(item.marketingOptIn),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
