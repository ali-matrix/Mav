# Mav Asset IMS

Mav is an asset inventory management application for tracking company devices, their current status, employee assignments, and maintenance history. It is built with Next.js, React, TypeScript, and MongoDB, and can synchronize employee records from the Metis HRMS API.

## Features

- Asset register with search, filters, sorting, pagination, and asset details.
- Asset assignment, transfer, return, status, and maintenance tracking.
- Assignment history and recent activity.
- Employee directory, employee asset details, and optional employee synchronization from Metis HRMS.
- Asset categories, departments, and locations.
- Dashboard with asset totals, categories, departments, costs, and warranty information.
- HTML exports designed to open in a browser or spreadsheet application.
- Light and dark themes.

## Requirements

- **Node.js 20.19 or newer**
- **npm** (included with Node.js)
- **MongoDB**, either a local MongoDB Community Server or a MongoDB-compatible deployment reachable from the computer running Mav
- Network access to the Metis HRMS API and its credentials only if you intend to use employee synchronization

The project dependencies, including the local Metis UI package, are declared in `package.json` and locked in `package-lock.json`. You do not need to install Python or a separate UI package.

## Quick start

### 1. Get the project

Clone the GitHub repository or download and extract its source code. Open a terminal in the project directory (the directory containing `package.json`).

### 2. Install and start MongoDB

Install MongoDB Community Server and make sure its service is running, or prepare a MongoDB connection URI for a database you can access.

By default, Mav connects to:

```text
mongodb://127.0.0.1:27017
```

Mav creates and initializes its collections, indexes, and starter asset categories automatically when it first connects. The default database name is `mav_asset_ims`.

### 3. Install Node.js dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a file named `.env.local` in the project root. For a local MongoDB setup, it can contain:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=mav_asset_ims
```

The MongoDB values are optional when using the defaults above. To use a different MongoDB server or database, replace them with your connection URI and database name.

Metis employee synchronization is optional. Add the following server-side credentials to `.env.local` only if you have been provided access to the Metis HRMS API:

```env
ERP_URL=https://your-metis-api.example/path
ERP_KEY_ID=your-key-id
ERP_SECRET=your-secret
```

Use the actual API endpoint and credentials provided by your Metis administrator; the example values above are placeholders. Keep `.env.local` private and **never commit credentials or secrets to GitHub**. This file is excluded by `.gitignore`.

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser. The development server may take longer to compile a page on its first visit.

## Production build

Create and run an optimized production build:

```bash
npm run build
npm start
```

Then open [http://localhost:3000](http://localhost:3000). `npm start` requires a successful production build first. The build runs a `prebuild` step that synchronizes the included local `metis_ui` package.

For deployment, configure the same environment variables in the hosting provider's server environment. MongoDB must be reachable from the deployed server. Configure the `ERP_*` variables only when employee synchronization is needed. Do not expose secrets as browser/public environment variables.

## Available npm scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server on port 3000. |
| `npm run build` | Synchronize the local UI package and build the production application. |
| `npm start` | Start the production server on port 3000 after building. |
| `npm run ui:sync` | Reinstall/synchronize the included local `metis_ui` package. |

## Main sections

- **Overview** — dashboard summaries and recent assignment activity.
- **Assets** — asset register, asset details, assignment actions, maintenance, and history.
- **Categories** — asset category management.
- **Assignments** — current and past assignment records.
- **Employees** — employee directory and the assets assigned to an employee.
- **Departments** — department list and management.
- **Locations** — location list and management (available as a supporting page).

Exports are generated as HTML files, with tables intended to remain readable when opened or printed.

## Employee synchronization

Employee synchronization is initiated from the Employees page and requires valid `ERP_URL`, `ERP_KEY_ID`, and `ERP_SECRET` values. Requests are signed by the server; the secret is not sent to the browser. Synchronization is subject to a cooldown, and the app protects existing employee data if the ERP returns an empty or unusually small staff list.

If synchronization is not configured, the rest of the app can still be used with employee data already present in MongoDB. The sync action will report that the ERP link needs configuration.

## Troubleshooting

- **Cannot connect to MongoDB:** Confirm MongoDB is running and `MONGODB_URI` points to a reachable server. For local defaults, verify that MongoDB is listening on `127.0.0.1:27017`.
- **Port 3000 is already in use:** Stop the other process using the port, or adjust the `dev`/`start` scripts in `package.json` to use another port.
- **Employee sync reports missing ERP configuration:** Set all three `ERP_*` variables in `.env.local` and restart the app.
- **Build fails after installing dependencies:** Confirm Node.js is version 20.19 or newer, then run `npm install` and retry `npm run build`.

## Data and secrets

Mav stores application data in MongoDB; the default database is `mav_asset_ims`. Back up that database using your normal MongoDB backup process. Keep `.env.local`, database credentials, and ERP secrets out of source control and public logs.
