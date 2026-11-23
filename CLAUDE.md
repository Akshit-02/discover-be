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
