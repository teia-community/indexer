# Installation

## Running an instance

Instances run from the published images with docker compose. Everything needed to
set one up — the compose file, a sample `.env`, the hasura metadata, restoring from
a backup and upgrading — is in [`deploy/`](../deploy/README.md).

## Running the indexer from source

For development you can run the indexer straight from the repository, against a
local postgres. This needs **Node.js** 22 or later and **docker**.

```bash
git clone git@github.com:teia-community/indexer.git
cd indexer
npm install
cp .env.sample .env
```

Edit `.env`: at least `TZKT_API` and `IPFS_GATEWAY`. The database settings in
`.env.sample` match this throwaway postgres:

```bash
docker run -d --name teztok-dev-db -p 6666:5432 \
  -e POSTGRES_USER=teztok -e POSTGRES_PASSWORD=teztok -e POSTGRES_DB=teztok \
  postgres:18
```

Create the schema and the teia plugin's tables, then start the indexer:

```bash
npm run init:db
node build/scripts/create-plugin-tables.js teia
npm start
```

It starts indexing at block 1365000 (end of February 2021). A full index takes a
long time; for anything beyond development, restore a backup as described in
[`deploy/README.md`](../deploy/README.md) instead.

## Navigation

- [← Back to Introduction](index.md)
- [Architecture →](architecture.md)
