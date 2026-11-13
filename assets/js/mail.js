/* Gmail, for the outreach queue.

   This site has no backend and no server side secrets, so the browser talks to Gmail directly
   through Google Identity Services: the person using it authorises their own mailbox, and the
   access token lives in memory for the length of the session and is never written to storage.
   Nothing about a client or a prospect passes through anything of ours on the way.

   The default action is Create a draft rather than Send. That is deliberate for this practice.
   A draft lands in the person's own Gmail, where they read it, and press send themselves, which
   means the message goes out through the firm's normal mail flow and archiving, with a human
   genuinely performing the send. Send now exists for when that is not needed. */
(function (global) {
  'use strict';

  var S = global.Store;

  /* Compose covers creating drafts and sending. Asking for nothing beyond that is the point:
     this never reads a mailbox and the consent screen should say so. */
  var SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
  var API = 'https://gmail.googleapis.com/gmail/v1/users/me';

  /* In memory only, and gone when the tab closes. A token that can send mail as somebody does
     not belong in the same store as their client records. */
  var token = null;
  var tokenExpires = 0;
  var client = null;

  function clientId() { return (S.state.advisor && S.state.advisor.gmailClientId || '').trim(); }
  function configured() { return !!clientId(); }
  function ready() { return !!(global.google && global.google.accounts && global.google.accounts.oauth2); }
  function connected() { return !!token && Date.now() < tokenExpires; }

  function status() {
    if (!configured()) return { state: 'unconfigured', label: 'Not set up', tone: 'idle' };
    if (!ready()) return { state: 'unavailable', label: 'Google script did not load', tone: 'alert' };
    if (!connected()) return { state: 'disconnected', label: 'Not connected', tone: 'warn' };
    return { state: 'connected', label: 'Connected', tone: 'good' };
  }

  /* Google hands back a token with an expiry in seconds. Retire it a minute early so a request
     started just before the boundary does not fail halfway through. */
  function connect() {
    return new Promise(function (resolve, reject) {
      if (!configured()) return reject(new Error('No Google client ID has been set. Settings has the field and the steps.'));
      if (!ready()) return reject(new Error('The Google sign-in script did not load. Check the connection and reload.'));
      if (connected()) return resolve(true);

      try {
        client = global.google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPE,
          callback: function (resp) {
            if (resp && resp.access_token) {
              token = resp.access_token;
              tokenExpires = Date.now() + ((resp.expires_in || 3600) - 60) * 1000;
              resolve(true);
            } else {
              reject(new Error((resp && resp.error_description) || 'Google did not return a token.'));
            }
          },
          error_callback: function (err) {
            reject(new Error((err && err.message) || 'The Google window was closed before it finished.'));
          }
        });
        client.requestAccessToken();
      } catch (e) { reject(e); }
    });
  }

  function disconnect() {
    if (token && global.google && global.google.accounts && global.google.accounts.oauth2) {
      try { global.google.accounts.oauth2.revoke(token); } catch (e) { /* revoking is best effort */ }
    }
    token = null; tokenExpires = 0;
  }

  /* ---------------- the message ----------------
     Every email draft in this studio opens with a Subject: line. Split it off rather than
     mailing it as the first line of the body. */
  function parse(text) {
    var t = String(text || '').replace(/\r\n/g, '\n');
    var m = t.match(/^\s*Subject:\s*(.*)\n+([\s\S]*)$/i);
    if (m) return { subject: m[1].trim(), body: m[2].replace(/^\n+/, '') };
    return { subject: '', body: t };
  }

  /* btoa works on binary strings, so anything above the ASCII range has to be encoded first or
     it throws. Then base64url, which is what the Gmail API wants. */
  function b64url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* A header value cannot carry a newline. Anything that tries is a header injection. */
  function header(v) { return String(v || '').replace(/[\r\n]+/g, ' ').trim(); }

  function raw(to, subject, body) {
    var lines = [
      'To: ' + header(to),
      'Subject: ' + header(subject),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      String(body || '')
    ];
    return b64url(lines.join('\r\n'));
  }

  function call(path, payload) {
    return fetch(API + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.ok) return r.json();
      return r.json().catch(function () { return null; }).then(function (j) {
        var msg = (j && j.error && j.error.message) || ('Gmail returned ' + r.status);
        if (r.status === 401 || r.status === 403) {
          token = null; tokenExpires = 0;    /* force a fresh consent rather than looping on a dead token */
          msg += '. Connect again and retry.';
        }
        throw new Error(msg);
      });
    });
  }

  function ensure() { return connected() ? Promise.resolve(true) : connect(); }

  function createDraft(to, subject, body) {
    if (!header(to)) return Promise.reject(new Error('No email address on this record yet.'));
    return ensure().then(function () {
      return call('/drafts', { message: { raw: raw(to, subject, body) } });
    });
  }

  function send(to, subject, body) {
    if (!header(to)) return Promise.reject(new Error('No email address on this record yet.'));
    return ensure().then(function () {
      return call('/messages/send', { raw: raw(to, subject, body) });
    });
  }

  /* The fallback that needs no setup at all: hand the draft to whatever mail client the machine
     already has. It does not send and it does not archive, but it beats copy and paste. */
  function mailto(to, subject, body) {
    return 'mailto:' + encodeURIComponent(header(to)) +
      '?subject=' + encodeURIComponent(header(subject)) +
      '&body=' + encodeURIComponent(String(body || ''));
  }

  function draftUrl(res) {
    var id = res && (res.message && res.message.id);
    return id ? 'https://mail.google.com/mail/u/0/#drafts?compose=' + id : 'https://mail.google.com/mail/u/0/#drafts';
  }

  global.Mail = {
    SCOPE: SCOPE,
    configured: configured, connected: connected, ready: ready, status: status,
    connect: connect, disconnect: disconnect,
    parse: parse, raw: raw, mailto: mailto, draftUrl: draftUrl,
    createDraft: createDraft, send: send
  };
})(window);
