/**
 * Google Search MCP Server
 * ─────────────────────────
 * Provides a "Google Search" tool via the MCP HTTP protocol.
 * Uses Serper.dev API (free tier: 2500 queries/month, no credit card).
 *
 * Setup:
 *   1. Get a free API key at https://serper.dev  (takes 30 seconds)
 *   2. Set environment variable:  SERPER_API_KEY=your_key_here
 *   3. Start server:  node server.js
 *
 * If SERPER_API_KEY is not set the server still starts and registers in
 * AgentOven — calls will return a configuration reminder instead of results.
 *
 * Port  : 3005
 * Register in AgentOven endpoint: http://host.docker.internal:3005/mcp
 */

'use strict';

const http  = require('http');
const https = require('https');
const PORT  = 3005;
const API_KEY = process.env.SERPER_API_KEY || '';

// ── Tool definition ────────────────────────────────────────────────────────────
const GOOGLE_SEARCH_TOOL = {
  name        : 'Google Search',
  description : 'Search the web using Google Search to find relevant, up-to-date results. ' +
                'Returns top organic results with titles, snippets, and URLs. ' +
                'Useful for researching topics, finding documentation, checking latest news, ' +
                'and answering questions that require current web information.',
  inputSchema : {
    type       : 'object',
    properties : {
      query : {
        type        : 'string',
        description : 'The search query. Be specific for better results. ' +
                      'Examples: "Playwright best practices 2024", "AgentOven AI platform", ' +
                      '"Node.js async error handling".',
      },
      num : {
        type        : 'number',
        description : 'Number of results to return (1–10). Defaults to 5.',
      },
    },
    required   : ['query'],
  },
};

// ── Search via Serper.dev ──────────────────────────────────────────────────────
function searchGoogle(query, num = 5) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      resolve({
        note    : 'SERPER_API_KEY environment variable is not set.',
        setup   : 'Get a free key at https://serper.dev then restart the server with SERPER_API_KEY=your_key',
        query,
        results : [],
      });
      return;
    }

    const body = JSON.stringify({ q: query, num: Math.min(num, 10) });

    const options = {
      hostname : 'google.serper.dev',
      port     : 443,
      path     : '/search',
      method   : 'POST',
      headers  : {
        'X-API-KEY'    : API_KEY,
        'Content-Type' : 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.organic) {
            resolve({
              query,
              total_results : json.searchInformation?.totalResults ?? 'N/A',
              results       : json.organic.slice(0, num).map(r => ({
                title   : r.title,
                link    : r.link,
                snippet : r.snippet,
              })),
              knowledge_graph : json.knowledgeGraph ?? null,
              answer_box      : json.answerBox ?? null,
            });
          } else {
            resolve({ query, error: json.message ?? 'Unexpected response', raw: json });
          }
        } catch (e) {
          reject(new Error(`Failed to parse Serper response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── MCP HTTP handler ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status   : 'ok',
      server   : 'Google Search MCP',
      port     : PORT,
      api_key  : API_KEY ? 'configured ✅' : 'NOT SET ⚠️  — set SERPER_API_KEY to enable real search',
    }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }

  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', async () => {
    const send = payload => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    try {
      const msg              = JSON.parse(body);
      const { method, params, id } = msg;

      if (method === 'initialize') {
        return send({
          jsonrpc : '2.0',
          id,
          result  : {
            protocolVersion : '2024-11-05',
            capabilities    : { tools: {} },
            serverInfo      : { name: 'google-search-mcp-server', version: '1.0.0' },
          },
        });
      }

      if (method === 'tools/list') {
        return send({ jsonrpc: '2.0', id, result: { tools: [GOOGLE_SEARCH_TOOL] } });
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        if (name !== 'Google Search') throw new Error(`Unknown tool: ${name}`);

        const query = args.query || args.q || 'AgentOven';
        const num   = typeof args.num === 'number' ? args.num : 5;
        console.log(`[Google Search] Query: "${query}" (num=${num})`);

        const data = await searchGoogle(query, num);
        return send({
          jsonrpc : '2.0',
          id,
          result  : {
            content : [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          },
        });
      }

      // Ignore notifications
      if (method?.startsWith('notifications/')) {
        return send({ jsonrpc: '2.0', id: null });
      }

      return send({ jsonrpc: '2.0', id, result: {} });

    } catch (err) {
      console.error('[Google Search MCP Error]', err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc : '2.0',
        id      : null,
        error   : { code: -32000, message: err.message },
      }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🔍  Google Search MCP Server started');
  console.log(`    Local URL  : http://localhost:${PORT}/mcp`);
  console.log(`    Docker URL : http://host.docker.internal:${PORT}/mcp`);
  console.log(`    API Key    : ${API_KEY ? 'configured ✅' : 'NOT SET ⚠️  (set SERPER_API_KEY)'}`);
  console.log('    Register the Docker URL in AgentOven → Tools → Register Tool');
  console.log('');
});
