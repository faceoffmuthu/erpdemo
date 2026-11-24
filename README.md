# HAPZO ERP + DPP Frontend Preview

This project is a static, read-only frontend preview of the HAPZO textile ERP and Digital Product Passport workspace. It contains synthetic training records and does not connect to a server or database. Form submissions are disabled and are not saved.

## Build

Install dependencies once:

```sh
npm install
```

Start the local preview:

```sh
npm start
```

This builds the static site and serves it at `http://127.0.0.1:4380/`. The generated site is written to `build/`. To build without starting the preview server, run `npm run build`.

## Preview locally

Do not open `index.html` directly with `file://`, because the sample workspace JSON must be fetched over HTTP. If port 4380 is occupied, stop the other process or start on another port with `$env:HAPZO_PORT=4381; npm start` in PowerShell.

## Data and security

The preview starts without a login and shows only synthetic demo records from `public/demo-state.json`. It has no authentication, backend, API, database, or persistent write feature. Do not use it for real company records.
