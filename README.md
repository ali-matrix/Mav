# MG Asset IMS

An asset inventory management app built with Next.js, React, and TypeScript. It uses a local SQLite database and can sync employee data from the Metis HRMS API.

## Requirements

- Node.js 20 LTS or newer
- npm

Project dependencies are listed in `package.json` and pinned by `package-lock.json`; this Node.js project does not use a Python `requirements.txt`.

## Getting started

1. Install Node.js.
2. From the project directory, install dependencies:

   ```bash
   npm install
   ```

3. Create `.env.local` in the project root and add the Metis HRMS API credentials:

   ```env
   ERP_URL=
   ERP_KEY_ID=
   ERP_SECRET=
   ```

   Keep the real credentials private; do not commit `.env.local`.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

The SQLite database is created automatically at `data/asset.db` when the app starts. Keep a backup of this file if it contains data you need.

## Production

```bash
npm run build
npm start
```

The build command runs the project's `prebuild` script to sync its local UI package before building.
