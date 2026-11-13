/* The marketing half of the Content Studio: what the practice says in public, and what it
   says to clients between the quarterly meetings.

   The rest of this system is careful about what leaves the advisor's desk. This module is
   held to the same standard, which is why every piece carries an audience class and nothing
   here is treated as approved. Drafted here, reviewed by the firm, posted after. */
(function (global) {
  'use strict';

  var S = global.Store;
  var D;

  function useData(d) { D = d; }

  /* ---------------- lookups ---------------- */
  function pillar(id) { return (D.social.pillars.filter(function (p) { return p.id === id; })[0]) || null; }
  function pillarName(id) { var p = pillar(id); return p ? p.name : 'Unassigned'; }
  function channel(id) { return (D.social.channels.filter(function (c) { return c.id === id; })[0]) || null; }
  function channelName(id) { var c = channel(id); return c ? c.name : id; }
  function post(id) { return (D.social.posts.filter(function (p) { return p.id === id; })[0]) || null; }
  function video(id) { return (D.social.video.library.filter(function (v) { return v.id === id; })[0]) || null; }

  /* Segment ids come from the growth layer, so a post can be picked for the kind of owner
     you are actually looking at rather than by topic alone. */
  function segmentName(id) {
    if (!id || id === 'coi') return id === 'coi' ? 'Centres of influence' : 'Any owner';
    var s = D.growth.segments.definitions.filter(function (x) { return x.id === id; })[0];
    return s ? s.name : id;
  }

  /* ---------------- filtering ---------------- */
  function posts(filter) {
    filter = filter || {};
    return D.social.posts.filter(function (p) {
      if (filter.channel && p.channel !== filter.channel) return false;
      if (filter.pillar && p.pillar !== filter.pillar) return false;
      if (filter.segment && p.segment !== filter.segment) return false;
      return true;
    });
  }

  function engagement(group) {
    return D.social.engagement.filter(function (e) { return !group || e.group === group; });
  }

  /* ---------------- merge ----------------
     The same discipline the prompt library runs under: anything missing shows up as a visible
     marker rather than a guess, and the placeholders a human has to fill stay visible on
     purpose. {{ADVISOR}} and {{FIRM}} fill from Settings when they have been set. */
  function merge(text, c, sp) {
    var a = S.state.advisor || {};
    var out = text
      .replace(/\{\{ADVISOR\}\}/g, a.name || '{{ADVISOR}}')
      .replace(/\{\{FIRM\}\}/g, a.firm || '{{FIRM}}');

    if (c) {
      out = out
        .replace(/\{\{client\.name\}\}/g, c.name || '[NEEDS INPUT: client name]')
        .replace(/\{\{client\.entity\}\}/g, c.entity || '[NEEDS INPUT: operating company]')
        .replace(/\{\{client\.industry\}\}/g, c.industry || '[NEEDS INPUT: industry]');
    }
    if (sp && global.Sprint) {
      out = global.Sprint.mergeSprint(out, c, sp);
    }
    return out;
  }

  /* ---------------- the hook ----------------
     On LinkedIn the first line is the whole job, because it is all that shows before the
     reader has to choose to expand. Worth seeing on its own while drafting. */
  function hook(body) {
    var first = String(body).split('\n')[0].trim();
    return { text: first, words: first ? first.split(/\s+/).length : 0, chars: first.length };
  }

  function wordCount(body) {
    var t = String(body).replace(/\{\{[^}]*\}\}/g, 'x').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  /* A post's length read against what its channel asks for. Advisory, not enforcement:
     a good post that runs long is still a good post. */
  function lengthRead(p) {
    var n = wordCount(p.body);
    if (p.channel === 'li') {
      if (/Short/.test(p.format)) return n <= 90 ? { tone: 'good', label: n + ' words' } : { tone: 'warn', label: n + ' words, long for a short post' };
      if (n < 110) return { tone: 'warn', label: n + ' words, thin for a full post' };
      if (n > 260) return { tone: 'warn', label: n + ' words, over the fold twice' };
      return { tone: 'good', label: n + ' words' };
    }
    return { tone: 'idle', label: n + ' words' };
  }

  /* ---------------- the calendar ----------------
     Weeks resolve to real posts so a week can be read as a week's work rather than a
     list of identifiers. Anchored to the current quarter's start so week 1 is this week. */
  function weeks() {
    return D.social.calendar.weeks.map(function (w) {
      var o = {};
      Object.keys(w).forEach(function (k) { o[k] = w[k]; });
      o.liPosts = (w.li || []).map(post).filter(Boolean);
      o.igPosts = (w.ig || []).map(post).filter(Boolean);
      o.pillarName = pillarName(w.pillar);
      return o;
    });
  }

  /* Which week of the current quarter we are standing in, so the calendar can say
     "you are here" rather than making somebody count. */
  function currentWeek() {
    var t = S.today();
    var q = Math.floor(t.getMonth() / 3);
    var start = new Date(t.getFullYear(), q * 3, 1);
    var n = Math.floor((t - start) / (7 * 24 * 3600 * 1000)) + 1;
    return Math.min(Math.max(n, 1), 12);
  }

  /* Everything the calendar says is due this week, for the Today screen. */
  function thisWeek() {
    var w = weeks().filter(function (x) { return x.n === currentWeek(); })[0];
    if (!w) return null;
    return {
      n: w.n, theme: w.theme,
      pieces: 3 + w.igPosts.length + (w.email ? 1 : 0)
    };
  }

  global.Social = {
    useData: useData,
    pillar: pillar, pillarName: pillarName,
    channel: channel, channelName: channelName,
    segmentName: segmentName,
    post: post, posts: posts, video: video, engagement: engagement,
    merge: merge, hook: hook, wordCount: wordCount, lengthRead: lengthRead,
    weeks: weeks, currentWeek: currentWeek, thisWeek: thisWeek
  };
})(window);
