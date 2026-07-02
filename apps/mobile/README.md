# @forgemsg/mobile — ForgeMsg mobile app (Expo / React Native)

A native iOS/Android companion app for ForgeMsg. Built with **Expo (SDK 52) +
expo-router**. It talks to the existing ForgeMsg REST API using an **API key**
(the same `x-api-key` mechanism the Zapier bridge uses), so there's no separate
mobile auth backend.

## Features

- **Sign in** with an API key + configurable API base URL (stored in the OS
  keychain via `expo-secure-store`).
- **Insights** — sent-campaign KPIs (emails sent, open/click rate) with
  pull-to-refresh.
- **Contacts** — browse the contact list.
- **Campaigns** — list campaigns and open a **campaign report** (opens, clicks,
  open/click rate, CTOR, bounce/unsub rate).

## Project layout

```
app/
  _layout.tsx          root Stack
  index.tsx            auth gate → /login or /(tabs)
  login.tsx            API-key sign-in
  (tabs)/
    _layout.tsx        bottom tabs
    index.tsx          Insights dashboard
    contacts.tsx       Contacts list
    campaigns.tsx      Campaigns list
  campaign/[id].tsx    Campaign report
src/lib/
  auth.ts              secure credential storage
  api.ts               API client (x-api-key, unwraps { data })
```

## Run it

This app is **excluded from the pnpm workspace** (it has its own React Native /
native-module dependency tree) — install it on its own:

```bash
cd apps/mobile
npm install
npx expo start        # then press i (iOS) / a (Android), or scan the QR in Expo Go
```

Sign in with your ForgeMsg API key (Dashboard → Settings → API keys) and, if not
using the hosted API, your API base URL (e.g. `http://<your-machine-ip>:3001`).

## Status / verification

This is a complete, idiomatic Expo scaffold. It has **not** been executed in a
simulator in this environment (no Expo toolchain / device here), so treat the
first `npx expo start` as the initial smoke test. Dependency versions target
Expo SDK 52; run `npx expo install --check` after `npm install` to align any
native module versions with the installed Expo SDK.
