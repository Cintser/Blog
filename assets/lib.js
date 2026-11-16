/* 番剧库 —— 共享逻辑层：文本解析、序列化、合并、拼音首字母
   同时供浏览器 (window.Lib) 与 Node (module.exports) 使用 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Lib = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUS_RANK = { planned: 1, watching: 2, done: 3 };
  var ZONE_LABEL = { watching: '在看', planned: '想看', done: '看过' };

  /* ---------- 中文数字 ---------- */
  var CNC = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  function cnNum(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '十') n = (n || 1) * 10;
      else if (ch in CNC) n += CNC[ch];
      else return null;
    }
    return n || null;
  }

  /* ---------- 拼音首字母（按 zh-Hans-CN 排序边界二分） ---------- */
  var BOUNDS = '阿八嚓哒妸发旮哈讥咔垃妈拿噢妑七呥仨他哇夕丫匝';
  var LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ';
  var collator = null;
  try { collator = new Intl.Collator('zh-Hans-CN'); } catch (e) { }
  function pinyinInitial(str) {
    if (!str) return '#';
    var ch = String(str).replace(/[\s！!？?：:·・,，.。、"'"'（）()\[\]【】\-—―–_~/～＊*×]/g, '')[0];
    if (!ch) return '#';
    if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
    if (/\d/.test(ch)) return '#';
    if (!collator) return '#';
    var lo = 0, hi = BOUNDS.length - 1, ans = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (collator.compare(BOUNDS[mid], ch) <= 0) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return LETTERS[ans] || '#';
  }

  /* ---------- 标题归一化（用于判重，不用于匹配元数据） ---------- */
  function normKey(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/[！!？?：:·・,，.。、"'"'（）()\[\]【】\-—―–_~/～＊*×＋+]/g, '')
      .replace(/\s+/g, '');
  }

  /* ---------- 解析：兼容 v1（原始笔记）与 v2 ---------- */
  var ZONES = [[/正在看|在看|追番/, 'watching'], [/准备看|想看|待看/, 'planned'], [/看过的|看过|已看|看完/, 'done']];

  function detectZone(line) {
    if (!/^[—\-–=＝]{2,}.*[—\-–=＝]{2,}$/.test(line)) return null;
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i][0].test(line)) return ZONES[i][1];
    return null;
  }

  function extractProgress(raw) {
    var s = raw, out = { current: null, total: null, state: 'none' };
    function take(re, fn) {
      var m = s.match(re);
      if (!m) return false;
      fn(m);
      s = s.slice(0, m.index).trim();
      return true;
    }
    if (!take(/[\s（(]*(\d+)\s*\/\s*(\d+)[\s）)]*$/, function (m) {
      out.current = +m[1]; out.total = +m[2]; out.state = 'watching';
    }) &&
      !take(/[\s（(]*第?\s*([\d一二三四五六七八九十两]+)\s*集\s*看完[\s）)]*$/, function (m) {
        out.current = cnNum(m[1]); out.state = 'finished';
      }) &&
      !take(/[\s（(]*(?:正在看|看到)?\s*第\s*([\d一二三四五六七八九十两]+)\s*集[\s）)]*$/, function (m) {
        out.current = cnNum(m[1]); out.state = 'watching';
      }) &&
      !take(/[\s（(]*进度未知[\s）)]*$/, function () { out.state = 'unknown'; }) &&
      !take(/[\s（(]*(\d+)\s*[~～][\s）)]*$/, function (m) {
        out.current = +m[1]; out.state = 'watching';
      }) &&
      !take(/\s+(\d{1,4})\s*$/, function (m) {
        out.current = +m[1]; out.state = 'watching';
      })) { }
    return { rest: s, current: out.current, total: out.total, state: out.state };
  }

  function parseText(text) {
    var lines = String(text || '').split(/\r?\n/);
    var items = [], zone = null, letter = '';
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) continue;
      if (/^#/.test(t)) continue;
      var z = detectZone(t);
      if (z) { zone = z; letter = ''; continue; }
      var lm = t.match(/^[-—]\s*([A-Za-z*])\s*$/);
      if (lm) { letter = lm[1].toUpperCase(); continue; }
      if (/^##\s*/.test(t)) { letter = t.replace(/^##\s*/, '').trim().toUpperCase(); continue; }
      if (!zone) continue;

      var s = t.replace(/^[\-*•·\s]+/, '').replace(/[—_]+\s*$/, '').replace(/\s+/g, ' ').trim();
      if (!s) continue;

      var rewatch = false;
      if (/[（(\[]重审[）)\]]|\[重审\]/.test(s)) { rewatch = true; s = s.replace(/[（(\[]重审[）)\]]/g, '').trim(); }

      var notes = [];
      s = s.replace(/[（(]([^（()）]{1,60})[）)]/g, function (m, inner) { notes.push(inner.trim()); return ''; });

      var p = extractProgress(s);
      var title = p.rest.replace(/^[\-*•·\s]+/, '').replace(/[\s—\-_~～]+$/, '').trim();
      if (!title) continue;

      items.push({
        title: title,
        titleRaw: t,
        note: notes.join('；'),
        status: zone,
        letter: letter || '',
        progress: { current: p.current, total: p.total, state: p.state },
        rewatch: rewatch
      });
    }

    /* 同区同名去重，合并信息 */
    var seen = {}, out = [], dups = [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j], k = it.status + '|' + normKey(it.title);
      if (seen[k]) {
        var prev = seen[k];
        if (it.progress.current != null && (prev.progress.current == null || it.progress.current > prev.progress.current)) prev.progress = it.progress;
        if (it.note && prev.note.indexOf(it.note) < 0) prev.note = [prev.note, it.note].filter(Boolean).join('；');
        prev.rewatch = prev.rewatch || it.rewatch;
        dups.push(prev.title);
        continue;
      }
      seen[k] = it; out.push(it);
    }
    return { items: out, duplicatesRemoved: dups };
  }

  /* ---------- 序列化回 txt ---------- */
  function fmtProgress(it) {
    var p = it.progress || {};
    if (p.current != null && p.total) return p.current + '/' + p.total;
    if (p.current != null) return '第' + p.current + '集';
    if (p.state === 'unknown') return '进度未知';
    return '';
  }

  function serializeText(lib) {
    var L = [];
    L.push('# Cintserの宅记 · 笔记 v2');
    L.push('# 这份文件由网页导出，可以继续手写，改完在网页里「导入笔记」即可合并。');
    L.push('# 机器认得这些写法：');
    L.push('#   标题            只有名字');
    L.push('#   标题 5/26       看到第5集，共26集');
    L.push('#   标题 第5集       看到第5集（总集数未知）');
    L.push('#   标题 进度未知     记得看过但忘了看到哪');
    L.push('#   标题（备注）      括号里是备注');
    L.push('#   标题 [重审]      二刷');
    L.push('# 导出时间：' + new Date().toISOString());
    L.push('');

    var groups = { watching: [], planned: [], done: [] };
    (lib.items || []).forEach(function (it) { (groups[it.status] || groups.planned).push(it); });

    ['watching', 'planned', 'done'].forEach(function (st) {
      var arr = groups[st];
      L.push('——————————— ' + ZONE_LABEL[st] + ' ———————————');
      if (st === 'done') {
        var byLetter = {};
        arr.forEach(function (it) {
          var k = String(it.letter || pinyinInitial(it.title) || '*').toUpperCase();
          if (!/^[A-Z*]$/.test(k)) k = '*';
          (byLetter[k] = byLetter[k] || []).push(it);
        });
        Object.keys(byLetter).sort(function (a, b) { return a === '*' ? 1 : b === '*' ? -1 : a < b ? -1 : 1; }).forEach(function (k) {
          L.push('-' + k);
          byLetter[k].forEach(function (it) { L.push(line(it)); });
        });
      } else {
        arr.forEach(function (it) { L.push(line(it)); });
      }
      L.push('');
    });

    function line(it) {
      var s = it.title;
      var pr = fmtProgress(it);
      if (pr) s += '  ' + pr;
      if (it.rewatch) s += ' [重审]';
      if (it.note) s += '（' + it.note + '）';
      return s;
    }
    return L.join('\n');
  }

  /* ---------- 合并 ---------- */
  function snapshot(items) {
    return (items || []).map(function (it) {
      return normKey(it.title) + '|' + it.status + '|' + (it.progress && it.progress.current != null ? it.progress.current : '');
    });
  }

  function diffSnapshot(prev, items) {
    var now = snapshot(items);
    var prevSet = {}, nowSet = {};
    (prev || []).forEach(function (k) { prevSet[k] = 1; });
    now.forEach(function (k) { nowSet[k] = 1; });
    var added = now.filter(function (k) { return !prevSet[k]; });
    var removed = (prev || []).filter(function (k) { return !nowSet[k]; });
    return { added: added.length, removed: removed.length, changed: added.length + removed.length, same: now.length - added.length };
  }

  /**
   * incoming 覆盖 current 的增量部分：
   *  - 只在一侧存在 → 保留
   *  - 两侧都有 → 状态取更靠后的，进度取更大，备注/评论取有值的
   */
  function mergeLibraries(current, incoming) {
    var map = {}, order = [];
    /* 二刷是同名的另一条记录，必须并入键，否则会被折叠掉 */
    function keyOf(it) { return normKey(it.title) + (it.rewatch ? '#r' : ''); }
    function put(it) {
      var k = keyOf(it);
      if (!map[k]) { map[k] = Object.assign({}, it); map[k].progress = Object.assign({}, it.progress || {}); order.push(k); return; }
      var a = map[k];
      if ((STATUS_RANK[it.status] || 1) > (STATUS_RANK[a.status] || 1)) a.status = it.status;
      var ac = a.progress && a.progress.current, ic = it.progress && it.progress.current;
      if (ac == null && ic != null) a.progress = Object.assign({}, it.progress);
      else if (ac != null && ic != null && ic > ac) a.progress = Object.assign({}, it.progress);
      if (!a.note && it.note) a.note = it.note;
      if (!a.comment && it.comment) a.comment = it.comment;
      if (!a.bgmId && it.bgmId) { a.bgmId = it.bgmId; a.remote = it.remote; }
      if (!a.watchStart && it.watchStart) a.watchStart = it.watchStart;
      if (!a.watchEnd && it.watchEnd) a.watchEnd = it.watchEnd;
      if (!a.coverLocal && it.coverLocal) a.coverLocal = it.coverLocal;
      if (!a.letter && it.letter) a.letter = it.letter;
      if (!a.category && it.category) a.category = it.category;
      a.rewatch = a.rewatch || it.rewatch;
    }
    (current || []).forEach(put);
    var before = order.length;
    (incoming || []).forEach(put);
    var items = order.map(function (k) { return map[k]; });
    return { items: items, added: order.length - before };
  }

  return {
    STATUS_RANK: STATUS_RANK,
    ZONE_LABEL: ZONE_LABEL,
    cnNum: cnNum,
    pinyinInitial: pinyinInitial,
    normKey: normKey,
    parseText: parseText,
    serializeText: serializeText,
    snapshot: snapshot,
    diffSnapshot: diffSnapshot,
    mergeLibraries: mergeLibraries
  };
});
