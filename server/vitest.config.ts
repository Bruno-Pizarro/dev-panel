import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Los tests nunca escriben en la carpeta data/ real: usan una temporal.
export default defineConfig({ test: { env: { LOG_LEVEL: 'silent', DEV_PANEL_DATA: join(tmpdir(), 'dev-panel-test-data') } } });
