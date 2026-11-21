/* ============================================================
   app.js — 공용 상태 / 라우터 / 검색 / 유틸
   ============================================================ */
window.App = (function () {

  var Q  = window.QUESTIONS || [];
  var byId = {};
  Q.forEach(function (q) { byId[q.id] = q; });

  /* ---------- storage ---------- */
  var LS = {
    wrong : 'aip_c01_cbt_wrong_v1',   // { "12": {miss:2, active:true} }
    theme : 'aip_c01_cbt_theme_v1'
  };
  function read(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---------- 오답노트 ----------
     { 문항id: { miss: 누적 오답 횟수, active: 현재 목록에 있는지 } }

     틀리면 miss++ 하고 목록에 넣는다(active).
     오답노트 모드에서 맞히면 즉시 목록에서 뺀다(active=false).
     이때 레코드는 지우지 않고 miss 를 남겨 둔다 — 다시 틀렸을 때 몇 번째인지
     보여줘야 상습적으로 틀리는 문항이 눈에 띈다.                                */
  var wrong = read(LS.wrong, {});

  /* 구버전 레코드({miss, hit})에는 active 가 없다. 목록에 있던 것으로 간주해 살린다. */
  (function migrate() {
    var changed = false;
    Object.keys(wrong).forEach(function (k) {
      var r = wrong[k];
      if (!r || typeof r !== 'object') { delete wrong[k]; changed = true; return; }
      if (!('active' in r)) { r.active = true; delete r.hit; changed = true; }
    });
    if (changed) write(LS.wrong, wrong);
  })();

  function markWrong(id) {
    var r = wrong[id] || { miss: 0 };
    r.miss = (r.miss || 0) + 1;
    r.active = true;
    wrong[id] = r; write(LS.wrong, wrong); renderBadge();
  }
  function markRight(id, fromReview) {
    if (!fromReview) return;                 // 일반 모드에서 맞힌 건 목록을 건드리지 않음
    if (!wrong[id] || !wrong[id].active) return;
    wrong[id].active = false;                // miss 는 그대로 남긴다
    write(LS.wrong, wrong); renderBadge();
  }
  function missCount(id) { return (wrong[id] && wrong[id].miss) || 0; }
  function wrongIds() {
    return Object.keys(wrong)
      .filter(function (k) { return wrong[k].active && byId[k]; })
      .map(Number)
      .sort(function (a, b) { return a - b; });
  }
  function clearWrong() { wrong = {}; write(LS.wrong, wrong); renderBadge(); }

  function renderBadge() {
    var n = wrongIds().length, el = document.getElementById('wrong-badge');
    if (!el) return;
    el.textContent = n;
    el.classList.toggle('hot', n > 0);
  }

  /* ---------- 텍스트 유틸 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 원문(raw)에서 needles(원문 부분문자열)를 찾아 <mark>로 감싼다.
     원문을 변형하지 않기 위해 인덱스 기반으로 자른 뒤 각 조각을 escape 한다. */
  function highlight(raw, needles) {
    raw = String(raw == null ? '' : raw);
    if (!needles || !needles.length) return esc(raw);

    var lower = raw.toLowerCase();
    var spans = [];
    needles.forEach(function (n) {
      if (!n) return;
      var t = String(n).toLowerCase(), from = 0, i;
      while ((i = lower.indexOf(t, from)) !== -1) {
        spans.push([i, i + t.length]);
        from = i + t.length;
      }
    });
    if (!spans.length) return esc(raw);

    spans.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var merged = [];
    spans.forEach(function (s) {
      var last = merged[merged.length - 1];
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    });

    var out = '', cur = 0;
    merged.forEach(function (m) {
      out += esc(raw.slice(cur, m[0])) + '<mark>' + esc(raw.slice(m[0], m[1])) + '</mark>';
      cur = m[1];
    });
    return out + esc(raw.slice(cur));
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var s = a.slice().sort().join(''), t = b.slice().sort().join('');
    return s === t;
  }

  /* ---------- 라우터 ---------- */
  var routes = {};   // name -> fn(params)
  function register(name, fn) { routes[name] = fn; }

  function parseHash() {
    var h = (location.hash || '#/').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    return { name: parts[0] || 'home', args: parts.slice(1) };
  }

  var teardown = null;
  function render() {
    if (teardown) { try { teardown(); } catch (e) {} teardown = null; }
    var r = parseHash();
    var fn = routes[r.name] || routes.home;
    document.getElementById('app').scrollIntoView({ block: 'start' });
    window.scrollTo(0, 0);
    teardown = fn(r.args) || null;
    renderBadge();
  }
  function go(path) {
    if (location.hash === '#' + path) render();
    else location.hash = path;
  }

  /* ---------- 키보드 ---------- */
  var keyHandler = null;
  function onKeys(fn) { keyHandler = fn; }
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (keyHandler) keyHandler(e);
  });

  /* ---------- 테마 ---------- */
  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    var b = document.getElementById('theme-toggle');
    if (b) b.textContent = mode === 'dark' ? '☀' : '☽';
  }
  function initTheme() {
    var saved = read(LS.theme, null);
    if (!saved) {
      saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    }
    applyTheme(saved);
    var b = document.getElementById('theme-toggle');
    if (b) b.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next); write(LS.theme, next);
    });
  }

  /* ---------- 검색 ---------- */
  /* 한국어 용어와 영문 서비스명을 서로 찾아준다(가드레일 ↔ guardrail 등). */
  var SYN = [
    ['가드레일', 'guardrail'], ['지식 기반', 'knowledge base'], ['모델 평가', 'model evaluation'],
    ['교차 리전', 'cross-region'], ['추론 프로필', 'inference profile'], ['프로비저닝', 'provisioned'],
    ['벡터 스토어', 'vector store'], ['청킹', 'chunking'], ['재순위', 'rerank'],
    ['환각', 'hallucination'], ['에이전트', 'agent'], ['프롬프트', 'prompt']
  ];
  function termVariants(term) {
    var out = [term];
    SYN.forEach(function (pair) {
      for (var i = 0; i < 2; i++) {
        var from = pair[i], to = pair[1 - i];
        if (term.indexOf(from) !== -1) {
          var v = term.split(from).join(to);
          if (out.indexOf(v) === -1) out.push(v);
        }
      }
    });
    return out;
  }

  function searchQuestions(term) {
    term = term.trim().toLowerCase();
    if (!term) return [];
    var variants = termVariants(term);
    var hits = [];
    for (var i = 0; i < Q.length && hits.length < 40; i++) {
      var q = Q[i];
      var hay = q.stem + ' ' + q.options.map(function (o) { return o.t; }).join(' ') +
                ' ' + (q.topic || '') + ' ' + (q.subtopic || '') +
                ' ' + (q.cue || []).join(' ') + ' ' + (q.why || '') +
                ' ' + Object.keys(q.note || {}).map(function (k) { return q.note[k]; }).join(' ');
      hay = hay.toLowerCase();
      for (var v = 0; v < variants.length; v++) {
        if (hay.indexOf(variants[v]) !== -1) { hits.push(q); break; }
      }
    }
    return hits;
  }

  function initSearch() {
    var input = document.getElementById('search-input');
    var box   = document.getElementById('search-results');
    if (!input || !box) return;

    function close() { box.hidden = true; box.innerHTML = ''; }

    function show(term) {
      if (!term.trim()) return close();
      if (/^\d+$/.test(term.trim())) {
        var n = parseInt(term, 10);
        box.hidden = false;
        box.innerHTML = byId[n]
          ? '<div class="sr-item active" data-id="' + n + '"><span class="sr-id">Q' + n +
            '</span><span class="sr-topic">Enter 로 이동</span><div class="sr-text">' +
            esc((byId[n].stem || '(이미지 지문)').slice(0, 120)) + '</div></div>'
          : '<div class="sr-empty">Q' + n + ' 없음 (1–' + Q.length + ')</div>';
        return;
      }
      var hits = searchQuestions(term);
      box.hidden = false;
      if (!hits.length) { box.innerHTML = '<div class="sr-empty">검색 결과 없음</div>'; return; }
      box.innerHTML = hits.map(function (q) {
        return '<div class="sr-item" data-id="' + q.id + '">' +
          '<span class="sr-id">Q' + q.id + '</span>' +
          '<span class="sr-topic">' + esc(q.topic || '') + '</span>' +
          '<div class="sr-text">' + esc((q.stem || '(이미지 지문)').slice(0, 160)) + '</div></div>';
      }).join('');
    }

    input.addEventListener('input', function () { show(input.value); });
    input.addEventListener('focus', function () { if (input.value) show(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.blur(); close(); return; }
      if (e.key === 'Enter') {
        var first = box.querySelector('.sr-item');
        if (first) { go('/seq/' + first.getAttribute('data-id')); input.blur(); close(); }
      }
    });
    box.addEventListener('mousedown', function (e) {
      var it = e.target.closest('.sr-item');
      if (!it) return;
      e.preventDefault();
      go('/seq/' + it.getAttribute('data-id'));
      input.blur(); close();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-wrap')) close();
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    initTheme();
    initSearch();
    window.addEventListener('hashchange', render);
    render();
  }

  return {
    Q: Q, byId: byId,
    esc: esc, highlight: highlight, shuffle: shuffle, sameSet: sameSet,
    markWrong: markWrong, markRight: markRight, wrongIds: wrongIds,
    clearWrong: clearWrong, missCount: missCount,
    register: register, go: go, render: render, onKeys: onKeys,
    boot: boot
  };
})();
