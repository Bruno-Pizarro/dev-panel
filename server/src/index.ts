import { buildApp } from './app.js';

const port = Number(process.env['DEV_PANEL_PORT'] ?? 4777);
const app = await buildApp({ port });
await app.listen({ host: '127.0.0.1', port });
