export const MESSAGE_TYPES = ["SUGGESTION", "FEEDBACK", "QUERY", "BUG"];
export const LIMITS = { subjectMin: 3, subjectMax: 120, messageMin: 10, messageMax: 2000 };
// Abuse guard: at most this many messages per user in a rolling 24h window.
export const DAILY_LIMIT = 10;
export const LIST_LIMIT = 20;

const clean = (value) => (typeof value === "string" ? value.trim() : "");

/** Validates SupportMessageInput and returns normalised fields. */
export const validateMessageInput = (input = {}) => {
  const type = clean(input.type).toUpperCase();
  if (!MESSAGE_TYPES.includes(type)) throw new Error("Choose what this message is about");

  const subject = clean(input.subject).replace(/\s+/g, " ");
  if (subject.length < LIMITS.subjectMin) throw new Error(`Subject must be at least ${LIMITS.subjectMin} characters`);
  if (subject.length > LIMITS.subjectMax) throw new Error(`Subject must be ${LIMITS.subjectMax} characters or fewer`);

  // Keep line breaks, collapse runs of blank lines.
  const message = clean(input.message).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (message.length < LIMITS.messageMin) throw new Error(`Message must be at least ${LIMITS.messageMin} characters`);
  if (message.length > LIMITS.messageMax) throw new Error(`Message must be ${LIMITS.messageMax} characters or fewer`);

  const page = clean(input.page).slice(0, 200);
  return { type, subject, message, ...(page && { page }) };
};

export const toSupportMessage = (item) =>
  item && {
    id: item.id,
    type: item.type,
    subject: item.subject,
    message: item.message,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
