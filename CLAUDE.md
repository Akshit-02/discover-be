# CLAUDE.md

Influencer Discovery Backend — AWS SAM app (nested stacks) modelled on `myw-brand-be`.

## Commands

- `npm install` once, then `node mergeSchemas.js` — merges `appsync/schemas/*.graphql` into `appsync/schema.graphql`. Run before every `sam build`. Never hand-edit `appsync/schema.graphql`.
- `sam validate --lint`, `sam build`
- `bash deploy/develop.sh` / `bash deploy/master.sh` (uses the `briggomediatech` AWS profile).

## Architecture

`template.yaml` (root) defines the shared `LambdaRole` and nested stacks in order:

1. `layers/` — `common` (third-party deps), `dynamodb` (`/opt/nodejs/dynamodb.js` generic helpers), `utils` (`/opt/nodejs/logger.js`).
2. `dynamodb/` — tables (`${StackName}-users`, PK `id` = Cognito `sub`, GSI `usersByEmail`).
3. `cognito/` — email + password user pool, app client (SRP / USER_PASSWORD / refresh), `PostConfirmation` trigger in `cognito/functions/post-confirmation` that creates the users row.
4. `appsync/` — GraphQL API (Cognito user pool auth). Resolvers live in `appsync/stacks/*.yaml`; Lambda code in `appsync/handlers/<domain>/` (`index.js` switch on `fieldName` → `resolvers/` business logic → `lib/` DynamoDB access only).

Table names and other resources are passed as CFN parameters: root `template.yaml` → nested stack `Parameters` → Lambda `Environment.Variables`.

## Conventions

- ES modules (`"type": "module"`).
- `resolvers/` = business logic, `lib/` = DynamoDB only, `helper/` = pure helpers. Layers only hold cross-cutting code.
- Derive caller identity from `event.identity`, never from arguments.
- Keep comments brief.
