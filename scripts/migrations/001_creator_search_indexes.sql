-- Indexes backing listCreators filters and sorts (appsync/handlers/creators/helper/filters.js).
-- Sort-index expressions must match SORTS exactly to be used by the planner.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS creators_name_trgm_idx ON creators USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS creators_username_trgm_idx ON creators USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS creators_niches_idx ON creators USING gin (niches);
CREATE INDEX IF NOT EXISTS creators_languages_idx ON creators USING gin (languages);

CREATE INDEX IF NOT EXISTS creators_country_idx ON creators (country);
CREATE INDEX IF NOT EXISTS creators_state_idx ON creators (state);
CREATE INDEX IF NOT EXISTS creators_city_idx ON creators (city);
CREATE INDEX IF NOT EXISTS creators_gender_idx ON creators (gender);

CREATE INDEX IF NOT EXISTS creators_sort_followers_desc_idx ON creators ((COALESCE(followers, -1)) DESC, id DESC);
CREATE INDEX IF NOT EXISTS creators_sort_followers_asc_idx ON creators ((COALESCE(followers, 2147483647)), id);
CREATE INDEX IF NOT EXISTS creators_sort_engagement_idx ON creators
  ((COALESCE(CASE WHEN avg_engagement_rate <= 100 THEN avg_engagement_rate END, -1)) DESC, id DESC);
CREATE INDEX IF NOT EXISTS creators_sort_views_idx ON creators ((COALESCE(avg_views, -1)) DESC, id DESC);
CREATE INDEX IF NOT EXISTS creators_sort_likes_idx ON creators ((COALESCE(avg_likes, -1)) DESC, id DESC);
CREATE INDEX IF NOT EXISTS creators_sort_reel_price_idx ON creators ((COALESCE(NULLIF(reel_price, 0), 2147483647)), id);
CREATE INDEX IF NOT EXISTS creators_sort_newest_idx ON creators (created_at DESC, id DESC);

ANALYZE creators;
