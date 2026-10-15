(function () {
  'use strict';

  var TILES = {
    pumpkin: 'linear-gradient(135deg, #f6c58f, #e48a4a)',
    sage: 'linear-gradient(135deg, #cfe0c3, #93b48a)',
    cranberry: 'linear-gradient(135deg, #f2b8b5, #c4545b)',
    cream: 'linear-gradient(135deg, #fbe9c7, #e8c88d)',
    plum: 'linear-gradient(135deg, #e0cbe8, #a77dbb)',
    sky: 'linear-gradient(135deg, #cfe3ef, #8fb6cf)',
  };

  var RECIPIENTS = {
    mom: {
      label: 'Mom', emoji: '🥧',
      items: [
        { em: '🍲', name: 'Cast-iron Dutch oven', blurb: 'For the stuffing she refuses to share the recipe for.', price: 89, tile: 'cranberry' },
        { em: '🧶', name: 'Chunky knit throw', blurb: 'Post-dinner couch nap, upgraded.', price: 54, tile: 'cream' },
        { em: '🌿', name: 'Windowsill herb garden', blurb: 'Fresh sage and thyme all winter.', price: 32, tile: 'sage' },
        { em: '📖', name: 'Family recipe journal', blurb: 'Finally write down Grandma’s pie crust.', price: 28, tile: 'pumpkin' },
        { em: '🛁', name: 'Spa night set', blurb: 'She hosted 14 people. She earned it.', price: 45, tile: 'plum' },
        { em: '🥧', name: 'Fluted ceramic pie dish', blurb: 'Oven to table, no foil required.', price: 36, tile: 'pumpkin' },
      ],
    },
    dad: {
      label: 'Dad', emoji: '☕',
      items: [
        { em: '☕', name: 'Pour-over coffee kit', blurb: 'For the 6 a.m. turkey-prep shift.', price: 48, tile: 'cream' },
        { em: '🔥', name: 'Smokeless fire pit', blurb: 'Backyard hangs after the game.', price: 199, tile: 'pumpkin' },
        { em: '🛠️', name: 'Leather-case multitool', blurb: 'Fixes the folding table. Again.', price: 65, tile: 'sky' },
        { em: '🎵', name: 'Classic rock vinyl', blurb: 'The album he still hums.', price: 30, tile: 'plum' },
        { em: '🌡️', name: 'Wireless meat thermometer', blurb: 'No more “is it done yet?”', price: 39, tile: 'cranberry' },
        { em: '🧦', name: 'Merino wool socks', blurb: 'Three pairs. Zero cold feet.', price: 24, tile: 'sage' },
      ],
    },
    host: {
      label: 'The host', emoji: '🍷',
      items: [
        { em: '🫒', name: 'Olive wood serving board', blurb: 'Charcuterie centerpiece energy.', price: 42, tile: 'sage' },
        { em: '🕯️', name: 'Harvest candle trio', blurb: 'Cinnamon, cedar, and apple.', price: 35, tile: 'pumpkin' },
        { em: '🍯', name: 'Raw honey tasting set', blurb: 'Three small-batch jars.', price: 29, tile: 'cream' },
        { em: '🍂', name: 'Linen napkin set', blurb: 'Rust-colored, very autumn.', price: 38, tile: 'cranberry' },
        { em: '🍷', name: 'Wine aerator & stopper', blurb: 'The bottle you brought, but better.', price: 26, tile: 'plum' },
        { em: '💐', name: 'Seasonal flower bouquet', blurb: 'Delivered the morning of.', price: 50, tile: 'sky' },
      ],
    },
  };

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = { who: null, i: 0, liked: [], busy: false };

  // Reported to the player shell, which forwards them to analytics.
  function emit(name, data) {
    try { if (window.parent !== window) window.parent.postMessage({ type: 'portal-event', name: name, data: data || null }, '*'); } catch (_) {}
  }

  function show(id) {
    ['intro', 'play', 'done'].forEach(function (s) { $(s).hidden = s !== id; });
  }

  function cardEl(item) {
    var el = document.createElement('article');
    el.className = 'card';
    el.style.setProperty('--tile', TILES[item.tile]);
    el.innerHTML =
      '<div class="tile"><span></span></div>' +
      '<div class="meta"><h3></h3><p></p><strong></strong></div>' +
      '<div class="stamp like">LOVE</div><div class="stamp nope">SKIP</div>';
    el.querySelector('.tile span').textContent = item.em;
    el.querySelector('h3').textContent = item.name;
    el.querySelector('p').textContent = item.blurb;
    el.querySelector('strong').textContent = '$' + item.price;
    el.setAttribute('aria-label', item.name + ', $' + item.price);
    return el;
  }

  // Intro
  function renderIntro() {
    var chips = $('recipients');
    chips.innerHTML = '';
    Object.keys(RECIPIENTS).forEach(function (key) {
      var r = RECIPIENTS[key];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.innerHTML = '<span aria-hidden="true"></span>';
      b.firstChild.textContent = r.emoji;
      b.appendChild(document.createTextNode(r.label));
      b.addEventListener('click', function () { start(key); });
      chips.appendChild(b);
    });
    var fan = $('fan');
    fan.innerHTML = '';
    [RECIPIENTS.dad.items[1], RECIPIENTS.host.items[0], RECIPIENTS.mom.items[0]].forEach(function (it) {
      fan.appendChild(cardEl(it));
    });
    show('intro');
  }

  function start(who) {
    state.who = who;
    state.i = 0;
    state.liked = [];
    $('play-title').textContent = 'Shopping for ' + RECIPIENTS[who].label + ' ' + RECIPIENTS[who].emoji;
    renderTray();
    renderDeck();
    show('play');
    emit('start', { recipient: who });
  }

  // Play
  function items() { return RECIPIENTS[state.who].items; }

  function renderProgress() {
    var total = items().length;
    var bar = $('progress');
    bar.setAttribute('aria-valuemax', total);
    bar.setAttribute('aria-valuenow', state.i);
    bar.firstElementChild.style.width = (state.i / total) * 100 + '%';
  }

  function renderTray() {
    var tray = $('tray');
    tray.innerHTML = '';
    state.liked.forEach(function (it) {
      var li = document.createElement('li');
      li.style.setProperty('--tile', TILES[it.tile]);
      li.textContent = it.em;
      li.title = it.name;
      tray.appendChild(li);
    });
    $('tray-label').textContent = 'Loved (' + state.liked.length + ')';
  }

  function renderDeck() {
    var deck = $('deck');
    deck.innerHTML = '';
    var rest = items().slice(state.i, state.i + 3);
    // Last child sits on top.
    for (var k = rest.length - 1; k >= 0; k--) deck.appendChild(cardEl(rest[k]));
    renderProgress();
    var top = deck.lastElementChild;
    if (top) {
      top.classList.add('top');
      attachDrag(top);
    }
  }

  function decide(liked) {
    if (state.busy) return;
    var deck = $('deck');
    var top = deck.lastElementChild;
    if (!top) return;
    state.busy = true;
    var item = items()[state.i];
    if (liked) state.liked.push(item);
    emit('swipe', { recipient: state.who, item: item.name, liked: liked });

    var next = top.previousElementSibling;
    if (next) { next.classList.add('settle'); next.style.transform = 'none'; }
    top.querySelector(liked ? '.stamp.like' : '.stamp.nope').style.opacity = 1;
    top.classList.remove('settle');
    top.classList.add('fly');
    top.style.transform = 'translate(' + (liked ? 140 : -140) + '%, -4%) rotate(' + (liked ? 18 : -18) + 'deg)';

    var advanced = false;
    function advance() {
      if (advanced) return;
      advanced = true;
      state.i++;
      state.busy = false;
      renderTray();
      if (state.i >= items().length) finish();
      else renderDeck();
    }
    if (reduceMotion) advance();
    else { top.addEventListener('transitionend', advance, { once: true }); setTimeout(advance, 400); }
  }

  function attachDrag(card) {
    var startX = 0, startY = 0, dx = 0, dy = 0, t0 = 0, dragging = false, id = null;
    var like = card.querySelector('.stamp.like');
    var nope = card.querySelector('.stamp.nope');

    card.addEventListener('pointerdown', function (e) {
      if (state.busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dragging = true; id = e.pointerId;
      startX = e.clientX; startY = e.clientY; dx = dy = 0; t0 = performance.now();
      card.classList.remove('settle');
      card.setPointerCapture(id);
    });
    card.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== id) return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      card.style.transform = 'translate(' + dx + 'px,' + dy * 0.25 + 'px) rotate(' + dx / 18 + 'deg)';
      like.style.opacity = Math.max(0, Math.min(1, dx / 90));
      nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    function end(e) {
      if (!dragging || e.pointerId !== id) return;
      dragging = false;
      var v = Math.abs(dx) / Math.max(1, performance.now() - t0);
      if (Math.abs(dx) > card.offsetWidth * 0.3 || (Math.abs(dx) > 30 && v > 0.6)) {
        decide(dx > 0);
      } else {
        card.classList.add('settle');
        card.style.transform = '';
        like.style.opacity = nope.style.opacity = 0;
      }
    }
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  // Done
  function finish() {
    var r = RECIPIENTS[state.who];
    var picks = $('picks');
    picks.innerHTML = '';
    var total = 0;
    state.liked.forEach(function (it, n) {
      total += it.price;
      var li = document.createElement('li');
      li.style.animationDelay = n * 60 + 'ms';
      li.innerHTML = '<span class="em"></span><b></b><span class="price"></span>';
      li.querySelector('.em').style.setProperty('--tile', TILES[it.tile]);
      li.querySelector('.em').textContent = it.em;
      li.querySelector('b').textContent = it.name;
      li.querySelector('.price').textContent = '$' + it.price;
      picks.appendChild(li);
    });
    if (!state.liked.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing made the cut. Tough crowd.';
      picks.appendChild(empty);
    }
    $('done-eyebrow').textContent = 'Picks for ' + r.label;
    $('done-title').textContent = state.liked.length
      ? state.liked.length + (state.liked.length === 1 ? ' gift' : ' gifts') + ', $' + total + ' total'
      : 'Back to the drawing board';
    $('done-lede').textContent = state.liked.length
      ? 'Reply to the post with your #1 pick for ' + r.label.toLowerCase() + '.'
      : 'Try another round, or shop for someone else.';
    show('done');
    emit('complete', { recipient: state.who, liked: state.liked.map(function (it) { return it.name; }), total: total });
  }

  $('btn-like').addEventListener('click', function () { decide(true); });
  $('btn-nope').addEventListener('click', function () { decide(false); });
  $('back').addEventListener('click', renderIntro);
  $('restart').addEventListener('click', renderIntro);
  $('again').addEventListener('click', function () { start(state.who); });
  document.addEventListener('keydown', function (e) {
    if ($('play').hidden) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); decide(true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); decide(false); }
  });

  renderIntro();
})();
