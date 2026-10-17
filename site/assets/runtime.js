/*
 * AI사업단 성과관리 대시보드 — 독립 실행 런타임
 * - window.dash  : 화면이 쓰는 자료 접근(자료·계산값·다시 그리기)
 * - window.claude: 공유 저장소(/api/inputs), 파일 저장, 권한(모두 입력 가능)
 * 서버 함수가 없거나 연결되지 않으면 이 브라우저(localStorage)에만 저장합니다.
 */
(function () {
  'use strict';

  // ---------- 자료 접근 ----------
  var RAW = window.DASH_DATA || {};
  var calcs = {}, cache = {}, listeners = [];
  var dash = {
    colors: ['#5b8fd6', '#d6705b', '#4fb08f', '#9a6fd6', '#d6a94f', '#4fb0d6', '#d64f8f', '#7a8a3b'],
    data: function (id) {
      if (Object.prototype.hasOwnProperty.call(RAW, id)) return { status: 'ok', data: RAW[id], columns: [], meta: [], refreshing: false };
      var c = calcs[id];
      if (c) {
        if (!Object.prototype.hasOwnProperty.call(cache, id)) {
          try { cache[id] = c.fn.apply(null, c.inputs.map(function (i) { return dash.data(i).data; })); }
          catch (e) { console.error('계산 오류', id, e); cache[id] = []; }
        }
        return { status: 'ok', data: cache[id], columns: [], meta: [], refreshing: false };
      }
      return { status: 'ok', data: [], columns: [], meta: [], refreshing: false };
    },
    calc: function (id, o) { calcs[id] = o; delete cache[id]; },
    loader: function () {},
    onData: function (fn) {
      listeners.push(fn);
      setTimeout(fn, 0);
    },
    setLink: function () {}, params: function () { return {}; }, setParams: function () {}, resetParams: function () {}
  };
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { listeners.forEach(function (f) { f(); }); }, 120); });
  window.dash = dash;

  // ---------- 공유 저장소 ----------
  var API = 'api/inputs';
  var LS_KEY = 'ai-dash-store-v1';
  var POLL_MS = 10000;
  var mode = 'pending'; // 'server' | 'local'
  var state = { inputs: {}, log: [] };
  var subs = { inputs: [], log: [] };
  var modeListeners = [];

  function lsRead() { try { var s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return { inputs: s.inputs || {}, log: s.log || [] }; } catch (e) { return { inputs: {}, log: [] }; } }
  function lsWrite() { try { localStorage.setItem(LS_KEY, JSON.stringify({ inputs: state.inputs, log: state.log.slice(0, 200) })); } catch (e) { /* 저장 공간 없음 */ } }
  function setMode(m) { if (mode !== m) { mode = m; modeListeners.forEach(function (f) { f(m); }); } }
  function snapDocs(obj) { return Object.keys(obj).map(function (k) { var v = obj[k]; return { id: k, exists: true, data: function () { return v; } }; }); }
  function emit() {
    var a = { docs: snapDocs(state.inputs) };
    var logs = state.log.slice().sort(function (x, y) { return String(y.t).localeCompare(String(x.t)); }).slice(0, 40);
    var b = { docs: logs.map(function (v, i) { return { id: 'l' + i, exists: true, data: function () { return v; } }; }) };
    subs.inputs.forEach(function (f) { f(a); });
    subs.log.forEach(function (f) { f(b); });
  }
  var lastJson = '';
  function pull() {
    if (mode === 'local') return Promise.resolve();
    return fetch(API, { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) {
        if (!j || typeof j.inputs !== 'object') throw new Error('bad');
        setMode('server');
        var s = JSON.stringify(j);
        if (s !== lastJson) { lastJson = s; state = { inputs: j.inputs || {}, log: j.log || [] }; emit(); }
      })
      .catch(function () {
        if (mode === 'pending') { setMode('local'); state = lsRead(); emit(); }
      });
  }
  function post(body) {
    if (mode === 'local') return Promise.resolve();
    return fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) { var e = new Error('저장 실패'); e.code = r.status === 400 ? 'invalid_argument' : 'unavailable'; throw e; } });
  }
  var ready = pull();
  setInterval(function () { if (document.visibilityState !== 'hidden') pull(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('storage', function (e) { if (e.key === LS_KEY && mode === 'local') { state = lsRead(); emit(); } });

  function docRef(path) {
    var key = path.split('/')[1];
    return {
      set: function (data) {
        var v = JSON.parse(JSON.stringify(data));
        state.inputs[key] = v; emit();
        if (mode === 'local') { lsWrite(); return Promise.resolve(); }
        return post({ op: 'set', key: key, data: v }).then(pull);
      },
      delete: function () {
        delete state.inputs[key]; emit();
        if (mode === 'local') { lsWrite(); return Promise.resolve(); }
        return post({ op: 'delete', key: key }).then(pull);
      }
    };
  }
  function collection(name) {
    var q = {
      orderBy: function () { return q; },
      limit: function () { return q; },
      onSnapshot: function (next) {
        var list = name === 'inputlog' ? subs.log : subs.inputs;
        list.push(next);
        if (mode !== 'pending') emit();
        return function () { var i = list.indexOf(next); if (i >= 0) list.splice(i, 1); };
      },
      add: function (data) {
        var v = JSON.parse(JSON.stringify(data));
        state.log.unshift(v); emit();
        if (mode === 'local') { lsWrite(); return Promise.resolve(); }
        return post({ op: 'log', data: v }).then(pull);
      },
      doc: function (id) { return docRef(name + '/' + id); }
    };
    return q;
  }
  var db = { collection: collection, doc: docRef };

  // ---------- 파일 저장 ----------
  var downloads = {
    save: function (req) {
      return new Promise(function (resolve) {
        var blob = req.data instanceof Blob ? req.data : new Blob([req.data], { type: /\.html$/.test(req.filename) ? 'text/html;charset=utf-8' : /\.txt$/.test(req.filename) ? 'text/plain;charset=utf-8' : 'application/octet-stream' });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = req.filename; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        resolve({ status: 'saved' });
      });
    }
  };
  var user = { canEdit: function () { return Promise.resolve(true); }, isOwner: function () { return Promise.resolve(true); } };

  window.claude = {
    use: function (name) {
      if (name === 'db') return ready.then(function () { return db; });
      if (name === 'downloads') return Promise.resolve(downloads);
      if (name === 'user') return Promise.resolve(user);
      return Promise.resolve(null);
    }
  };
  window.DASH_STORE = {
    mode: function () { return mode; },
    onMode: function (f) { modeListeners.push(f); if (mode !== 'pending') f(mode); },
    refresh: pull
  };
})();
