export function buildControlOpenApiSpec(baseUrl = 'http://127.0.0.1:4000'): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'dz-sandbox Control API',
      version: '0.1.0',
      description:
        'Control plane API for managing scenarios, virtual clock, webhooks, request logs, and state snapshots in dz-sandbox.',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/__control/health': {
        get: {
          summary: 'Control plane healthcheck',
          responses: { '200': { description: 'Service healthy' } },
        },
      },
      '/__control/state': {
        get: {
          summary: 'Get current sandbox state snapshot',
          responses: { '200': { description: 'Current state snapshot' } },
        },
      },
      '/__control/reset': {
        post: {
          summary: 'Reset all resources, logs, scenarios, RNG seed, and virtual clock',
          responses: { '200': { description: 'Sandbox reset complete' } },
        },
      },
      '/__control/scenarios': {
        get: {
          summary: 'List all built-in and custom scenarios',
          responses: { '200': { description: 'Scenario catalog' } },
        },
        post: {
          summary: 'Register a custom scenario definition',
          responses: { '201': { description: 'Custom scenario registered' } },
        },
      },
      '/__control/scenario/{provider}': {
        put: {
          summary: 'Set default scenario or sequence for a provider',
          parameters: [
            { name: 'provider', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Provider scenario updated' } },
        },
      },
      '/__control/scenario/{provider}/{resourceId}': {
        put: {
          summary: 'Bind a scenario to a specific resource ID',
          parameters: [
            { name: 'provider', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Resource scenario updated' } },
        },
        delete: {
          summary: 'Remove a per-resource scenario binding',
          parameters: [
            { name: 'provider', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Resource scenario removed' } },
        },
      },
      '/__control/requests': {
        get: {
          summary: 'Query recorded request/response logs',
          parameters: [
            { name: 'provider', in: 'query', schema: { type: 'string' } },
            { name: 'statusCode', in: 'query', schema: { type: 'integer' } },
            { name: 'since', in: 'query', schema: { type: 'string' } },
            { name: 'until', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Request log entries' } },
        },
      },
      '/__control/webhooks': {
        get: {
          summary: 'Query webhook delivery logs and attempts',
          parameters: [
            { name: 'provider', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'Webhook log entries' } },
        },
      },
      '/__control/webhooks/{id}/redeliver': {
        post: {
          summary: 'Redeliver a recorded webhook by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Webhook redelivery result' } },
        },
      },
      '/__control/clock/advance': {
        post: {
          summary: 'Advance virtual clock and fire scheduled timers',
          responses: { '200': { description: 'Clock advanced' } },
        },
      },
      '/__control/clock/reset': {
        post: {
          summary: 'Reset virtual clock to initial timestamp',
          responses: { '200': { description: 'Clock reset' } },
        },
      },
      '/__control/trigger/{provider}/{eventType}': {
        post: {
          summary: 'Manually trigger a provider event / webhook',
          parameters: [
            { name: 'provider', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'eventType', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Event triggered' } },
        },
      },
      '/__control/export': {
        get: {
          summary: 'Export reproducible scenario + state bundle',
          responses: { '200': { description: 'JSON bundle' } },
        },
      },
      '/__control/import': {
        post: {
          summary: 'Import scenario + state bundle',
          responses: { '200': { description: 'Bundle imported' } },
        },
      },
    },
  };
}
