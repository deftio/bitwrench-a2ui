// A tiny scripted "agent" with no dependencies, to show a real round trip:
// A2UI messages stream to the page over Server-Sent Events, and the page POSTs actions
// back. Replace the scripted replies with your model or agent framework.
//
//   node examples/agent-server.mjs
//   open http://localhost:8787/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8787);
const CAT = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';
const clients = new Set();

function send(msg) {
  for (const res of clients) res.write(`data: ${JSON.stringify(msg)}\n\n`);
}

function welcome() {
  return [{ version: '1.0', createSurface: { surfaceId: 'agent', catalogId: CAT, sendDataModel: true,
    dataModel: { city: 'Lisbon', nights: 3 },
    components: [
      { id: 'root', component: 'Card', child: 'col' },
      { id: 'col', component: 'Column', children: ['q', 'city', 'nights', 'go', 'answer'] },
      { id: 'q', component: 'Text', text: '### Where to?\nThis UI comes from a Node process over SSE.' },
      { id: 'city', component: 'TextField', label: 'City', value: { '@path': '/city' } },
      { id: 'nights', component: 'Slider', label: { '@call': 'formatString', args: { value: 'Nights: ${/nights}' } }, min: 1, max: 14, value: { '@path': '/nights' } },
      { id: 'go', component: 'Button', variant: 'primary', child: 'goLabel', action: { event: { name: 'plan', context: { city: { '@path': '/city' }, nights: { '@path': '/nights' } } } } },
      { id: 'goLabel', component: 'Text', text: 'Plan my trip' },
      { id: 'answer', component: 'Text', text: { '@path': '/answer' } },
    ] } }];
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    for (const m of welcome()) res.write(`data: ${JSON.stringify(m)}\n\n`);
    return;
  }
  if (url.pathname === '/action' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { message, metadata } = JSON.parse(body || '{}');
    console.log('from renderer:', JSON.stringify(message), metadata?.a2uiRendererDataModel ? '(with data model)' : '');
    if (message?.action?.name === 'plan') {
      const { city, nights } = message.action.context;
      send({ version: '1.0', updateDataModel: { surfaceId: 'agent', path: '/answer', value: `Thinking about ${city}…` } });
      setTimeout(() => send({ version: '1.0', updateDataModel: { surfaceId: 'agent', path: '/answer',
        value: `**${nights} nights in ${city}.** Day 1: old town walk. Day 2: museum and riverside dinner.${nights > 2 ? ' Day 3: a day trip.' : ''}` } }), 600);
    }
    res.writeHead(204).end();
    return;
  }
  // Static files from the repository root (the client page and the built scripts).
  const file = url.pathname === '/' ? '/examples/agent-client.html' : url.pathname;
  const full = path.normalize(path.join(root, file));
  if (!full.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': types[path.extname(full)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`agent on http://localhost:${PORT}/`));
