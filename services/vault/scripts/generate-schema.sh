#!/bin/bash
# GraphQL Schema Generator
# Loads environment variables from .env.local and runs graphql-codegen

set -a  # Automatically export all variables
source .env.local
set +a

# Run graphql-codegen with any additional arguments passed to this script
exec graphql-codegen "$@"
