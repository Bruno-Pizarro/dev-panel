# Dev Panel

Panel web local (modo oscuro) para el entorno de desarrollo de e-sueldos.

```bash
yarn install
yarn dev     # http://127.0.0.1:5173 (desarrollo)
yarn start   # http://127.0.0.1:4777 (compilado)
```

Gestor de paquetes: **yarn**. Stack: React 18 + Vite 5 + TypeScript + Tailwind 3.4 sobre un servidor Fastify. En el primer arranque un asistente genera `config.json`.

Vistas: servicios y levantado en orden, datos con chips, sesiones de prueba, ramas y `.env`, pruebas y planificación desde `_EXTRA`, daily, chequeos de entorno y un servidor MCP. Detalle en [CLAUDE.md](CLAUDE.md).

Guía para agentes y desarrolladores: [CLAUDE.md](CLAUDE.md). Plan por fases: [docs/PLAN.md](docs/PLAN.md).
