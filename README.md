<div align="center">

# oc3-frontend

**The web interface of the [OpenSVC](https://www.opensvc.com) collector, rebuilt in React on top of the [oc3](https://github.com/opensvc/oc3) API.**

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
![React 19](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind%20CSS-4-06b6d4?logo=tailwindcss&logoColor=white)

</div>

---

oc3-frontend is a single-page application that replaces the web2py + jQuery interface of
the legacy collector ([opensvc/collector](https://github.com/opensvc/collector)). It talks
exclusively to the oc3 REST API, typed from its OpenAPI specification, and receives
changes in real time over the websocket of the oc3 messenger. 

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Features

**Inventory and operations**

- About thirty views: nodes, clusters, services, instances, resources, actions,
  networks, disks, SAN switches, hardware, packages, apps, tags, requests, compliance
  (modulesets, rulesets, designer, logs), statistics, and administration (users, teams,
  filters, filtersets, forms, metrics, charts, reports).
- Tabbed detail panels (properties, inventory, checks, alerts, logs, sysreport,
  statistics…), with a history of the records viewed, bookmarks and cross-links between
  objects.
- Actions on objects from a dedicated menu: queued agent actions (start, stop, freeze…)
  and data actions, filtered by the user's privileges and confirmed before they run.

**Lists**

- Per-column filters in a popover, with operators, regular expressions and the
  distribution of values; multi-column sorting; column selection and ordering.
- CSV and XLSX export of the whole selection, hidden columns included on demand.
- Comparison of the selected rows (common attributes), and saving the active filters as
  a filterset.
- Columns, sort, filters and page size remembered with the user's account.

**Navigation**

- Global search (`Ctrl+K` or `/`) across every kind of object, narrowed to one kind with
  a prefix (`node:`, `svc:`, `fset:`…), as in the legacy collector.
- Session filter: a filterset that narrows every list at once.
- Keyboard shortcuts (`?` lists them); detail panels on the right or on the left.

**Accessibility and appearance**

- English and French interface, with bilingual search.
- Light and dark modes; standard, high-contrast and colour-blind friendly themes.
- A state is never conveyed by colour alone: an icon, a shape or a label always goes with it.
- Live updates, without reloading, as the agents send their data.

## Requirements

- **Node.js** 18 or later (20 LTS recommended) and npm;
- a reachable **oc3** instance: its API (`server`) and its messenger (websocket);
- a collector account to sign in with.

## Quick start

```sh
git clone https://github.com/opensvc/oc3-frontend.git
cd oc3-frontend
cp .env.example .env    # oc3 API address, see Configuration
npm install
npm run dev             # http://localhost:5173
```

In development, Vite serves the application and proxies `/api` and `/realtime` to oc3:
the browser only ever talks to a single origin, so there is no CORS to configure.

After a change to the oc3 API, regenerate the client types:

```sh
npm run gen:api         # updates src/lib/api/schema.d.ts from the OpenAPI spec
```

## Configuration

Variables go in `.env` (never committed; `.env.example` is the template).

| Variable              | Purpose                                                              | Default                                  |
| --------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| `OC3_API_TARGET`      | URL of the oc3 API that `/api` is proxied to                         | `http://localhost:8080`                  |
| `OC3_OPENAPI_URL`     | URL of the OpenAPI spec read by `npm run gen:api`                    | `http://127.0.0.1:8081/api/openapi.json` |
| `OC3_REALTIME_TARGET` | URL of the oc3 messenger that `/realtime` is proxied to              | API host, port `8889`                    |
| `OC3_PUBLIC_HOST`     | Public host name when the dev server is exposed behind a TLS gateway | empty                                    |

## Scripts

| Command             | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Development server with hot reload                 |
| `npm run build`     | Type check, then production build into `dist/`     |
| `npm run preview`   | Serve the production build locally                 |
| `npm run typecheck` | Type check only                                    |
| `npm run lint`      | ESLint                                             |
| `npm run format`    | Prettier, with Tailwind class sorting              |
| `npm run gen:api`   | Regenerate the API types from the oc3 OpenAPI spec |

## Architecture

| Area        | Choice                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| UI          | React 19, strict TypeScript, Vite                                                        |
| Data        | TanStack Query, typed `openapi-fetch` client generated by `openapi-typescript`           |
| Routing     | TanStack Router; the state of each view (sort, filters, selection, tab) lives in the URL |
| Tables      | TanStack Table and Virtual                                                               |
| Styling     | Tailwind CSS 4 and design tokens (`src/styles/tokens.css`)                               |
| Translation | i18next, `en` and `fr` catalogs                                                          |

```text
src/
├── app/            router and application shell (top bar, menu, search, panels)
├── components/
│   ├── ui/         generic components, with no knowledge of OpenSVC
│   └── opensvc/    business components shared across views
├── features/<view>/ one collector view per folder
├── lib/            API client, preferences, filters, formatting, export…
├── i18n/           translation setup and catalogs
└── styles/         design tokens and global CSS
```

A few principles hold it together:

- every API call goes through `src/lib/api/client.ts` and TanStack Query;
  `src/lib/api/schema.d.ts` is generated and never edited by hand;
- a gap in the API is fixed in the oc3 spec, not worked around here;
- colours, radii and sizes come from the design tokens, never from hard-coded values;
- every visible string goes through `t()`, in English and in French.

## Deployment

```sh
npm ci
npm run build
```

`dist/` holds static files that any web server can serve. On the same origin, that server
must:

- proxy `/api` to the oc3 API and `/realtime` (websocket) to the oc3 messenger;
- return `index.html` for any other unknown path, since the application handles its own
  routing.

Authentication currently uses HTTP Basic against oc3; OpenID Connect sign-in is planned.

## Contributing

Contributions are welcome through pull requests. Before opening one:

```sh
npm run typecheck && npm run lint
```

- Code comments are written in English.
- Every new visible string is added to both `src/i18n/locales/en.json` and `fr.json`.
- A new npm dependency must be justified in the pull request; a copied component or a few
  lines of code are preferred.
- A view ported from the legacy collector lists its deliberate parity gaps.

## License

Released under the [Apache 2.0](./LICENSE) license.
