// AN11: the recipient's page, reached from the SMS link. Everything it shows comes from the AN8
// payload (brief.js), so the page can never show more than the SMS rules allow, and the same
// token that proves who is asking also decides what they see.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { renderBrief } from './brief.js';
import { createRateLimiter } from './rate-limit.js';

const publicDir = new URL('../public/', import.meta.url);
const shell = readFileSync(new URL('contact.html', publicDir));

// No inline script or style, nothing external, no framing, no caching, no referrer: the link is a
// bearer secret and a duress page must leave no trace in a shared browser.
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

/** The JSON the page renders: derived from the payload, never from raw facts or permissions. */
export function pageData(payload, status) {
  const full = payload.variant === 'full';
  return {
    mode: payload.mode,
    ...(payload.audience === 'nearby' ? { nearby: true } : {}),
    wearerName: payload.wearerName,
    brief: renderBrief(payload),
    sinceSeconds: full ? status.sinceTriggerSeconds : status.sinceDeadlineSeconds,
    location: payload.location
      ? { mapUrl: payload.location.mapUrl, accuracyM: payload.location.accuracyM, at: payload.location.at } : null,
    canResolve: payload.canResolve,
    status: {
      state: status.state,
      closed: status.state === 'resolved' || status.state === 'cancelled',
      youAcknowledged: status.youAcknowledged,
      someoneAcknowledged: status.someoneAcknowledged,
      // Other contacts' names go only to recipients who may see the full brief.
      ...(full ? { acknowledgedBy: status.acknowledgedBy } : {})
    }
  };
}

export function mountContactPage(app, { engine, rateLimit = {} }) {
  const notActive = response => response.status(404).type('text/plain').send('This link is not active.');
  // AN13: 60 requests per minute per client IP on every /a/* route, valid link or not (this is also the
  // brute-force guard for the 128-bit tokens). Same bare text/plain style as a dead link.
  const limiter = createRateLimiter(rateLimit);
  app.use('/a', limiter.middleware((_request, response) => {
    response.set(SECURITY_HEADERS).status(429).type('text/plain').send('Too many requests. Try again shortly.');
  }));
  // One answer for malformed, unknown, not-yet-notified, closed-out and expired links.
  const gate = (request, response, next) => {
    response.set(SECURITY_HEADERS);
    const contact = engine.resolveToken(request.params.token);
    if (!contact) return notActive(response);
    request.contact = contact;
    next();
  };
  // Static assets are not rate limited (the page loads several per visit and they hold nothing secret).
  app.use('/contact-assets', (_request, response, next) => { response.set(SECURITY_HEADERS); next(); },
    express.static(fileURLToPath(new URL('assets/', publicDir)), { index: false, dotfiles: 'ignore', etag: false }),
    (_request, response) => response.status(404).type('text/plain').send('Not found'));
  app.get('/a/:token', gate, (_request, response) => response.type('html').send(shell));
  // AN10: the live location link in the SMS. Each open redirects to the newest fix the phone has sent;
  // with no fix yet, or no location permission, it lands on the contact page instead, so the answer
  // never reveals whether a location exists. no-referrer (SECURITY_HEADERS) keeps the token from Maps.
  app.get('/a/:token/map', gate, (request, response) => {
    const { escalationId, recipientId } = request.contact;
    const payload = engine.view(escalationId, recipientId);
    if (!payload) return notActive(response);
    response.redirect(302, payload.location?.mapUrl ?? `/a/${request.params.token}`);
  });
  app.get('/a/:token/data', gate, (request, response) => {
    const { escalationId, recipientId } = request.contact;
    const payload = engine.view(escalationId, recipientId);
    if (!payload) return notActive(response);
    response.json({ ok: true, data: pageData(payload, engine.pageStatus(escalationId, recipientId)), error: null });
  });
  app.post('/a/:token/ack', gate, (request, response) => {
    engine.acknowledge(request.contact.escalationId, request.contact.recipientId);
    response.status(204).end();
  });
  app.post('/a/:token/resolve', gate, (request, response) => {
    engine.resolve(request.contact.escalationId, request.contact.recipientId);
    response.status(204).end();
  });
  // Any other method or path under /a answers exactly like an unknown link.
  app.use('/a', (_request, response) => { response.set(SECURITY_HEADERS); notActive(response); });
}
