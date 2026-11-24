# Mav Asset IMS

Mav is an asset inventory management application for tracking company devices, their status, employee assignments, and maintenance history. It is built with Next.js, React, TypeScript, and MongoDB. Employee synchronization from Metis HRMS is optional.

## Features

- Asset register with case-insensitive substring search, filters, sorting, and pagination.
- Asset assignment, transfer, return, status, maintenance, and history management.
- Assignment history and recent activity.
- Employee directory and optional employee synchronization from Metis HRMS.
- Category, department, and location management.
- Dashboard totals, categories, departments, asset values, warranties, and recent assignments.
- HTML exports designed to open in a browser or spreadsheet application.
- Light and dark themes.

## Requirements

- Node.js 20.19 or newer and npm.
- MongoDB reachable by the app. A replica set (including a single-node replica set) or sharded cluster is required for transactional live dashboard summaries and the optimization migration.
- Metis HRMS API credentials only if you intend to synchronize employees.

The local Metis UI package is included in this repository and installed through npm. Python or a separately installed UI package is not required.

## Get started from a fresh checkout

Clone the repository and open its root directory:

```powershell
git clone https://github.com/ali-matrix/Mav.git
Set-Location Mav
```

### 1. Install MongoDB

Use an existing MongoDB replica set or create a local single-node replica set. For a **new** local MongoDB installation, enable replica sets in the MongoDB configuration file:

```yaml
replication:
  replSetName: rs0
```

Restart MongoDB, then initialize the replica set once:

```powershell
mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
```

Wait for the node to become primary:

```powershell
mongosh --eval "db.hello().isWritablePrimary"
```

Do not reconfigure an existing MongoDB data directory without a backup and a maintenance plan.

### 2. Install the app and configure it

From the folder containing `package.json`:

```powershell
npm ci
Copy-Item .env.example .env.local
```

`.env.example` contains safe local defaults. Edit `.env.local` if MongoDB is hosted elsewhere:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB=mav_asset_ims
```

The app's default database name is `mav_asset_ims`. The URI and database name above can be changed to point to a different replica set/database. For MongoDB Atlas, use the provided `mongodb+srv://` URI and ensure the database user and network access rules are configured. URL-encode reserved characters in credentials.

### 3. Start the development app

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first connection, Mav creates its collections and operational indexes, and inserts starter categories if the categories collection is empty. A new empty database contains no assets; add/import your own assets using your organization's established process.

To run a production build locally instead:

```powershell
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000). `npm start` requires a successful build. The build's `prebuild` step synchronizes the included local Metis UI package.

## Existing or production database setup

If the database already contains assets and you want the optimized substring-search and live dashboard-summary paths, perform the one-time backfill before deploying the optimized app:

1. Back up the database and confirm the target database name and MongoDB URI.
2. Use a replica set or sharded cluster.
3. Stop application instances and other processes that write asset/assignment data.
4. In PowerShell, set the exact target and run the migration:

```powershell
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/?replicaSet=rs0"
$env:MONGODB_DB = "mav_asset_ims"
$env:MAV_DB_MAINTENANCE = "1"
npm run db:optimize
if ($LASTEXITCODE -ne 0) { throw "Database optimization failed; do not start the app until it is resolved." }
Remove-Item Env:MAV_DB_MAINTENANCE
```

5. Start the app only after the migration completes successfully.

The migration backfills derived substring-search metadata, builds its supporting indexes, rebuilds dashboard summary/activity collections, and prints a completion summary. It does not create, delete, or change business asset records, but it does write derived fields and collections and may use substantial disk, CPU, and I/O. Duration depends on dataset size and MongoDB hardware. Do not run multiple copies concurrently or run it against a live production database without a planned maintenance window.

The migration is also the reconciliation process for derived data: take a fresh backup, stop writes, and rerun it against the intended database if a full rebuild is needed. It requires `MAV_DB_MAINTENANCE=1` as an explicit safeguard and refuses standalone MongoDB deployments. The regular app startup creates necessary indexes once the migration has marked the derived data ready.

## Isolated million-asset load test

The repository includes a **synthetic data generator** for a separate database named `mav_asset_ims_loadtest`. It creates 1,000,000 fake assets, 368 fake employees, categories, departments, locations, and counters. It does not write to the normal `mav_asset_ims` database and refuses to seed if the load-test database already has any collections.

> **Use only an isolated test MongoDB deployment.** The seed script uses `MONGODB_URI` from `.env.local` (or its local replica-set default) but always writes to the fixed `mav_asset_ims_loadtest` database name. Never point it at a company/production MongoDB cluster. Seeding takes substantial time and disk space; do not interrupt it or run multiple seeders.

### Create the synthetic database from scratch

Start the local replica set, then install dependencies and configure `.env.local` to point to that local test MongoDB. For example:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB=mav_asset_ims
```

From the repository root, seed the isolated database:

```powershell
node scripts/seed-load-test.mjs
```

The generator prints progress and verifies the inserted asset/employee counts. It cannot be run a second time against the same seeded database; it will refuse to proceed rather than overwrite existing collections. Resetting that dataset requires an intentional, separately verified administrative removal of **only** `mav_asset_ims_loadtest`. Do not use a broad database cleanup command.

### Build optimized search/dashboard data for the test database

Set `MONGODB_DB` explicitly so the migration targets the load-test database rather than the normal app database:

```powershell
$env:MONGODB_DB = "mav_asset_ims_loadtest"
$env:MAV_DB_MAINTENANCE = "1"
npm run db:optimize
if ($LASTEXITCODE -ne 0) { throw "Load-test database optimization failed; do not start the app." }
Remove-Item Env:MAV_DB_MAINTENANCE
```

The migration is an offline preparation step and can take a long time on one million assets. Wait for its success summary before starting the app. It only rebuilds derived search/dashboard data for the database named in `MONGODB_DB`.

### Run the app against the load-test database

Keep the database selection in the same PowerShell window where you start Next.js:

```powershell
$env:MONGODB_DB = "mav_asset_ims_loadtest"
npm run dev
```

Or, after `npm run build`, use:

```powershell
$env:MONGODB_DB = "mav_asset_ims_loadtest"
npm start
```

Open [http://localhost:3000](http://localhost:3000). When finished, stop the app with `Ctrl+C` and restore the ordinary database selection:

```powershell
Remove-Item Env:MONGODB_DB
```

The app then uses `MONGODB_DB` from `.env.local`, or the default `mav_asset_ims` if it is not set. This only changes the app's selected database; it does not delete the test data.

### Check the load-test results

The synthetic dataset is designed for repeatable search and dashboard checks. With the app pointed at `mav_asset_ims_loadtest`, these requests should report the expected totals:

| Request | Expected total |
| --- | ---: |
| `/api/assets?q=Dell` | 200,000 assets |
| `/api/assignments?q=Dell` | 66,666 assignments |
| `/api/assets?q=TEST-0001` | 980 assets |
| `/api/assets?q=ACC-0000011` | 1 exact tag match |

For example, run in PowerShell while the app is running:

```powershell
(Invoke-RestMethod "http://localhost:3000/api/assets?q=Dell&page=1&pageSize=25").total
(Invoke-RestMethod "http://localhost:3000/api/assignments?q=Dell&page=1&pageSize=25").total
(Invoke-RestMethod "http://localhost:3000/api/assets?q=TEST-0001&page=1&pageSize=25").total
(Invoke-RestMethod "http://localhost:3000/api/assets?q=ACC-0000011&page=1&pageSize=25").total
Invoke-RestMethod "http://localhost:3000/api/dashboard" | ConvertTo-Json -Depth 6
```

The dashboard totals for this generated dataset include 980,000 active assets and total active value `245294379999` (PKR 245,294,379,999). Also try mixed-case searches (for example `dElL`), page 2, no-match queries, sorting, and combinations of search text with status/category/department filters. The `/api/assets` and `/api/assignments` endpoints include total counts and paginated rows.

## Employee synchronization

Synchronization is optional and is initiated from the Employees page. Add server-side Metis HRMS credentials to `.env.local` only if you have been granted access:

```env
ERP_URL=https://your-metis-api.example/path
ERP_KEY_ID=your-key-id
ERP_SECRET=your-secret
```

Replace these placeholders with values from your Metis administrator. Requests are signed on the server; the secret is not sent to the browser. Synchronization has a cooldown and protects existing employee data if the ERP returns an empty or unusually small staff list. Without these values, other app features can still use employee records already in MongoDB.

## npm commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies from the lock file. |
| `npm run dev` | Run the development app on port 3000. |
| `npm run build` | Synchronize the local UI package and create a production build. |
| `npm start` | Run the production build on port 3000. |
| `npm run ui:sync` | Synchronize/reinstall the included local Metis UI package. |
| `npm run db:optimize` | Backfill derived search metadata and rebuild dashboard/activity summaries for `MONGODB_DB`. |

## Environment and Git safety

`.env.local` is for machine-specific MongoDB settings and optional ERP credentials. The `.gitignore` rules exclude `.env` files (except the safe `.env.example` template), Next.js output, dependencies, local database files, logs, and local editor/diagnostic data. Never commit `.env.local`, MongoDB credentials, ERP secrets, backups, or real company data. Before pushing, review `git status` and `git diff --check`.

## Troubleshooting

- **MongoDB connection timeout:** Verify the MongoDB service is running, the URI is reachable, replica-set name matches, and the node is primary. Check Atlas IP access and database-user permissions if using Atlas.
- **Transaction/replica-set error:** The live summary/migration requires a replica set or sharded deployment. A standalone MongoDB instance can use fallback dashboard aggregations but cannot run `db:optimize`.
- **App shows the wrong database:** Check `$env:MONGODB_DB` in the same PowerShell window where Next.js runs. Remove it with `Remove-Item Env:MONGODB_DB` to return to the `.env.local`/default database.
- **Load-test seeder refuses to run:** This is intentional when `mav_asset_ims_loadtest` already contains collections. Verify the target carefully; do not bypass the guard or point the seeder at a company database.
- **Port 3000 already in use:** Stop the other app process or run a second local instance explicitly, for example `npx next dev -H 127.0.0.1 -p 3001` (or `npx next start -H 127.0.0.1 -p 3001` after building).
- **Build fails after installing dependencies:** Confirm Node.js is version 20.19 or newer, run `npm ci`, then retry `npm run build`.

## Data and backups

Application data is stored in MongoDB, not in the repository. The normal local database is `mav_asset_ims`; the synthetic performance database is `mav_asset_ims_loadtest`. Back up real data using your organization's MongoDB backup process. Keep production and load-test environments separate.
