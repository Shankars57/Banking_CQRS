# Banking CQRS Backend

A backend banking system built with `Node.js`, `Express`, `PostgreSQL`, `Sequelize`, and `Docker` using `Event Sourcing + CQRS`.

## Overview

This project models a bank account system where:

- All state changes are stored as immutable events.
- The event store is the source of truth.
- Read operations use projections, not the event stream.
- Aggregate state is rebuilt by replaying events or by loading a snapshot plus the remaining events.

## Core Concepts

### Event Sourcing

Instead of directly updating the current account record, the system writes events such as:

- `AccountCreated`
- `MoneyDeposited`
- `MoneyWithdrawn`
- `AccountClosed`

The current state of an account is reconstructed from those events.

### CQRS

The write side and read side are separated:

- Command side writes events to the event store.
- Query side reads from projections for fast API responses.

## Features

- Create account
- Deposit money
- Withdraw money
- Close account
- Get account summary
- Get transaction history with pagination
- Get all events for an account
- Get balance at a specific timestamp
- Rebuild projections
- Snapshotting every 50 events
- Idempotent deposit and withdrawal commands using `transactionId`

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Sequelize
- Docker

## Database Tables

### `events`

Stores immutable domain events.

Key fields:

- `event_id`
- `aggregate_id`
- `aggregate_type`
- `event_type`
- `event_data`
- `event_number`
- `timestamp`
- `version`

### `snapshots`

Stores aggregate snapshots for replay optimization.

### `account_summaries`

Projection used to serve account summary queries.

### `transaction_history`

Projection used to serve paginated transaction queries.

## Project Structure

```text
controllers/    HTTP controllers
domain/         Pure aggregate state transition logic
errors/         Custom application errors
models/         Sequelize models
routes/         API routes
seeds/          PostgreSQL schema and sample data
services/       Command, query, event-store, and projection logic
server.js       App bootstrap
db.js           Database connection and runtime DB setup
```

## Environment Variables

The project uses `.env` for configuration.

Example values:

```env
PORT=3030
API_PORT=3030
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=shankar
POSTGRES_DB=banking
DB_USER=postgres
DB_PASSWORD=shankar
DB_NAME=banking
```

## Running Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

You can either use your local PostgreSQL instance or Docker.

### 3. Start the server

```bash
npm start
```

The API will run on:

```text
http://localhost:3030
```

## Running With Docker

Start the full stack:

```bash
docker compose up --build
```

This starts:

- `app` service
- `db` service

The `db` container runs SQL from the `seeds/` folder during initialization.

## API Endpoints

Base URL:

```text
http://localhost:3030
```

### Health

#### `GET /health`

Checks whether the API is running.

### Command Side

#### `POST /accounts`

Create a new account.

Request body:

```json
{
  "accountId": "acc-postman-001",
  "ownerName": "Shankar",
  "currency": "INR"
}
```

#### `POST /accounts/:accountId/deposits`

Deposit money.

Request body:

```json
{
  "transactionId": "txn-dep-001",
  "amount": 500,
  "description": "Initial cash deposit"
}
```

#### `POST /accounts/:accountId/withdrawals`

Withdraw money.

Request body:

```json
{
  "transactionId": "txn-wd-001",
  "amount": 125,
  "description": "ATM withdrawal"
}
```

#### `POST /accounts/:accountId/close`

Close an account.

Request body:

```json
{
  "description": "Closing account after testing"
}
```

### Query Side

#### `GET /accounts/:accountId`

Get account summary from `account_summaries`.

#### `GET /accounts/:accountId/transactions?page=1&pageSize=10`

Get paginated transaction history from `transaction_history`.

#### `GET /accounts/:accountId/events`

Get all stored events for the account from the event store.

#### `GET /accounts/:accountId/balance-at?timestamp=2026-03-20T23:59:59.000Z`

Get account balance at a specific point in time.

### System

#### `POST /projections/rebuild`

Drops and rebuilds projections from the event store.

## Recommended Test Flow

Use this order in Postman:

1. `GET /health`
2. `POST /accounts`
3. `POST /accounts/:accountId/deposits`
4. `POST /accounts/:accountId/withdrawals`
5. `GET /accounts/:accountId`
6. `GET /accounts/:accountId/transactions?page=1&pageSize=10`
7. `GET /accounts/:accountId/events`
8. `GET /accounts/:accountId/balance-at?...`
9. `POST /accounts/:accountId/close`
10. `POST /projections/rebuild`

## Business Rules

- Cannot create duplicate account
- Cannot withdraw more than current balance
- Cannot operate on a closed account
- Transaction IDs must be unique for idempotent monetary commands

## Snapshot Strategy

- Snapshot interval: every `50` events
- On load:
  - fetch latest snapshot
  - fetch events after snapshot
  - rebuild state from snapshot + remaining events

## Design Notes

- `events` is the source of truth
- `account_summaries` and `transaction_history` are read models
- Query APIs do not depend on full event replay
- Time-travel and event history intentionally read from the event store

## Error Handling

The API returns structured errors such as:

```json
{
  "code": "ACCOUNT_ALREADY_EXISTS",
  "message": "Account already exists"
}
```

Other examples:

- `ACCOUNT_NOT_FOUND`
- `ACCOUNT_CLOSED`
- `INSUFFICIENT_FUNDS`
- `INVALID_AMOUNT`
- `INVALID_CURRENCY`
- `DUPLICATE_TRANSACTION_ID`

## Interview Summary

If you need a short explanation:

> This project is a bank account backend using Event Sourcing and CQRS. The write side stores immutable events in PostgreSQL, the read side uses projections for fast queries, snapshots improve replay performance, and idempotent transaction IDs make monetary commands safe for retries.

## Current Status

- Main command APIs implemented
- Main query APIs implemented
- Projection rebuild implemented
- Snapshotting implemented
- Dockerized app and database setup included

## Limitations

- Automated tests are not yet added
- Projection updates are handled synchronously inside the request transaction
- Authentication and authorization are not included
