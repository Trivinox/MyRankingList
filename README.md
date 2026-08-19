# MyRankingList

Aplicación web para ordenar una lista de elementos por preferencia, arrastrando cada elemento a la posición que se quiera. Se puede usar en solitario o en una sala compartida de hasta 20 personas, donde cada quien ordena la misma lista por su cuenta y al final se comparan los resultados (ranking de consenso, afinidad entre participantes y elementos de mayor discrepancia).

No requiere cuentas de usuario. Las salas funcionan P2P sobre WebRTC en topología de estrella: el creador actúa como host y sostiene el estado de la sala, por lo que no hay backend de aplicación, solo un servidor de señalización.

## Estado

Fase 0 (andamiaje). El monorepo, la configuración de TypeScript, el linting y el CI están listos; todavía no hay lógica de producto implementada.

## Stack

- TypeScript en ambos paquetes
- Frontend: React + Vite, dnd-kit, Zustand, Framer Motion, Howler.js, react-i18next
- P2P y señalización: PeerJS (`peerjs` en el cliente, `peer` en el servidor)
- Pruebas: Vitest, React Testing Library, Playwright

## Requisitos

Node 22 (la versión exacta se fija en `.nvmrc` y en el campo `engines` de `package.json`).

## Estructura

```
packages/
  web/                Frontend React + Vite
  signaling-server/   Servidor de señalización Node + TypeScript
```

El repositorio es un monorepo con npm workspaces. La configuración de TypeScript, ESLint y Prettier es compartida y vive en la raíz.

## Instalación

```
npm install
```

Un solo `npm install` en la raíz instala las dependencias de ambos paquetes.

## Scripts

Desde la raíz, aplicando a todos los paquetes:

- `npm run build`
- `npm run lint`
- `npm run type-check`

Dentro de `packages/web`:

- `npm run dev` levanta el servidor de desarrollo de Vite
- `npm run preview` sirve el build de producción

Dentro de `packages/signaling-server`:

- `npm run dev` ejecuta el servidor con recarga vía tsx
- `npm start` ejecuta el build compilado

## CI

GitHub Actions corre lint y type-check en cada pull request. A medida que se agreguen pruebas, se sumarán al mismo workflow.

## Despliegue

Previsto para una fase posterior: `packages/web` en Vercel como build estático, y `packages/signaling-server` en Render como servicio Node persistente (necesario para mantener las conexiones WebSocket abiertas).

## Licencia

Todos los derechos reservados. El repositorio no incluye un archivo `LICENSE`.
