/* The Downbeat mark, authored once.

   Four vertical strokes on a hairline baseline — a bar of four with beat one
   accented. That is the word *downbeat* drawn, and at 16px the accented stroke
   plus the baseline still reads, which is the whole reason the mark is strokes
   and not a letterform: it survives the favicon where the word cannot.

   Every consumer reads this module: the header lockup, the onboarding marks,
   the empty and error states, tools/make-icons.js, and the inline favicon in
   index.html — which is the one copy that cannot call JS at parse time, so it
   is pasted from Mark.FAVICON and must be re-pasted if the geometry moves. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mark = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 28;
  var H = 16;

  /* Stroke 1 is 3x15 and solid; strokes 2-4 are 1.5x8 at 34% ink on a 5px
     pitch. The baseline runs the width of the lockup and overshoots 8px to the
     right like a fader scale, which is what stops the mark reading as a bar
     chart. */
  var STROKES = [
    { x: 0,  y: 0, w: 3,   h: 15, lead: true },
    { x: 8,  y: 7, w: 1.5, h: 8 },
    { x: 13, y: 7, w: 1.5, h: 8 },
    { x: 18, y: 7, w: 1.5, h: 8 }
  ];
  var BASELINE_W = 27.5;

  /* Opacity is driven from --lit rather than swapped, so a beat strikes and
     decays on the phosphor curve instead of blinking. --rest is the stroke's
     resting ink and is set in css/motion.css, not here: it changes when the
     mark starts counting, and an inline declaration would outrank the layer
     that changes it. */
  var LIT = 'calc(var(--rest,1) + (1 - var(--rest,1)) * var(--lit,0))';

  function svg(options) {
    var o = options || {};
    var size = Number(o.size) || 0;
    var dims = size ? ' width="' + size + '" height="' + (size * H / W).toFixed(2) + '"' : '';
    var cls = 'mark' + (o.live ? ' is-live' : '') + (o.className ? ' ' + o.className : '');
    var body = STROKES.map(function (s, i) {
      return '<rect class="mark-stroke"' + (s.lead ? ' data-lead=""' : '') +
        ' style="--beat:' + i + ';opacity:' + LIT + '"' +
        ' x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '"' +
        ' fill="' + (s.lead ? 'var(--lamp)' : 'var(--ink)') + '"/>';
    }).join('');
    return '<svg class="' + cls + '" viewBox="0 0 ' + W + ' ' + H + '"' + dims +
      ' xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
      body +
      '<rect class="mark-rule" x="0" y="15" width="' + BASELINE_W + '" height="1" fill="var(--edge-hot)"/>' +
      '</svg>';
  }

  function render(target, options) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    el.innerHTML = svg(options);
    return el.firstElementChild;
  }

  /* The favicon is the one place the mark cannot reference a token: it is drawn
     by the browser chrome, outside the document, so the two literals below are
     --room and --lamp resolved by hand. Percent-encoded because a '#' inside a
     data: URI in an href terminates it. */
  var FAVICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
    "<rect width='32' height='32' fill='%23070806'/><g transform='translate(2 8)'>" +
    "<rect x='0' y='0' width='3' height='15' fill='%23FF8A32'/>" +
    "<rect x='8' y='7' width='1.5' height='8' fill='%23E9E7DF' opacity='.34'/>" +
    "<rect x='13' y='7' width='1.5' height='8' fill='%23E9E7DF' opacity='.34'/>" +
    "<rect x='18' y='7' width='1.5' height='8' fill='%23E9E7DF' opacity='.34'/>" +
    "<rect x='0' y='15' width='27.5' height='1' fill='%23E9E7DF' opacity='.38'/>" +
    "</g></svg>";

  /* Re-points the document's icon at the string above. index.html already ships
     it inline so the first paint is right; this exists so the two can never
     silently diverge once the geometry changes. */
  function favicon() {
    var link = document.querySelector("link[rel='icon'][type='image/svg+xml']");
    if (link) link.setAttribute('href', FAVICON);
    return FAVICON;
  }

  return {
    WIDTH: W,
    HEIGHT: H,
    STROKES: STROKES,
    SVG: svg(),
    svg: svg,
    render: render,
    FAVICON: FAVICON,
    favicon: favicon
  };
});
