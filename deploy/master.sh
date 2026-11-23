#!/bin/bash
set -euo pipefail

ENV=master

node mergeSchemas.js
rm -rf .aws-sam/build
sam build
sam deploy --config-env $ENV --profile briggomediatech
