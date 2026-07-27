# Repro: `VERCEL_RELATED_PROJECTS` empty when not declared in turbo.json

## What actually happens

Turborepo (2.x, strict env mode) **does pass `VERCEL_*` variables through to the
task at runtime** even when they are not declared — so a *fresh* build sees
`VERCEL_RELATED_PROJECTS` just fine.

The problem is the **cache key**: an env var that is not declared in
`env`/`globalEnv` is **not part of the task hash**. So any cached artifact whose
inputs match is replayed as-is — including artifacts built in an environment
where `VERCEL_RELATED_PROJECTS` was **unset** (a local machine, external CI,
or a deployment made before the projects were related). The deployment then
serves output with an empty/undefined value baked in, even though Vercel
injected the variable into the build container.

Declaring the variable in turbo.json fixes it because the value becomes part
of the hash: builds where the variable differs can never share an artifact.

## Layout

Two identical apps whose `build` script records `VERCEL_RELATED_PROJECTS`
into `dist/env.json` / `dist/index.html`. Each is a Vercel project
(framework "Other", build command `cd ../.. && npx turbo run build
--filter=<app>`, output `dist`), and the two projects are related to each
other via `relatedProjects` in each app's vercel.json.

| App | turbo.json | Result |
| --- | --- | --- |
| `apps/without-env` | var **not** declared | replays remote-cache artifact → `undefined` (**bug**) |
| `apps/with-env` | `"env": ["VERCEL_RELATED_PROJECTS"]` | cache miss → rebuilds → populated payload |

## Repro steps (as performed)

1. Both apps, with `relatedProjects` already in each vercel.json, committed.
2. **Seed the remote cache from a machine where the var is unset** — the same
   Vercel Remote Cache the deployments will use:

   ```bash
   TURBO_TEAM=<team> TURBO_TOKEN=<token> npx turbo run build --force
   ```

3. Push the same commit → Vercel builds both projects.
   - `without-env`: identical task hash (env var not hashed) → **FULL TURBO**
     remote cache hit → serves the locally-built artifact where the var was
     undefined. Check `builtAt` in `/env.json`: it predates the deployment.
   - `with-env`: hash includes the (now populated) var → cache miss →
     rebuilds → `/env.json` shows the real related-projects payload.

Any flow that seeds the cache without the var produces the same result:
building before the projects were related, external CI with remote caching,
`vercel build` locally, etc.

## Fix

Declare the variable so it participates in the task hash:

```json
{
  "tasks": {
    "build": {
      "env": ["VERCEL_RELATED_PROJECTS"]
    }
  }
}
```

(`globalEnv` also works. `passThroughEnv` does **not** fix this — it exposes
the var without hashing it, which is exactly the broken state.)
