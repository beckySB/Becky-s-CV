/* Outreach: who to approach, in what order, with what already drafted.

   The board is built from the network the practice already has rather than a list it rented.
   Every candidate it surfaces stands next to a household you serve, which means it arrives with
   a route in attached. That is the whole difference between this and a prospecting database.

   Nothing here sends anything. The studio decides and drafts; a person performs the send. That
   is a design decision rather than a missing feature, and the reasons are in data/outreach.json
   under `reality`. */
(function (global) {
  'use strict';

  var S = global.Store;
  var D;

  function useData(d) { D = d; }

  /* ---------------- lookups ---------------- */
  function sequence(id) { return (D.outreach.sequences.filter(function (s) { return s.id === id; })[0]) || null; }
  function source(id) { return (D.outreach.discovery.sources.filter(function (s) { return s.id === id; })[0]) || null; }
  function sourceName(id) { var s = source(id); return s ? s.name : 'Added by hand'; }
  function laneName(id) { return global.COI ? global.COI.laneName(id) : id; }

  /* Day offsets for a sequence, handed to the store so it can compute the next due date.
     A step with day 1 that sits after a step with day 21 is a parallel action rather than a
     later one, so the offsets are clamped to never run backwards. */
  function dayOffsets(seq) {
    var last = 0;
    return (seq ? seq.steps : []).map(function (st) {
      last = Math.max(last, st.day || 0);
      return last;
    });
  }

  function step(p) {
    var seq = sequence(p.sequence);
    if (!seq) return null;
    return seq.steps[p.stepIndex || 0] || null;
  }

  /* ---------------- the queue ----------------
     Everything with a sequence running and a step due on or before today. */
  function queue() {
    var t = S.iso(S.today());
    return S.prospects().filter(function (p) {
      return p.sequence && p.status === 'working' && p.nextDue && p.nextDue <= t;
    }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); });
  }

  function upcoming() {
    var t = S.iso(S.today());
    return S.prospects().filter(function (p) {
      return p.sequence && p.status === 'working' && p.nextDue && p.nextDue > t;
    }).sort(function (a, b) { return (a.nextDue || '').localeCompare(b.nextDue || ''); });
  }

  /* ---------------- discovery ----------------
     Read the store for people standing next to the practice who are not being worked yet.
     A candidate is not a record: it is a suggestion, and it only becomes a prospect when
     somebody accepts it off the board. */

  function already(name) {
    var n = String(name || '').trim().toLowerCase();
    if (!n) return true;
    var inCoi = S.cois().some(function (c) { return String(c.name || '').trim().toLowerCase() === n; });
    var inPro = S.prospects().some(function (p) { return String(p.name || '').trim().toLowerCase() === n; });
    return inCoi || inPro;
  }

  /* Rough mapping from the words people actually type into a role field onto the COI lanes,
     so a candidate arrives with a lane rather than making somebody pick one. */
  function guessLane(role) {
    var r = String(role || '').toLowerCase();
    if (/cpa|account|tax/.test(r)) return 'cpa';
    if (/estate/.test(r)) return 'estate';
    if (/attorney|lawyer|counsel|legal/.test(r)) return 'bizatty';
    if (/coo|operations/.test(r)) return 'coo';
    if (/cfo|controller|finance/.test(r)) return 'cfo';
    if (/bank|lend|credit|surety|m&a|valuation|insur|bookkeep/.test(r)) return 'adjacent';
    return '';
  }

  /* A household is called The Boudreaux Household and the owner is called something else.
     Where the Visionary intake has been filled in it holds the actual names, which is a far
     better source for a message that opens with one. */
  function ownerName(client) {
    var v = (client && client.forms && client.forms.visionary) || {};
    var n = String(v.names || '').trim();
    if (!n) return '';
    /* Full name(s) is often two people: take the first one named. */
    return n.split(/\s*(?:,|&|\band\b)\s*/i)[0].trim();
  }

  function candidates() {
    var out = [];
    var t = S.today();

    /* 1. Professionals already on a client's team who are not in the network yet.
          The warmest lead available, and the one most practices never work systematically. */
    S.clients().forEach(function (c) {
      (c.team || []).forEach(function (m) {
        if (already(m.name)) return;
        out.push({
          key: 'team_' + c.id + '_' + m.id,
          name: m.name, firm: m.firm || '', role: m.role || '', kind: 'coi',
          lane: guessLane(m.role), source: 'team',
          why: (m.role || 'A professional') + ' on ' + c.name + ', already working alongside you.',
          path: c.name + ' introduces you. They already trust both of you.',
          referrer: c.name, referrerId: c.id,
          email: m.email || '',
          sequence: 'coi_warm'
        });
      });
    });

    /* 2. People around a household the growth layer has flagged as a likely household of
          their own: a spouse, a child in the business, a key employee taking equity. */
    S.clients().forEach(function (c) {
      (c.people || []).forEach(function (pp) {
        if (pp.ownPlan) return;
        if (pp.expansion !== 'high') return;
        if (already(pp.name)) return;
        out.push({
          key: 'hh_' + c.id + '_' + pp.id,
          name: pp.name, firm: c.entity || '', role: pp.role || '', kind: 'household',
          lane: '', source: 'household',
          why: (pp.role || 'Someone') + ' in the ' + c.name + ' picture, flagged as a likely household of their own.',
          path: c.name + ', in the room, at the next quarterly.',
          referrer: ownerName(c) || c.name, referrerId: c.id,
          sequence: ''
        });
      });
    });

    /* 3. Lanes the network does not cover. Not a person, a gap, and it is worth surfacing
          next to the people because it competes for the same Tuesday morning. */
    var covered = {};
    S.cois().forEach(function (c) {
      if (c.status === 'warm' || c.status === 'core') covered[c.lane] = (covered[c.lane] || 0) + 1;
    });
    (D.coi.lanes || []).forEach(function (l) {
      if (covered[l.id]) return;
      out.push({
        key: 'lane_' + l.id,
        name: '', firm: '', role: l.name, kind: 'lane',
        lane: l.id, source: 'lane',
        why: 'Nobody warm in this lane. ' + l.why,
        path: 'Cold, or through a professional in an adjacent lane.',
        referrer: '', referrerId: '',
        sequence: 'coi_cold'
      });
    });

    /* 4. Warm COIs who have not been given a specific ask lately. The avatar exists so that
          the ask can be specific, and an ask that is never made wastes the whole apparatus. */
    S.cois().forEach(function (c) {
      if (c.status !== 'warm' && c.status !== 'core') return;
      var asked = (c.log || []).filter(function (x) { return x.type === 'meeting' || x.type === 'refGiven'; })
        .map(function (x) { return x.date; }).sort();
      var last = asked.length ? asked[asked.length - 1] : null;
      var days = last ? Math.round((t - new Date(last + 'T00:00:00')) / 86400000) : 999;
      if (days < 60) return;
      out.push({
        key: 'ask_' + c.id,
        name: c.name, firm: c.firm || '', role: laneName(c.lane), kind: 'ask',
        lane: c.lane, source: 'coi_ask',
        why: 'Warm, and no specific ask logged in ' + (last ? days + ' days' : 'the record at all') + '.',
        path: 'Already yours. This is a conversation, not an approach.',
        referrer: '', referrerId: '', coiId: c.id,
        sequence: ''
      });
    });

    /* 5. Recorded signals that raise intent. Somebody's moment has arrived and the practice
          heard about it, which is a different thing from the practice acting on it. */
    S.clients().forEach(function (c) {
      (c.signals || []).forEach(function (sg) {
        var ev = global.Growth ? global.Growth.eventType(sg.type) : null;
        if (!ev || ev.sentiment !== 'positive') return;
        var days = sg.date ? Math.round((t - new Date(sg.date + 'T00:00:00')) / 86400000) : 999;
        if (days > 90) return;
        out.push({
          key: 'sig_' + c.id + '_' + sg.id,
          name: ownerName(c) || c.name, headlineOverride: c.name,
          firm: c.entity || '', role: ev.name, kind: 'signal',
          lane: '', source: 'signal',
          why: ev.name + ' on ' + S.friendlyDate(sg.date) + '. ' + (sg.summary || ''),
          path: 'Already a household. This is expansion, not acquisition.',
          referrer: '', referrerId: c.id,
          sequence: ''
        });
      });
    });

    var gone = S.dismissed();
    return out.filter(function (c) { return gone.indexOf(c.key) === -1; })
      .map(score).sort(function (a, b) { return b.score - a.score; });
  }

  var KIND_LABEL = {
    coi: 'New connection', household: 'Household expansion', lane: 'Lane gap',
    ask: 'Introduction ask', signal: 'Client touch'
  };

  /* What the card calls it. A lane gap is not a person and a client touch is not an approach,
     and a board that labels them all the same way teaches people to skim it. */
  function headline(c) {
    if (c.kind === 'lane') return 'Nobody warm in: ' + c.role;
    if (c.headlineOverride) return c.headlineOverride;
    return c.name || c.role || 'Unnamed';
  }

  /* Every candidate gets an opening draft. The ones on a sequence take its first step; the
     rest take the draft attached to their source, because a suggestion without something to
     send is a to do item rather than a piece of work. */
  function draftFor(c) {
    if (c.sequence) {
      var seq = sequence(c.sequence);
      var first = seq && seq.steps[0];
      if (first) return { name: first.name, body: first.body, audience: first.audience, note: '' };
    }
    var src = source(c.source);
    if (src && src.openingDraft) {
      return { name: 'What to send', body: src.openingDraft, audience: c.kind === 'coi' || c.kind === 'ask' ? 'Prospective COI' : 'Client', note: src.draftNote || '' };
    }
    return null;
  }

  /* The ranking. A prompt for where to spend a Tuesday morning, never a verdict on a person. */
  function score(c) {
    var src = source(c.source);
    var n = (src ? src.weight : 1) * 10;
    if (c.referrer) n += 8;                       /* a named route in beats every other attribute */
    if (c.lane && c.kind === 'coi') n += 3;
    if (c.source === 'signal') n += 6;            /* a moment is time limited in a way nothing else is */
    if (!c.name) n -= 4;                          /* a lane gap is real work but it is not a person yet */
    c.score = n;
    c.scoreLabel = n >= 55 ? 'Do this first' : n >= 40 ? 'Worth this week' : 'On the board';
    c.scoreTone = n >= 55 ? 'good' : n >= 40 ? 'warn' : 'idle';
    c.headline = headline(c);
    c.kindLabel = KIND_LABEL[c.kind] || 'On the board';
    c.draft = draftFor(c);
    return c;
  }

  /* ---------------- merge ----------------
     Same discipline as the rest of the studio: what the system knows fills itself in, and what
     a person has to supply stays visible as a marker so a half written message cannot be sent
     by accident. */
  /* A household record is called The Boudreaux Household, and the first word of that is not
     anybody's name. Where a real first name cannot be derived, say so rather than guessing:
     a message that opens with the wrong name is worse than one that is obviously unfinished. */
  function firstName(name) {
    var n = String(name || '').trim().replace(/^the\s+/i, '');
    if (!n) return '[NEEDS INPUT: first name]';
    if (/\b(household|family|trust|partners|holdings|group|llc|inc|company|co)\b/i.test(n)) {
      return '[NEEDS INPUT: first name]';
    }
    return n.split(/\s+/)[0];
  }

  function merge(text, p) {
    var a = S.state.advisor || {};
    p = p || {};
    var first = firstName(p.name);
    var lane = p.lane ? laneName(p.lane) : '';
    return String(text)
      .replace(/\{\{first\}\}/g, first)
      .replace(/\{\{name\}\}/g, p.name || '[NEEDS INPUT: name]')
      .replace(/\{\{firm\}\}/g, p.firm || '[NEEDS INPUT: firm]')
      .replace(/\{\{role\}\}/g, p.role || lane || '[NEEDS INPUT: role]')
      .replace(/\{\{city\}\}/g, p.city || '[NEEDS INPUT: their market]')
      .replace(/\{\{lane_plural\}\}/g, lane ? lane.toLowerCase() + 's' : '[NEEDS INPUT: their profession, plural]')
      .replace(/\{\{referrer_first\}\}/g, firstName(p.referrer))
      .replace(/\{\{referrer\}\}/g, p.referrer || '[NEEDS INPUT: who introduced you]')
      .replace(/\{\{ADVISOR\}\}/g, a.name || '{{ADVISOR}}')
      .replace(/\{\{FIRM\}\}/g, a.firm || '{{FIRM}}');
  }

  /* Anything left for a person to fill, so the screen can say so before the copy button. */
  function openTokens(text) {
    var found = String(text).match(/\{\{[a-z_]+\}\}|\[NEEDS INPUT[^\]]*\]/g) || [];
    var seen = {}, out = [];
    found.forEach(function (f) { if (!seen[f]) { seen[f] = 1; out.push(f); } });
    return out;
  }

  /* ---------------- for the Today screen ---------------- */
  function attention() {
    var q = queue();
    if (!q.length) return null;
    return { due: q.length, first: q[0] };
  }

  global.Outreach = {
    useData: useData,
    sequence: sequence, sequences: function () { return D.outreach.sequences; },
    source: source, sourceName: sourceName,
    dayOffsets: dayOffsets, step: step,
    queue: queue, upcoming: upcoming,
    candidates: candidates, guessLane: guessLane, draftFor: draftFor,
    merge: merge, openTokens: openTokens, firstName: firstName,
    attention: attention
  };
})(window);
