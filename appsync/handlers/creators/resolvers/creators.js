import { queryCreators, queryFacets, queryStats } from "../lib/creators.js";
import { toCreator } from "../helper/creators.js";
import {
  buildListQuery,
  buildStatsQuery,
  clampLimit,
  decodeCursor,
  encodeCursor,
  normalizeFilter,
  resolveSort,
} from "../helper/filters.js";
import { chargeAdvancedFilter, requireUserId } from "./credits.js";

const FACET_TTL_MS = 10 * 60 * 1000;
let facetCache = null;

export const listCreatorsHandler = async (event) => {
  const { filter, sort, limit, nextToken } = event.arguments || {};
  const sortKey = resolveSort(sort);
  const pageSize = clampLimit(limit);
  const normalized = normalizeFilter(filter);
  const cursor = decodeCursor(nextToken, sortKey);
  // Advanced filters are paid per set; this throws before querying when the user can't afford it.
  const billing = await chargeAdvancedFilter(requireUserId(event), normalized);

  // Totals/stats only on the first page; later pages reuse what the client already has.
  const [rows, stats] = await Promise.all([
    queryCreators(buildListQuery({ filter: normalized, sortKey, cursor, limit: pageSize })),
    cursor ? null : queryStats(buildStatsQuery({ filter: normalized })),
  ]);

  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);

  return {
    items: page.map(({ sort_value: _sortValue, ...row }) => toCreator(row)),
    nextToken: hasMore ? encodeCursor(sortKey, page[page.length - 1]) : null,
    totalCount: stats ? stats.total_count : null,
    stats: stats
      ? {
          totalReach: stats.total_reach,
          avgEngagementRate: stats.avg_engagement_rate,
          verifiedCount: stats.verified_count,
        }
      : null,
    creditsCharged: billing ? billing.charged : 0,
    credits: billing ? billing.credits : null,
  };
};

export const creatorFilterOptionsHandler = async () => {
  if (facetCache && Date.now() - facetCache.at < FACET_TTL_MS) return facetCache.value;
  const value = await queryFacets();
  facetCache = { at: Date.now(), value };
  return value;
};
