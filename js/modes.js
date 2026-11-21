/* ============================================================
   modes.js — 홈 / 순차 / 랜덤 / 키워드 플래시카드 / 오답노트
   ============================================================ */
(function () {

  var A = window.App, Q = A.Q, byId = A.byId, esc = A.esc;
  var app = function () { return document.getElementById('app'); };

  var MODE_LABEL = {
    seq   : '순차 풀이',
    random: '랜덤 풀이',
    kw    : '키워드 플래시카드',
    wrong : '오답노트'
  };

  /* ============================================================
     홈
     ============================================================ */
  A.register('home', function () {
    var withAnalysis = Q.filter(function (q) { return q.why; }).length;
    var topics = {};
    Q.forEach(function (q) { if (q.topic) topics[q.topic] = 1; });
    var nWrong = A.wrongIds().length;

    app().innerHTML =
      '<section class="hero">' +
        '<h1>AIP-C01 문제은행</h1>' +
        '<p>AWS Certified Generative AI Developer – Professional · CBT 학습</p>' +
        '<div class="hero-stats">' +
          '<div class="hstat"><b>' + Q.length + '</b><span>문항</span></div>' +
          '<div class="hstat"><b>' + Q.filter(function (q) { return q.multi; }).length +
            '</b><span>복수정답</span></div>' +
          '<div class="hstat"><b>' + Object.keys(topics).length + '</b><span>주제</span></div>' +
          '<div class="hstat"><b>' + withAnalysis + '</b><span>해설 완료</span></div>' +
        '</div>' +
      '</section>' +

      '<div class="mode-grid">' +
        card('/seq/1',  '1', '순차 풀이',
             '1번부터 ' + Q.length + '번까지 순서대로. 보기를 클릭하면 바로 정답과 해설이 열립니다.') +
        card('/random', '2', '랜덤 풀이',
             '전 문항을 섞어서 한 바퀴. 같은 문제가 다시 나오지 않습니다.') +
        card('/kw',     '3', '키워드 플래시카드',
             '지문 전문 대신 핵심 키워드만 보고 정답을 고르는 속독 훈련. 지문은 토글로 확인.') +
        card('/wrong',  '4', '오답노트',
             nWrong ? nWrong + '개 문항이 쌓여 있습니다. 맞히면 바로 빠지고, 다시 틀리면 다시 들어옵니다.'
                    : '틀린 문항이 여기에 모입니다. 아직 비어 있습니다.', !nWrong) +
      '</div>';

    function card(href, n, title, desc, disabled) {
      var cls = 'mode-card' + (disabled ? ' disabled' : '');
      var tag = disabled ? 'div' : 'a';
      var attr = disabled ? '' : ' href="#' + href + '"';
      return '<' + tag + ' class="' + cls + '"' + attr + '>' +
        '<div class="mode-num">' + n + '</div>' +
        '<h3>' + title + '</h3><p>' + desc + '</p></' + tag + '>';
    }

    A.onKeys(function (e) {
      if (e.key === '1') A.go('/seq/1');
      if (e.key === '2') A.go('/random');
      if (e.key === '3') A.go('/kw');
      if (e.key === '4' && A.wrongIds().length) A.go('/wrong');
    });
  });

  /* ============================================================
     퀴즈 엔진
     ============================================================ */
  function Quiz(cfg) {
    /* cfg: { mode, ids, pos, flashcard, record, onMove(pos,st), onRestart() }
       record 가 주어지면 { 문항id: 정답여부 } 로 채점을 누적한다.
       같은 문항을 다시 풀어도 중복 집계되지 않는다. */
    var st = {
      mode : cfg.mode,
      ids  : cfg.ids,
      pos  : cfg.pos || 0,
      picks: [],
      shown: false,
      full : false,                 // 플래시카드 원문 토글
      ok   : 0,
      bad  : 0
    };
    var record = cfg.record || {};
    recount();
    /* 누적 오답 횟수는 문항을 띄우는 시점에 한 번 찍어 둔다.
       정답을 맞히면 그 자리에서 목록에서 빠지므로 실시간으로 읽으면 0이 된다. */
    st.miss = A.missCount(st.ids[st.pos]);

    function recount() {
      var ok = 0, bad = 0;
      Object.keys(record).forEach(function (k) { record[k] ? ok++ : bad++; });
      st.ok = ok; st.bad = bad;
    }

    function q() { return byId[st.ids[st.pos]]; }

    function draw() {
      var cur = q();
      if (!cur) { drawDone(); return; }
      var ans = cur.answer || [];
      var isFC = cfg.flashcard && !st.full;

      /* ---- 상단 ---- */
      var pct = Math.round(((st.pos + (st.shown ? 1 : 0)) / st.ids.length) * 100);
      var html =
        '<div class="quizbar">' +
          '<a class="qb-back" href="#/">← 홈</a>' +
          '<span class="qb-title">' + MODE_LABEL[st.mode] + '</span>' +
          '<span class="qb-score">' +
            '<span class="s-ok">' + st.ok + '</span> / <span class="s-bad">' + st.bad + '</span>' +
          '</span>' +
          '<span class="qb-count">' + (st.pos + 1) + ' <span style="opacity:.5">/ ' +
            st.ids.length + '</span></span>' +
        '</div>' +
        '<div class="progress"><i style="width:' + pct + '%"></i></div>';

      /* ---- 카드 ---- */
      html += '<div class="qcard">' +
        '<div class="qhead">' +
          '<span class="qnum">Q' + cur.id + '</span>' +
          (cur.topic ? '<span class="tag">' + esc(cur.topic) + '</span>' : '') +
          (cur.subtopic && cur.subtopic !== cur.topic
            ? '<span class="tag sub">' + esc(cur.subtopic) + '</span>' : '') +
          (cur.multi ? '<span class="tag multi">정답 ' + ans.length + '개 선택</span>' : '') +
          (st.mode === 'wrong' && st.miss > 1
            ? '<span class="tag miss">' + st.miss + '번 틀림</span>' : '') +
          (cfg.flashcard
            ? '<span class="spacer"></span><button class="linkbtn" id="toggle-full">' +
              (st.full ? '키워드만 보기' : '원문 보기') + '</button>'
            : '') +
        '</div>';

      /* ---- 지문 ---- */
      if (isFC) {
        html += '<div class="fc-stem">' +
          '<div class="cues-label">핵심 키워드</div>' +
          '<div class="cues">' +
            (cur.cue && cur.cue.length
              ? cur.cue.map(function (c) { return '<span class="cue">' + esc(c) + '</span>'; }).join('')
              : '<span class="cue">키워드 미작성</span>') +
          '</div>' +
        '</div>';
      } else {
        if (cur.stem) {
          html += '<div class="stem">' +
            (st.shown ? A.highlight(cur.stem, cur.cue) : esc(cur.stem)) + '</div>';
        }
        if (cur.image) {
          html += '<img class="stem-img" src="' + esc(cur.image) +
                  '" alt="Q' + cur.id + ' 지문 이미지">';
        }
      }

      /* ---- 보기 ---- */
      html += '<ul class="opts">';
      cur.options.forEach(function (o) {
        var picked  = st.picks.indexOf(o.k) !== -1;
        var correct = ans.indexOf(o.k) !== -1;
        var cls = 'opt';
        if (st.shown) {
          cls += ' locked';
          if (correct) cls += ' correct';
          else if (picked) cls += ' wrong';
          else cls += ' dim';
        } else if (picked) cls += ' picked';

        var body;
        if (isFC) {
          var kw = cur.kw && cur.kw[o.k];
          body = '<span class="opt-t fc-kw">' + (kw ? esc(kw) : esc(o.t.slice(0, 80))) + '</span>';
        } else {
          body = '<span class="opt-t">' +
            (st.shown ? A.highlight(o.t, cur.kw ? [cur.kw[o.k]] : null) : esc(o.t)) + '</span>';
        }

        html += '<li>' +
          '<button class="' + cls + '" data-k="' + o.k + '"' + (st.shown ? ' disabled' : '') + '>' +
            '<span class="opt-k">' + o.k + '</span>' + body +
          '</button>';

        if (st.shown && cur.note && cur.note[o.k]) {
          html += '<div class="opt-note' + (correct ? ' is-ok' : '') + '">' +
                  esc(cur.note[o.k]) + '</div>';
        }
        html += '</li>';
      });
      html += '</ul>';

      /* ---- 해설 ---- */
      if (st.shown) {
        html += '<div class="analysis">' +
          '<div class="analysis-head">정답 근거 <span class="pill">한국어 해설</span></div>' +
          '<p>' + esc(cur.why || '(해설 미작성)') + '</p>' +
          '<p class="ans-line">정답 <b>' + ans.join(', ') + '</b></p>' +
        '</div>';
        if (cur.flag) {
          html += '<div class="flagbox"><b>정답 표기 차이</b> · ' + esc(cur.flag) + '</div>';
        }
        if (isFC && cur.stem) {
          html += '<div class="fc-full">' + esc(cur.stem) + '</div>';
        }
      }

      html += '</div>';   /* /qcard */

      /* ---- 컨트롤 ---- */
      var last = st.pos === st.ids.length - 1;
      html += '<div class="controls">';
      if (st.mode === 'seq') {
        html += '<button class="btn" id="prev"' + (st.pos === 0 ? ' disabled' : '') + '>← 이전</button>';
      }
      if (cur.multi && !st.shown) {
        html += '<button class="btn primary" id="confirm"' +
                (st.picks.length === ans.length ? '' : ' disabled') + '>확인 (' +
                st.picks.length + '/' + ans.length + ')</button>';
      }
      if (st.shown || st.mode === 'seq') {
        html += '<button class="btn' + (st.shown ? ' primary' : '') + '" id="next">' +
                (last && st.shown ? '결과 보기' : '다음 →') + '</button>';
      }
      html += '<span class="spacer"></span>';
      if (st.mode === 'seq') {
        html += '<span class="jump">이동 <input id="jump" type="text" inputmode="numeric" ' +
                'placeholder="' + cur.id + '"> / ' + Q.length + '</span>';
      }
      html += '<span class="kbd-hint"><kbd>1</kbd>–<kbd>' + cur.options.length +
              '</kbd> 선택 · <kbd>Enter</kbd> 다음</span>';
      html += '</div>';

      app().innerHTML = html;
      bind();
    }

    function drawDone() {
      var solved = st.ok + st.bad;
      var rate = solved ? Math.round((st.ok / solved) * 100) : 0;
      app().innerHTML =
        '<div class="empty">' +
          '<div class="result-num">' + st.ok + '<span class="of"> / ' + solved + '</span></div>' +
          '<h3>정답률 ' + rate + '%</h3>' +
          '<p>' + (st.bad ? '틀린 ' + st.bad + '문항이 오답노트에 저장되었습니다.'
                          : '틀린 문항이 없습니다.') + '</p>' +
          '<div class="controls" style="justify-content:center">' +
            '<button class="btn primary" id="again">다시 시작</button>' +
            (A.wrongIds().length ? '<a class="btn" href="#/wrong">오답노트 풀기</a>' : '') +
            '<a class="btn ghost" href="#/">홈</a>' +
          '</div>' +
        '</div>';
      var b = document.getElementById('again');
      if (b) b.addEventListener('click', function () {
        if (cfg.onRestart) cfg.onRestart(); else A.go('/');
      });
    }

    /* ---- 선택 / 채점 ---- */
    function pick(k) {
      if (st.shown) return;
      var cur = q(), ans = cur.answer || [];
      if (cur.multi) {
        var i = st.picks.indexOf(k);
        if (i === -1) { if (st.picks.length < ans.length) st.picks.push(k); }
        else st.picks.splice(i, 1);
        draw();
      } else {
        st.picks = [k];
        reveal();
      }
    }

    function reveal() {
      if (st.shown) return;
      var cur = q(), ans = cur.answer || [];
      st.shown = true;
      var right = A.sameSet(st.picks, ans);
      record[cur.id] = right;
      recount();
      if (right) A.markRight(cur.id, cfg.mode === 'wrong');
      else       A.markWrong(cur.id);
      draw();
    }

    function move(delta) {
      var n = st.pos + delta;
      if (n < 0) return;
      if (n >= st.ids.length) { st.pos = st.ids.length; drawDone(); return; }
      st.pos = n; st.picks = []; st.shown = false; st.full = false;
      st.miss = A.missCount(st.ids[st.pos]);
      if (cfg.onMove) cfg.onMove(st.pos, st);
      else draw();
    }

    function bind() {
      Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (el) {
        el.addEventListener('click', function () { pick(el.getAttribute('data-k')); });
      });
      var c = document.getElementById('confirm');
      if (c) c.addEventListener('click', reveal);
      var n = document.getElementById('next');
      if (n) n.addEventListener('click', function () { move(1); });
      var p = document.getElementById('prev');
      if (p) p.addEventListener('click', function () { move(-1); });
      var t = document.getElementById('toggle-full');
      if (t) t.addEventListener('click', function () { st.full = !st.full; draw(); });
      var j = document.getElementById('jump');
      if (j) j.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var v = parseInt(j.value, 10);
        if (v >= 1 && v <= Q.length) A.go('/seq/' + v);
      });

      A.onKeys(function (e) {
        var cur = q(); if (!cur) return;
        var idx = '12345678'.indexOf(e.key);
        if (idx !== -1 && idx < cur.options.length) {
          e.preventDefault(); pick(cur.options[idx].k); return;
        }
        var k = e.key.toUpperCase();
        if (!st.shown && 'ABCDEFGH'.indexOf(k) !== -1) {
          var hit = cur.options.some(function (o) { return o.k === k; });
          if (hit) { e.preventDefault(); pick(k); return; }
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!st.shown && cur.multi && st.picks.length === (cur.answer || []).length) reveal();
          else if (st.shown || st.mode === 'seq') move(1);
          return;
        }
        if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); move(-1); }
        if (e.key === 'f' && cfg.flashcard) { st.full = !st.full; draw(); }
      });
    }

    this.draw  = draw;
    this.state = st;
  }

  var allIds = function () { return Q.map(function (q) { return q.id; }); };

  /* ============================================================
     ① 순차 — 문항 번호를 해시에 유지 (새로고침·검색 점프에 강함)
     ============================================================ */
  var seqRecord = {};

  A.register('seq', function (args) {
    var id = parseInt(args[0], 10);
    if (!byId[id]) { A.go('/seq/1'); return; }

    var ids = allIds();
    new Quiz({
      mode: 'seq', ids: ids, pos: ids.indexOf(id), record: seqRecord,
      onMove: function (pos) { A.go('/seq/' + ids[pos]); },
      onRestart: function () {
        for (var k in seqRecord) delete seqRecord[k];
        A.go('/seq/1');
      }
    }).draw();
  });

  /* ============================================================
     ② 랜덤 — 세션당 전 문항 무중복 순회
     ============================================================ */
  var randomSession = null, randomRecord = {};

  A.register('random', function () {
    if (!randomSession) randomSession = A.shuffle(allIds());
    new Quiz({
      mode: 'random', ids: randomSession, record: randomRecord,
      onRestart: function () {
        randomSession = A.shuffle(allIds());
        randomRecord = {};
        A.go('/random');
      }
    }).draw();
  });

  /* ============================================================
     ③ 키워드 플래시카드
     ============================================================ */
  var kwSession = null, kwRecord = {};

  A.register('kw', function () {
    if (!kwSession) kwSession = A.shuffle(allIds());
    new Quiz({
      mode: 'kw', ids: kwSession, flashcard: true, record: kwRecord,
      onRestart: function () {
        kwSession = A.shuffle(allIds());
        kwRecord = {};
        A.go('/kw');
      }
    }).draw();
  });

  /* ============================================================
     ④ 오답노트 — 맞히면 즉시 목록에서 제거, 다시 틀리면 다시 들어옴
     ============================================================ */
  A.register('wrong', function () {
    /* 진입할 때마다 현재 오답 목록으로 세션을 새로 만든다.
       세션 안에서는 해시가 바뀌지 않으므로 이 함수가 다시 불리지 않고,
       덕분에 이미 졸업한 문항이 다음 방문에 다시 나오는 일이 없다. */
    var ids = A.wrongIds();
    if (!ids.length) {
      app().innerHTML =
        '<div class="empty"><h3>오답노트가 비어 있습니다</h3>' +
        '<p>순차 · 랜덤 · 플래시카드에서 틀린 문항이 자동으로 모입니다.<br>' +
        '여기서 맞히면 바로 목록에서 빠지고, 다시 틀리면 다시 들어옵니다.</p>' +
        '<div class="controls" style="justify-content:center">' +
        '<a class="btn primary" href="#/seq/1">순차 풀이 시작</a>' +
        '<a class="btn ghost" href="#/">홈</a></div></div>';
      return;
    }
    new Quiz({
      mode: 'wrong', ids: A.shuffle(ids), record: {},
      onRestart: function () { A.go('/wrong'); }
    }).draw();
  });

})();
