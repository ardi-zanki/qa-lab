import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);
const databasePath = process.env.APPROVAL_DB ?? 'var/approval.sqlite';
const legacyMode = process.env.APPROVAL_LEGACY_BUG === '1';

if (databasePath !== ':memory:') {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS approval_requests (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    fixture TEXT NOT NULL CHECK (fixture IN ('standard', 'leading-zero')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
    approved_at TEXT
  );
`);

const insertRequest = db.prepare(
  'INSERT INTO approval_requests (title, fixture) VALUES (?, ?) RETURNING id',
);
const findRequest = db.prepare(`
  SELECT id, title, fixture, status, approved_at AS approvedAt
  FROM approval_requests WHERE id = ?
`);
const approveRequest = db.prepare(`
  UPDATE approval_requests
  SET status = 'approved', approved_at = ?
  WHERE id = ? AND status = 'pending'
`);
const codes = new Map([
  ['standard', '123456'],
  ['leading-zero', '042731'],
]);

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/ui.js', ['ui.js', 'text/javascript']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/fonts/inter-latin.woff2', ['fonts/inter-latin.woff2', 'font/woff2']],
  ['/fonts/inter-latin-ext.woff2', ['fonts/inter-latin-ext.woff2', 'font/woff2']],
].map(([route, [file, type]]) => [
  route,
  { data: readFileSync(new URL(file, import.meta.url)), type },
]));

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function sendError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handle(request, response) {
  const { pathname } = new URL(request.url, `http://${host}`);
  const asset = assets.get(pathname);
  if (request.method === 'GET' && asset) {
    const needsCharset = asset.type.startsWith('text/') || asset.type === 'image/svg+xml';
    response.writeHead(200, {
      'Content-Type': `${asset.type}${needsCharset ? '; charset=utf-8' : ''}`,
    });
    return response.end(asset.data);
  }

  if (request.method === 'POST' && pathname === '/api/requests') {
    const body = await readJson(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 80 || !codes.has(body?.fixture)) {
      return sendError(response, 400, 'INVALID_REQUEST', 'Enter a title of 1–80 characters and select a fixture.');
    }

    const { id } = insertRequest.get(title, body.fixture);
    return sendJson(response, 201, findRequest.get(id));
  }

  const match = pathname.match(/^\/api\/requests\/(\d+)(\/approve)?$/);
  if (match) {
    const id = Number(match[1]);
    if (request.method === 'GET' && !match[2]) {
      const record = findRequest.get(id);
      if (record) return sendJson(response, 200, record);
    }

    if (request.method === 'POST' && match[2]) {
      const { code } = (await readJson(request)) ?? {};
      if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) {
        return sendError(response, 400, 'INVALID_CODE_FORMAT', 'Enter a six-digit code.');
      }

      const record = findRequest.get(id);
      if (!record) return sendError(response, 404, 'NOT_FOUND', 'Request not found.');
      if (record.status === 'approved') {
        return sendError(response, 409, 'ALREADY_APPROVED', 'This request was already approved.');
      }

      // The optional legacy path demonstrates a numeric conversion that discards leading zeros.
      const submittedCode = legacyMode ? String(Number(code)) : code;
      if (submittedCode !== codes.get(record.fixture)) {
        return sendError(response, 422, 'INCORRECT_CODE', 'The approval code is incorrect.');
      }

      const result = approveRequest.run(new Date().toISOString(), id);
      if (result.changes !== 1) {
        return sendError(response, 409, 'ALREADY_APPROVED', 'This request was already approved.');
      }
      return sendJson(response, 200, findRequest.get(id));
    }
  }

  sendError(response, 404, 'NOT_FOUND', 'Request not found.');
}

createServer(async (request, response) => {
  try {
    await handle(request, response);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendError(response, 400, 'INVALID_JSON', 'Send a valid JSON body.');
    }
    console.error(error);
    sendError(response, 500, 'INTERNAL_ERROR', 'The server could not process this request.');
  }
}).listen(port, host, () => {
  console.log(`Approval lab at http://${host}:${port} (${legacyMode ? 'legacy' : 'fixed'} mode)`);
});
