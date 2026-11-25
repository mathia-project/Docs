# Mathia SPA

SolidJS frontend with Vite and TypeScript. The interface supports English, Spanish and Italian; content language is stored separately.

See the root [README](../README.md) for the complete local stack. For frontend development, install Node.js as specified in package.json, run `npm ci`, copy `.env.example` to `.env`, and run `npm run dev`.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

VITE variables are public build configuration and must never contain secrets. Directus enforces authorization; navigation guards only control the interface.
