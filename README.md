# Parametric Model Projects

Single host app for uploading `FCStd` and `STEP` files as shareable project pages.

## What It Does

- admin uploads a model on the home page
- the app creates a local project workspace under `projects-data/<project-id>`
- `FCStd` uploads become configurable pages powered by spreadsheet alias discovery
- `STEP` uploads become preview-and-download pages
- end users open `/projects/<project-id>`, preview the model, adjust parameters when available, and download printable outputs

## Runtime Notes

- FreeCAD runs behind the scenes on the server side
- the app auto-detects common macOS FreeCAD install paths before falling back to `FreeCADCmd`
- no end user needs to open FreeCAD directly

## Admin Authentication

- `/admin` and `POST /api/projects` are protected with a server-side login flow
- Sign-in happens at `/login`, which sets an `HttpOnly` session cookie after the server validates credentials
- Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in local env files or in your Vercel project settings
- Optionally set `ADMIN_SESSION_SECRET` to control session invalidation independently from the password
- Public project pages under `/projects/<project-id>` remain accessible without auth

Example local env:

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=replace-this-with-a-long-random-string
```

## Vercel Deployment

- A standard Vercel deploy can host this app as a read-only viewer for bundled `projects-data`
- New uploads are disabled on Vercel by default because serverless functions do not provide durable local storage for project workspaces
- New preview and export generation are also disabled by default because this app shells out to a local FreeCAD runtime
- Cached preview artifacts already committed under `projects-data/*/cache/previews` still work when they are requested
- STEP source downloads still work for STEP-backed projects because those files can be streamed directly from the bundled project source

If you deploy to Vercel, the simplest setup is:

```bash
vercel
```

That deployment will let you browse the bundled sample projects already in this repository.

If you want full production behavior later, you will need both:

- persistent storage for uploaded projects
- a separate FreeCAD-capable worker/service for preview and export generation

## Commands

```bash
npm install
npm run dev
npm test
```
