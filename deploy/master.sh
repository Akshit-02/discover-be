#!/bin/bash
set -euo pipefail

ENV=master
STACK_NAME=influencer-discovery-master

[ -f ".env.$ENV" ] && source ".env.$ENV"
: "${NEON_DATABASE_URL:?Set NEON_DATABASE_URL (or add it to .env.$ENV)}"

node mergeSchemas.js
rm -rf .aws-sam/build
sam build
sam deploy --config-env $ENV --profile briggomediatech \
  --parameter-overrides \
    Environment=$ENV \
    StackName=$STACK_NAME \
    LogLevel=ERROR \
    NeonDatabaseUrl="$NEON_DATABASE_URL"
