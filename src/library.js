/* Downbeat — saved sketches.

   A generated song is fully determined by its genre, key, scale, energy,
   length, tempo and the two seeds, so a save is that recipe rather than a
   dump of every note. It stays small enough to sit in a URL, which is what
   makes a sketch shareable as well as storable. */
(function (global) {
  'use strict';

  const STORE = 'downbeat.library.v1';
  const LIMIT = 60;

  /* The app was called Keyframe until the rebrand, and its storage keys were
     named after it. Renaming them outright would silently drop every sketch
     anyone had saved, so on first run under the new name we carry the old
     value across. The old key is left where it is: it costs nothing, and it
     means rolling back to the previous build still finds its data. */
  global.Store = global.Store || {
    key: function (name) {
      const now = 'downbeat.' + name;
      try {
        if (localStorage.getItem(now) === null) {
          const was = localStorage.getItem('keyframe.' + name);
          if (was !== null) localStorage.setItem(now, was);
        }
      } catch (e) { /* private mode — nothing to migrate into */ }
      return now;
    }
  };
  global.Store.key('library.v1');

  /* Short keys: these end up in a URL, so every character counts.

     What gets stored is the options that *produced* the song, not the values
     they resolved to. That distinction matters: naming a scale explicitly
     skips the random pick that "Pick for me" makes, which shifts the whole
     random stream and hands back a different progression. A recipe has to
     replay the same choices, not the same answers. */
  function recipeOf(song) {
    const opts = song.opts || {};
    return {
      v: 1,
      g: song.genreId,
      k: song.key.rootPc,
      s: opts.scale || '',
      e: song.energy,
      b: opts.bars === 'auto' || opts.bars === undefined ? 'a' : opts.bars,
      t: song.bpm,
      c: song.counter && song.counter.length ? 1 : 0,
      h: song.harmonySeed,
      m: song.melodySeed,
      /* The beat has its own seed now. Written as its own key rather than
         folded into the harmony one, because the whole point is that it can
         be rerolled without touching the chords. */
      d: song.drumSeed,
      n: song.title || ''
    };
  }

  /* The options `Compose.compose` needs to rebuild that exact song. */
  function optionsOf(recipe) {
    const opts = {
      genre: recipe.g,
      keyPc: Number(recipe.k),
      energy: recipe.e,
      bars: recipe.b === 'a' ? 'auto' : Number(recipe.b),
      bpm: Number(recipe.t),
      counter: !!Number(recipe.c),
      harmonySeed: Number(recipe.h),
      melodySeed: Number(recipe.m),
      /* A recipe written before the beat had a seed of its own carries no `d`,
         and the beat it played was derived from the harmony seed by exactly
         this expression. Reproducing it here is what keeps every share link
         and every saved sketch from before this change note for note — the
         compatibility belongs in the decoder rather than in the composer,
         which should not have to know that a previous format existed. */
      drumSeed: recipe.d === undefined || recipe.d === null || recipe.d === ''
        ? (Number(recipe.h) ^ 0xc2b2ae35) >>> 0
        : Number(recipe.d),
      title: recipe.n || ''
    };
    // An empty scale means the song was generated on "Pick for me".
    if (recipe.s) opts.scale = recipe.s;
    return opts;
  }

  /* ------------------------------------------------------------- storage */

  function read() {
    try {
      const raw = JSON.parse(global.localStorage.getItem(STORE));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function write(entries) {
    try {
      global.localStorage.setItem(STORE, JSON.stringify(entries.slice(0, LIMIT)));
      return true;
    } catch (e) {
      // Private browsing, or the quota is full.
      return false;
    }
  }

  function list() {
    return read();
  }

  function save(song) {
    const entries = read();
    const recipe = recipeOf(song);
    const key = encode(recipe);
    // Saving the same sketch twice should not fill the list with copies.
    const existing = entries.filter((entry) => entry.key === key);
    if (existing.length) return { entry: existing[0], duplicate: true };

    const entry = {
      id: 'k' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      key,
      recipe,
      title: song.title || 'Untitled sketch',
      meta: `${song.genre.label} · ${song.key.rootName} ${song.scaleName} · ${song.bpm} BPM · ${song.bars} bars`,
      savedAt: Date.now()
    };
    entries.unshift(entry);
    return { entry, stored: write(entries) };
  }

  function remove(id) {
    write(read().filter((entry) => entry.id !== id));
  }

  function rename(id, title) {
    const entries = read();
    entries.forEach((entry) => { if (entry.id === id) entry.title = title; });
    write(entries);
  }

  function find(id) {
    return read().filter((entry) => entry.id === id)[0] || null;
  }

  /* ------------------------------------------------------- URL encoding */

  /* Base64url so a sketch survives being pasted into a chat window. */
  function encode(recipe) {
    try {
      const json = JSON.stringify(recipe);
      return global.btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      return '';
    }
  }

  function decode(text) {
    try {
      const padded = text.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(global.atob(padded)));
      const recipe = JSON.parse(json);
      return recipe && recipe.g ? recipe : null;
    } catch (e) {
      return null;
    }
  }

  function linkFor(recipe) {
    const base = global.location.origin + global.location.pathname;
    return `${base}#s=${encode(recipe)}`;
  }

  /* A sketch in the address bar wins over a fresh random one on load. */
  function fromHash() {
    const match = /[#&]s=([A-Za-z0-9\-_]+)/.exec(global.location.hash || '');
    return match ? decode(match[1]) : null;
  }

  function clearHash() {
    if (global.history && global.history.replaceState) {
      global.history.replaceState(null, '', global.location.pathname + global.location.search);
    }
  }

  function when(timestamp) {
    const days = Math.floor((Date.now() - timestamp) / 86400000);
    if (days === 0) {
      const hours = Math.floor((Date.now() - timestamp) / 3600000);
      if (hours === 0) return 'just now';
      return `${hours}h ago`;
    }
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  global.Library = {
    recipeOf, optionsOf, list, save, remove, rename, find,
    encode, decode, linkFor, fromHash, clearHash, when
  };
})(window);
