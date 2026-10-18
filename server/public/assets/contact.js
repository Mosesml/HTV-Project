// Contact page. Plain script, no dependencies. All text goes in through textContent, never as
// markup, because the brief and names come from a phone.
(function (root) {
  'use strict';

  var POLL_MS = 3000;
  var MAPS_PREFIX = 'https://www.google.com/maps/';

  // Pure: what to show for the latest data, `elapsed` seconds after it arrived.
  function view(data, elapsed) {
    var duress = data.mode === 'duress';
    var status = data.status;
    var minutes = Math.floor(Math.max(0, data.sinceSeconds + elapsed) / 60);
    var statusText;
    if (status.closed) statusText = 'This alert has been closed. Thank you.';
    else if (status.youAcknowledged) statusText = 'You have acknowledged. Please check on ' + data.wearerName + '.';
    else if (status.someoneAcknowledged) {
      statusText = status.acknowledgedBy && status.acknowledgedBy.length
        ? status.acknowledgedBy.join(', ') + ' acknowledged.' : 'Someone has acknowledged.';
    } else statusText = 'No one has acknowledged yet.';
    var located = data.location && String(data.location.mapUrl).indexOf(MAPS_PREFIX) === 0;
    return {
      // The page shell's title is already neutral; a duress page keeps it that way.
      title: duress ? 'Safety check' : 'Guardian alert',
      banner: duress ? 'Do not call or text them openly.' : '',
      heading: data.nearby ? data.wearerName + ' needs help near you' : 'Check on ' + data.wearerName,
      since: minutes < 1 ? 'Just now' : minutes === 1 ? '1 minute ago' : minutes + ' minutes ago',
      brief: data.brief,
      mapHref: located ? data.location.mapUrl : '',
      accuracy: located ? '±' + data.location.accuracyM + ' m, fix at ' + data.location.at : '',
      status: statusText,
      ackLabel: status.youAcknowledged ? 'Acknowledged' : "I'm on it",
      ackDisabled: status.closed || status.youAcknowledged,
      showResolve: !!data.canResolve && !status.closed
    };
  }
  root.RaveGuardContact = { view: view };

  if (typeof document === 'undefined') return;

  var token = location.pathname.split('/')[2];
  var base = '/a/' + encodeURIComponent(token);
  var $ = function (id) { return document.getElementById(id); };
  var latest = null;
  var receivedAt = 0;
  var timer = null;
  var confirming = null;

  function render() {
    if (!latest) return;
    var v = view(latest, (Date.now() - receivedAt) / 1000);
    document.title = v.title;
    $('banner').hidden = !v.banner;
    $('banner').textContent = v.banner;
    $('heading').textContent = v.heading;
    $('since').textContent = v.since;
    $('brief').textContent = v.brief;
    $('location').hidden = !v.mapHref;
    if (v.mapHref) { $('map').href = v.mapHref; $('accuracy').textContent = v.accuracy; }
    $('status').textContent = v.status;
    $('ack').textContent = v.ackLabel;
    $('ack').disabled = v.ackDisabled;
    $('resolve').hidden = !v.showResolve;
    if (!confirming) $('resolve').textContent = 'Mark resolved';
  }

  function gone() {
    clearTimeout(timer);
    latest = null;
    $('banner').hidden = true;
    $('heading').textContent = 'This link is no longer active.';
    ['since', 'brief', 'status', 'notice'].forEach(function (id) { $(id).textContent = ''; });
    $('location').hidden = true;
    $('ack').hidden = true;
    $('resolve').hidden = true;
  }

  function poll() {
    clearTimeout(timer);
    fetch(base + '/data', { cache: 'no-store' }).then(function (response) {
      if (response.status === 404) { gone(); return null; }
      if (!response.ok) throw new Error('bad status');
      return response.json();
    }).then(function (body) {
      if (!body) return;
      latest = body.data;
      receivedAt = Date.now();
      $('notice').textContent = '';
      render();
      timer = setTimeout(poll, POLL_MS);
    }).catch(function () {
      $('notice').textContent = 'Connection lost. Retrying…';
      timer = setTimeout(poll, POLL_MS);
    });
  }

  function act(action, button) {
    button.disabled = true;
    fetch(base + '/' + action, { method: 'POST' }).then(function (response) {
      if (response.status === 404) { gone(); return; }
      if (!response.ok) throw new Error('bad status');
      poll();
    }).catch(function () {
      $('notice').textContent = 'Could not reach the server. Try again.';
      render();
    });
  }

  $('ack').addEventListener('click', function () { act('ack', $('ack')); });
  $('resolve').addEventListener('click', function () {
    if (!confirming) {
      // Two taps: a resolve closes the alert for everyone.
      $('resolve').textContent = 'Tap again to confirm';
      confirming = setTimeout(function () { confirming = null; render(); }, 5000);
      return;
    }
    clearTimeout(confirming);
    confirming = null;
    act('resolve', $('resolve'));
  });
  setInterval(render, 1000);
  poll();
})(typeof window !== 'undefined' ? window : globalThis);
