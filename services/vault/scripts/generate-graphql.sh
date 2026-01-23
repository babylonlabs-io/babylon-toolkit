#!/bin/bash
# GraphQL Type Generator
# Loads environment variables from .env.local and runs graphql-codegen
# to generate TypeScript types from GraphQL queries

# Ensure the .env.local file exists
if [ ! -f ".env.local" ]; then
  echo "Error: .env.local file not found in $(pwd)." >&2
  echo "Please create .env.local based on .env.example" >&2
  exit 1
fi

set -a  # Automatically export all variables
source .env.local
set +a

# Ensure required environment variable is set
if [ -z "${NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT:-}" ]; then
  echo "Error: NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT is not set in .env.local." >&2
  echo "Please add it to your .env.local file" >&2
  exit 1
fi

# Run graphql-codegen with any additional arguments passed to this script
exec graphql-codegen "$@"
