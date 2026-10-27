import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { mcpTools, type CallApi } from './mcpTools.js';

// Servidor MCP por stdio: habla con el panel que ya está corriendo (127.0.0.1) y reutiliza su lógica y validaciones.
// IMPORTANTE: no escribir nada a stdout salvo el protocolo (por eso se arranca con `node`, no con `yarn`).
const port = Number(process.env['DEV_PANEL_PORT'] ?? 4777);

const callApi: CallApi = async (method, path, body) => {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...(method !== 'GET' ? { 'X-Dev-Panel': '1' } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(`El Dev Panel no responde en el puerto ${port}. Levantalo con "yarn start" en /root/projects/dev-panel.`);
  }
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? `Error ${response.status}`);
  return data;
};

const server = new McpServer({ name: 'dev-panel', version: '0.1.0' });
for (const tool of mcpTools) {
  server.tool(tool.name, tool.description, tool.shape, async (args) => {
    try {
      return { content: [{ type: 'text' as const, text: JSON.stringify(await tool.run(args as Record<string, unknown>, callApi), null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: (error as Error).message }] };
    }
  });
}

await server.connect(new StdioServerTransport());
