import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { projectInput, projectLookup } from './projects.js';
import { publicError } from './errors.js';

export async function handleMcp(request, service, owner) {
  const server = new McpServer({ name: 'jarvis', version: '0.1.0' });
  const invoke = operation => async input => {
    try {
      const project = await operation(owner, input);
      return { content: [{ type: 'text', text: JSON.stringify(project) }], structuredContent: project };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: publicError(error).code }] };
    }
  };
  server.registerTool('jarvis.create_project', {
    description: 'Create a project. Supply an idempotency key to make retries safe.',
    inputSchema: projectInput,
  }, invoke(service.create));
  server.registerTool('jarvis.get_project', {
    description: 'Get an owned project by UUID.', inputSchema: projectLookup,
    annotations: { readOnlyHint: true },
  }, invoke(service.get));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 16384,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
