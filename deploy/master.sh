#!/bin/bash
set -euo pipefail

ENV=master
STACK_NAME=influencer-discovery-master

[ -f ".env.$ENV" ] && source ".env.$ENV"
: "${NEON_DATABASE_URL:?Set NEON_DATABASE_URL (or add it to .env.$ENV)}"
: "${RAZORPAY_KEY_ID:?Set RAZORPAY_KEY_ID (or add it to .env.$ENV)}"
: "${RAZORPAY_KEY_SECRET:?Set RAZORPAY_KEY_SECRET (or add it to .env.$ENV)}"
RAZORPAY_WEBHOOK_SECRET="${RAZORPAY_WEBHOOK_SECRET:-}"

node mergeSchemas.js
rm -rf .aws-sam/build
sam build
sam deploy --config-env $ENV --profile briggomediatech \
  --parameter-overrides \
    Environment=$ENV \
    StackName=$STACK_NAME \
    LogLevel=ERROR \
    NeonDatabaseUrl="$NEON_DATABASE_URL" \
    RazorpayKeyId="$RAZORPAY_KEY_ID" \
    RazorpayKeySecret="$RAZORPAY_KEY_SECRET" \
    RazorpayWebhookSecret="$RAZORPAY_WEBHOOK_SECRET"
