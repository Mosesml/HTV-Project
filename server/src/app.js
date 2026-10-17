import express from 'express';
import { SessionStore, sessionInput } from './sessions.js';
import { EscalationEngine, EngineError } from './escalations.js';
import { mountEscalations } from './escalation-routes.js';

export function createApp({ sessions = new SessionStore(), engine = new EscalationEngine({ sessions }) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({
      ok: true,
      service: 'raveguard-escalation',
      stage: 'escalation-simulation',
      notificationsEnabled: false
    });
  });
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
