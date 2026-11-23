import { listCreators } from "../lib/creators.js";
import { toCreator } from "../helper/creators.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const listCreatorsHandler = async (event) => {
  const { limit, nextToken } = event.arguments || {};
  const pageSize = Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT);

  if (nextToken && !UUID_REGEX.test(nextToken)) {
    throw new Error("Invalid nextToken");
  }

  const rows = await listCreators({
    limit: pageSize + 1,
    afterId: nextToken || null,
  });

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(toCreator);

  return {
    items,
    nextToken: hasMore ? items[items.length - 1].id : null,
  };
};
