import express from 'express';
import { SessionStore, sessionInput } from './sessions.js';
import { EscalationEngine, EngineError } from './escalations.js';
import { mountEscalations } from './escalation-routes.js';
import { mountContactPage } from './contact-page.js';

// `trustProxy`: how many reverse-proxy hops sit in front of this process (0 = none, the default).
// `persistence` (AN13): the object from openPersistence(), or null. `rateLimit`: test/tuning overrides.
export function createApp({ sessions = new SessionStore(), engine = new EscalationEngine({ sessions }),
  notificationsEnabled = false, trustProxy = 0, persistence = null, rateLimit } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Client IP for rate limiting comes from X-Forwarded-For, but ONLY as far as we trust it. With a
  // hop count N, Express takes the Nth address from the RIGHT of the chain (the one our own proxy
  // appended); anything a client prepends to the header sits further left and is ignored. So a
  // client cannot invent an address to dodge its own limit, and cannot borrow someone else's address
  // to use up THEIR allowance. A bare `true` would trust the leftmost (attacker-chosen) entry, so a
  // hop count is the only form accepted. With 0 the header is ignored entirely and the socket
  // address is used. If the real number of hops differs from the setting, clients share or escape
  // buckets, so it is configurable (TRUST_PROXY_HOPS in index.js).
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) throw new Error('trustProxy must be an integer from 0 to 5');
  if (trustProxy > 0) app.set('trust proxy', trustProxy);
  app.get('/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({
      ok: true,
      service: 'raveguard-escalation',
      stage: notificationsEnabled ? 'live-sms' : 'escalation-simulation',
      notificationsEnabled,
      // Only present when DATA_DIR enables persistence, so the shape is unchanged otherwise (AN13).
      ...(persistence && { persistence: persistence.health() }),
      // Railway sets this on every deployment: lets anyone check which commit is actually serving.
      ...(process.env.RAILWAY_GIT_COMMIT_SHA && { commit: process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7) })
    });
  });
  mountContactPage(app, { engine, rateLimit });
  const fail = (response, status, code, message) =>
    response.status(status).json({ ok: false, data: null, error: { code, message } });
  app.use('/v1', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  app.use('/v1', express.json({ limit: '32kb' }));
  app.post('/v1/sessions', (request, response) => {
    const parsed = sessionInput.safeParse(request.body);
    if (!parsed.success) return fail(response, 400, 'INVALID_REQUEST', 'Invalid session settings');
    const data = sessions.create(parsed.data);
    if (!data) return fail(response, 503, 'CAPACITY_REACHED', 'Session capacity reached');
    response.status(201).json({ ok: true, data, error: null });
  });
  const authenticate = (request, response, next) => {
    if (!sessions.authenticate(request.params.sid, request.get('authorization'))) {
      response.set('WWW-Authenticate', 'Bearer');
      return fail(response, 401, 'UNAUTHORIZED', 'Invalid session credentials');
    }
    next();
  };
  app.post('/v1/sessions/:sid/heartbeat', authenticate, (request, response) => {
    sessions.heartbeat(request.params.sid);
    response.status(204).end();
  });
  app.delete('/v1/sessions/:sid', authenticate, (request, response) => {
    engine.deleteSession(request.params.sid);
    sessions.delete(request.params.sid);
    response.status(204).end();
  });
  mountEscalations(app, { sessions, engine, authenticate, fail });
  app.use('/v1', (_request, response) => fail(response, 404, 'NOT_FOUND', 'Unknown API route'));
  app.use((error, _request, response, _next) => {
    if (error instanceof EngineError) return fail(response, error.status, error.code, error.message);
    if (error.type === 'entity.too.large') return fail(response, 413, 'BODY_TOO_LARGE', 'Request body too large');
    if (error.type === 'entity.parse.failed') return fail(response, 400, 'INVALID_REQUEST', 'Invalid JSON');
    if (error.status === 415) return fail(response, 415, 'UNSUPPORTED_ENCODING', 'Unsupported request encoding');
    return fail(response, 500, 'INTERNAL_ERROR', 'Request failed');
  });
  return app;
}
