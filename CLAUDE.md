# CLAUDE.md

Influencer Discovery Backend — AWS SAM app (nested stacks) modelled on `myw-brand-be`.

## Commands

- `npm install` once, then `node mergeSchemas.js` — merges `appsync/schemas/*.graphql` into `appsync/schema.graphql`. Run before every `sam build`. Never hand-edit `appsync/schema.graphql`.
- `sam validate --lint`, `sam build`
- `bash deploy/master.sh` — uses the `briggomediatech` AWS profile; needs `NEON_DATABASE_URL` (env var or `.env.master`, gitignored) which is passed as the `NeonDatabaseUrl` parameter.

## Architecture

`template.yaml` (root) defines the shared `LambdaRole` and nested stacks in order:

1. `layers/` — `common` (third-party deps), `dynamodb` (`/opt/nodejs/dynamodb.js` generic helpers, object args), `utils` (`/opt/nodejs/logger.js`), `postgres` (`/opt/nodejs/postgres.js` → `getSql()` Neon HTTP client, reads `DATABASE_URL`).
2. `dynamodb/` — tables (`${StackName}-users`, PK `id` = Cognito `sub`, GSI `usersByEmail`).
3. `cognito/` — email + password user pool, app client (SRP / USER_PASSWORD / refresh), `PostConfirmation` trigger in `cognito/functions/post-confirmation` that creates the users row.
4. `appsync/` — GraphQL API (Cognito user pool auth). Resolvers live in `appsync/stacks/*.yaml`; Lambda code in `appsync/handlers/<domain>/` (`index.js` switch on `fieldName` → `resolvers/` business logic → `lib/` DynamoDB access only).

Creators live in Neon Postgres (`creators` table), served by `appsync/handlers/creators` in `appsync/stacks/creatorStack.yaml`. `lib/` runs SQL via `getSql()` tagged templates (always parameterised), `helper/` maps snake_case rows to camelCase GraphQL fields.
- `listCreators(filter, sort, limit, nextToken)`: `helper/filters.js` builds parameterised WHERE/ORDER BY (never interpolate user input) with keyset pagination; the cursor is base64url `{s: sort, v: sort value as text, id}`. `totalCount`/`stats` come only with the first page. `creatorFilterOptions` returns facet counts, cached 10 min in the Lambda.
- Sort expressions in `SORTS` must match the expression indexes in `scripts/migrations/*.sql`; apply them with `npm run db:migrate` (idempotent).

Credits live in DynamoDB table `${StackName}-credits` (logic in `appsync/handlers/creators`: `helper/credits.js` costs/rules, `lib/credits.js`, `resolvers/credits.js`):
- Wallet `pk=USER#<id>, sk=WALLET` (`balance`, `expiresAt`). Signup grants 50 credits expiring 30 days after account creation (post-confirmation trigger; `ensureWallet` creates it lazily for older accounts). Expired wallets spend nothing.
- Revealed contacts are stored per user on the unlock row (`sk=UNLOCK#EMAIL|PHONE#<creatorId>`, with `value`, `creatorId`, `username`); repeat reveals and profile opens return the stored value without charging.
- Costs: advanced filter set 2 (hash of the non-basic filter fields; same set free for 24h via an expiring unlock), open profile 1, reveal email 1, reveal phone 2. Unlocks `sk=UNLOCK#<KIND>#<ref>` make repeats free; missing contacts are never charged.
- `chargeForUnlock` is one transaction: conditional wallet decrement + unlock put + ledger row `sk=TXN#...`.
- Creator rows never include `email`/`phone` (only `hasEmail`/`hasPhone`); values come only from `revealCreatorContact` / `openCreatorProfile`.
- Insufficient credits returns `{ __error }` from the Lambda, which the creator stack's resolver turns into GraphQL errorType `InsufficientCredits`.

Personal lists live in DynamoDB table `${StackName}-user-lists` (handler `appsync/handlers/lists`, stack `appsync/stacks/listStack.yaml`):
- List: `pk=USER#<userId>`, `sk=LIST#<listId>` (name, description, creatorCount).
- Member: `pk=LIST#<listId>`, `sk=CREATOR#<creatorId>`, `addedAt` (LSI `byAddedAt` for newest-first paging), `gsi1pk=USER#<userId>`, `gsi1sk=CREATOR#<creatorId>#LIST#<listId>` (GSI `gsi1` for "which of my lists contain this creator").
- Add/remove are `genericTransactWrite` transactions (member row + `creatorCount`), conditioned on the list existing under the caller's own `USER#` key, so ownership is enforced by the key itself. Creator details are read from Postgres by id at query time.

Table names and other resources are passed as CFN parameters: root `template.yaml` → nested stack `Parameters` → Lambda `Environment.Variables`.

## Conventions

- ES modules (`"type": "module"`).
- `resolvers/` = business logic, `lib/` = DynamoDB only, `helper/` = pure helpers. Layers only hold cross-cutting code.
- Derive caller identity from `event.identity`, never from arguments.
- Keep comments brief.
