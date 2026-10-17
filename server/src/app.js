import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({
      ok: true,
      service: 'raveguard-escalation',
      stage: 'health-only',
      notificationsEnabled: false
    });
  });
  return app;
}
