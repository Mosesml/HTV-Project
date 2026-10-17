import { registerInput, updateInput, cancelInput, fireInput } from './escalation-input.js';

export function mountEscalations(app, { sessions, engine, authenticate, fail }) {
  const validated = (schema, action) => (request, response) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return fail(response, 400, 'INVALID_REQUEST', 'Invalid escalation request');
    action(request, response, parsed.data);
  };
  app.post('/v1/sessions/:sid/escalations', authenticate, validated(registerInput, (request, response, data) => {
    const escalationId = engine.register(request.params.sid, data.deadline, data.facts);
    response.status(201).json({ ok: true, data: { escalationId }, error: null });
  }));
  const ownsEscalation = (request, response, next) => {
    const sessionId = engine.owner(request.params.eid);
    if (!sessionId || !sessions.authenticate(sessionId, request.get('authorization'))) {
      response.set('WWW-Authenticate', 'Bearer');
      return fail(response, 401, 'UNAUTHORIZED', 'Invalid session credentials');
    }
    next();
  };
  app.get('/v1/escalations/:eid', ownsEscalation, (request, response) => {
    response.json({ ok: true, data: engine.status(request.params.eid), error: null });
  });
  app.patch('/v1/escalations/:eid', ownsEscalation, validated(updateInput, (request, response, data) => {
    engine.update(request.params.eid, data.facts); response.status(204).end();
  }));
  app.post('/v1/escalations/:eid/cancel', ownsEscalation, validated(cancelInput, (request, response, data) => {
    engine.cancel(request.params.eid, data.mode); response.status(204).end();
  }));
  app.post('/v1/escalations/:eid/fire', ownsEscalation, validated(fireInput, (request, response) => {
    engine.fire(request.params.eid); response.status(204).end();
  }));
}
