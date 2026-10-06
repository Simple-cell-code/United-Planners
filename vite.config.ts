import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type SiteDataFile = {
  events: unknown[] | null;
  announcements: unknown[];
  reminders: Record<string, string[]>;
  updatedAt?: string;
};

const siteDataPath = resolve(process.cwd(), 'data', 'site-data.json');
const maxSiteDataBytes = 64 * 1024 * 1024;
const siteDataClients = new Set<ServerResponse>();

const siteDataApi: Connect.NextHandleFunction = (request: Connect.IncomingMessage, response: ServerResponse, next: Connect.NextFunction) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/api/site-data/stream' && request.method === 'GET') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    siteDataClients.add(response);
    const keepAlive = setInterval(() => {
      if (response.destroyed || response.writableEnded) {
        clearInterval(keepAlive);
        siteDataClients.delete(response);
        return;
      }
      response.write(': keep-alive\n\n');
    }, 20_000);
    response.on('close', () => {
      clearInterval(keepAlive);
      siteDataClients.delete(response);
    });
    void readFile(siteDataPath, 'utf8').then(contents => {
      const store = JSON.parse(contents) as SiteDataFile;
      if (!response.destroyed) {
        response.write(`event: events\ndata: ${JSON.stringify(Array.isArray(store.events) ? store.events : [])}\n\n`);
        response.write(`event: announcements\ndata: ${JSON.stringify(store.announcements)}\n\n`);
      }
    }).catch(() => undefined);
    return;
  }
  if (pathname !== '/api/site-data') return next();

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');

  void (async () => {
    await mkdir(dirname(siteDataPath), { recursive: true });

    if (request.method === 'GET') {
      let contents: string;
      try {
        contents = await readFile(siteDataPath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const emptyStore: SiteDataFile = { events: null, announcements: [], reminders: {} };
        contents = JSON.stringify(emptyStore, null, 2);
        await writeFile(siteDataPath, contents, 'utf8');
      }
      const store = JSON.parse(contents) as SiteDataFile;
      const authorization = request.headers.authorization;
      let identity: { id?: number; role?: string } | null = null;
      if (authorization?.startsWith('Bearer ')) {
        const authResponse = await fetch('http://localhost:4000/api/auth/me', { headers: { Authorization: authorization } });
        identity = authResponse.ok ? await authResponse.json().catch(() => null) as { id?: number; role?: string } | null : null;
      }
      const reminders = identity?.role === 'admin'
        ? store.reminders
        : identity?.id
          ? Object.fromEntries(Object.entries(store.reminders).filter(([key]) => key.startsWith(`user:${identity?.id}:`)).map(([key, values]) => [key.slice(`user:${identity?.id}:`.length), values]))
          : {};
      response.statusCode = 200;
      response.end(JSON.stringify({ ...store, reminders }));
      return;
    }

    if (request.method !== 'PUT') {
      response.statusCode = 405;
      response.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: 'Sign in is required to update shared site data.' }));
      return;
    }
    const authResponse = await fetch('http://localhost:4000/api/auth/me', { headers: { Authorization: authorization } });
    const identity = await authResponse.json().catch(() => null) as { id?: number; role?: string } | null;
    if (!authResponse.ok || !identity?.id || !identity.role) {
      response.statusCode = authResponse.status === 403 ? 403 : 401;
      response.end(JSON.stringify({ error: 'Your session is invalid or blocked. Sign in again.' }));
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxSiteDataBytes) {
        response.statusCode = 413;
        response.end(JSON.stringify({ error: 'Site data is too large to save' }));
        return;
      }
      chunks.push(buffer);
    }

    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object') {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: 'Invalid site data' }));
      return;
    }
    const input = parsed as Record<string, unknown>;
    if (!Array.isArray(input.events) || !Array.isArray(input.announcements) || !input.reminders || typeof input.reminders !== 'object' || Array.isArray(input.reminders)) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: 'Events, announcements, and reminders are required' }));
      return;
    }

    let currentStore: SiteDataFile = { events: [], announcements: [], reminders: {} };
    try {
      currentStore = JSON.parse(await readFile(siteDataPath, 'utf8')) as SiteDataFile;
    } catch {}
    if (identity.role !== 'admin' && JSON.stringify(input.announcements) !== JSON.stringify(currentStore.announcements)) {
      response.statusCode = 403;
      response.end(JSON.stringify({ error: 'Only an administrator can publish messages.' }));
      return;
    }
    if (identity.role !== 'admin') {
      const existingEvents = Array.isArray(currentStore.events) ? currentStore.events as Array<Record<string, unknown>> : [];
      const nextEvents = input.events as Array<Record<string, unknown>>;
      const unchangedExistingEvents = existingEvents.every(existing => nextEvents.some(next => next.id === existing.id && JSON.stringify(next) === JSON.stringify(existing)));
      const pendingSubmissionsOnly = nextEvents.filter(next => !existingEvents.some(existing => existing.id === next.id)).every(next => next.status === 'PENDING' && next.approval === 'Pending');
      if (!unchangedExistingEvents || !pendingSubmissionsOnly) {
        response.statusCode = 403;
        response.end(JSON.stringify({ error: 'Members can only submit new events for administrator review.' }));
        return;
      }
    }

    const submittedReminders = Object.fromEntries(Object.entries(input.reminders).map(([id, values]) => [
      id,
      Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [],
    ]));
    const reminders = identity.role === 'admin'
      ? submittedReminders
      : Object.fromEntries([
          ...Object.entries(currentStore.reminders).filter(([key]) => !key.startsWith(`user:${identity.id}:`)),
          ...Object.entries(submittedReminders).map(([id, values]) => [`user:${identity.id}:${id}`, values]),
        ]);
    const store: SiteDataFile = {
      events: input.events,
      announcements: input.announcements,
      reminders,
      updatedAt: new Date().toISOString(),
    };
    const temporaryPath = `${siteDataPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
    await rename(temporaryPath, siteDataPath);
    const eventUpdates = [
      `event: events\ndata: ${JSON.stringify(store.events)}\n\n`,
      `event: announcements\ndata: ${JSON.stringify(store.announcements)}\n\n`,
    ].join('');
    for (const client of siteDataClients) {
      if (client.destroyed || client.writableEnded) {
        siteDataClients.delete(client);
        continue;
      }
      try {
        client.write(eventUpdates);
      } catch {
        siteDataClients.delete(client);
      }
    }
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true, updatedAt: store.updatedAt }));
  })().catch(error => {
    console.error('Site data API error:', error);
    if (!response.headersSent) response.statusCode = 500;
    response.end(JSON.stringify({ error: 'Unable to load or save site data' }));
  });
};

const fileBackedSiteData: Plugin = {
  name: 'united-planners-file-storage',
  configureServer(server) {
    server.middlewares.use(siteDataApi);
  },
  configurePreviewServer(server) {
    server.middlewares.use(siteDataApi);
  },
};

export default defineConfig({
  plugins: [react(), fileBackedSiteData],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io'],
    proxy: {
      '/api/auth': 'http://localhost:4000',
      '/api/admin': 'http://localhost:4000',
      '/api/presence': 'http://localhost:4000',
    },
  },
});
