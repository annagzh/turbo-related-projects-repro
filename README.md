# Repro: `VERCEL_RELATED_PROJECTS` empty when not declared in turbo.json

## What actually happens

Turborepo (2.x, strict env mode) **does pass `VERCEL_*` variables through to the
task at runtime** even when they are not declared — a genuinely *fresh* build
sees `VERCEL_RELATED_PROJECTS` fine.

The problem is the **cache key**: an env var that is not declared in
`env`/`globalEnv` is not part of the task hash. Turbo will therefore replay any
cached artifact whose file inputs match — including one built when
`VERCEL_RELATED_PROJECTS` was **unset or different** (a build from before the
projects were related, a local machine or external CI seeding the shared
Remote Cache, or a branch deploy replaying another branch's artifact). The
deployment then serves output with an empty or stale value baked in, even
though Vercel injected the variable into the build container.

Declaring the variable fixes it because its value becomes part of the hash:
builds where it differs can never share an artifact. This matches the note in
[Vercel's Related Projects docs](https://vercel.com/docs/monorepos#how-to-link-projects-together-in-a-monorepo):
*"If you're using Turborepo Strict Mode for environment variables, add the
`VERCEL_RELATED_PROJECTS` variable to turbo.json."*

## Layout

Two identical apps whose `build` script records `VERCEL_RELATED_PROJECTS` into
`dist/env.json` / `dist/index.html`. Each is its own Vercel project (framework
"Other", build command `cd ../.. && npx turbo run build --filter=<app>`,
output `dist`), and the two projects are related to each other via
`relatedProjects` in each app's vercel.json.

| App | turbo.json | Result on Vercel |
| --- | --- | --- |
| `apps/without-env` | var **not** declared | `FULL TURBO` cache hit → serves artifact with `undefined` (**bug**) |
| `apps/with-env` | `"env": ["VERCEL_RELATED_PROJECTS"]` | cache miss → rebuilds → populated payload |

`vercel.json` is excluded from turbo inputs (`"inputs": ["$TURBO_DEFAULT$",
"!vercel.json"]`) so that adding the relation does not itself invalidate the
cache — this stands in for every real-world path where the artifact hash stays
the same while the variable's value changes (remote cache seeded from local/CI
where the var is unset, branch deploys reusing another branch's artifact with
the wrong URLs baked in, a related project's alias changing, …).

## Repro steps (as performed)

1. **Phase 1** — deploy both projects **before** any `vercel.json` relation
   exists. `VERCEL_RELATED_PROJECTS` is unset; both builds record `undefined`
   and the artifacts land in Vercel Remote Cache.
2. **Phase 2** — add `relatedProjects` to each app's vercel.json and push.
   Vercel now injects `VERCEL_RELATED_PROJECTS` into both build containers,
   but:
   - `without-env`: task hash unchanged → `cache hit, replaying … FULL TURBO`
     → `/env.json` still shows `undefined`, with a `builtAt` timestamp from
     phase 1.
   - `with-env`: the injected value is part of the hash → cache miss →
     rebuilds → `/env.json` shows the real related-projects payload.

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
