/* The small pieces the shared modules reach for.

   social.js, outreach.js and mail.js are used unchanged on both sites. In the Operating System
   the three names below are backed by full screens; here they are the handful of lookups those
   modules actually call, implemented against the reference extract. Keeping the shared modules
   identical is what stops the two sites drifting in the part that matters, which is the content
   and the sequence logic rather than the chrome around it. */
(function (global) {
  'use strict';

  var D;
  function useData(d) { D = d; }

  /* ---- centres of influence: the studio only needs a lane's display name ---- */
  global.COI = {
    useData: useData,
    laneName: function (id) {
      var l = (D.coi.lanes || []).filter(function (x) { return x.id === id; })[0];
      return l ? l.name : (id || 'No lane set');
    }
  };

  /* ---- life events: what kind of thing happened, and how it should be treated ---- */
  global.Growth = {
    useData: useData,
    eventType: function (id) {
      return (D.growth.lifeEvents.types.filter(function (t) { return t.id === id; })[0]) || null;
    },
    segment: function (id) {
      return (D.growth.segments.definitions.filter(function (s) { return s.id === id; })[0]) || null;
    }
  };

  /* ---- the quarter, as the engagement pieces need it ----
     The extract carries a sprint already reduced to its quarter label and three priorities, so
     this formats rather than computes. Anything the extract did not carry shows as a visible
     marker, the same discipline the rest of the studio runs under. */
  global.Sprint = {
    useData: useData,
    mergeSprint: function (text, c, sp) {
      if (!sp) {
        return String(text)
          .replace(/\{\{sprint\.quarter\}\}/g, '[NEEDS INPUT: which quarter]')
          .replace(/\{\{sprint\.priorities\}\}/g, '[NEEDS INPUT: the three priorities. Import a fresh extract, or paste them in.]');
      }
      var priorities = (sp.priorities || []).length
        ? sp.priorities.map(function (p, i) {
            var parts = [(i + 1) + '. ' + (p.title || '[NEEDS INPUT: priority]')];
            if (p.outcome) parts.push('   Outcome: ' + p.outcome);
            if (p.owner) parts.push('   Owner: ' + p.owner);
            if (p.first) parts.push('   First action: ' + p.first);
            if (p.due) parts.push('   Complete by: ' + global.Store.friendlyDate(p.due));
            if (p.decision) parts.push('   Client decides: ' + p.decision);
            return parts.join('\n');
          }).join('\n\n')
        : '[NEEDS INPUT: the three priorities]';
      return String(text)
        .replace(/\{\{sprint\.quarter\}\}/g, sp.quarter || '[NEEDS INPUT: which quarter]')
        .replace(/\{\{sprint\.priorities\}\}/g, priorities);
    }
  };
})(window);
