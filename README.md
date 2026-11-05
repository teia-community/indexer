# TezTok NFT Indexer

An indexer that reads NFT activity on the Tezos blockchain — mints, transfers, listings, sales,
offers — normalizes it into a common data model, and serves it through a GraphQL API.

This is the version maintained by the [Teia](https://teia.art) community. It started as a fork of
[TezTok](https://github.com/teztok/indexer), which is no longer maintained, and is what powers
Teia's API.

**This fork is tailored specifically to [teia.art](https://teia.art).** Its priorities are the Hic et
Nunc / Teia OBJKT contract and what the Teia frontend needs: SUBJKT profiles, split contracts,
signatures and image previews, which the Teia plugin adds. Teia's instance indexes only that contract
(`ALLOWED_FA2_CONTRACT_ADDRESS`). The handlers for other marketplaces that TezTok supported are still
in the code, but they are not what this fork is maintained or tested for, so do not expect it to be a
general-purpose Tezos NFT indexer.

## Public API

```
https://teztok.teia.art/v1/graphql
```

For example, the five most recently minted OBJKTs on the Hic et Nunc / Teia contract:

```graphql
query RecentMints {
  tokens(
    where: { fa2_address: { _eq: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" } }
    order_by: { minted_at: desc_nulls_last }
    limit: 5
  ) {
    token_id
    name
    artist_address
    minted_at
  }
}
```

See [docs/examples.md](docs/examples.md) for more queries and the data model pages under [docs/](docs/README.md)
for what each table holds.

## How it works

Everything runs off one Postgres database, which also holds the job queues
([graphile-worker](https://worker.graphile.org)):

- **ctrl** follows new blocks from a [TzKT](https://tzkt.io) instance and queues each level for indexing.
- **event-producer** fetches a level's transactions and originations from TzKT and turns the ones it
  recognizes into events: a mint, a listing, a sale and so on.
- **rebuild** recomputes a token's state (owners, listings, offers, tags, royalties) from all of its events.
- **fetch-metadata** downloads token metadata from IPFS.
- **[Hasura](https://hasura.io)** exposes the tables as the GraphQL API.

Marketplace specific logic lives in event handlers, and Teia specific data in a plugin. The
[architecture](docs/architecture.md), [events](docs/events.md) and [plugins](docs/plugins.md) pages go
into detail.

## Running it

- **An instance**: published images and a compose setup, including restoring from a backup and
  upgrading, are in [deploy/](deploy/README.md).
- **From source**, for development: [docs/installation.md](docs/installation.md).

Images are published to `ghcr.io/teia-community/indexer` for every commit on `main` (`sha-<commit>`)
and for release tags. There is deliberately no `latest`, so a deployment always names the exact
revision it runs.

## Development

```bash
npm install
npm run build   # compile TypeScript to build/
npm test        # jest
npm run format  # prettier with the project's settings
```

Tests run in CI on every pull request, and an image is only published for commits that pass them.
Pull requests go to `main` of [teia-community/indexer](https://github.com/teia-community/indexer).

## License

Licensed under the MIT license.
