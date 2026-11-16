/* Cintserの宅记 —— 页面逻辑 */
(function () {
  'use strict';
  var LS_KEY = 'anime-lib/v2';
  /* 网站版本号，编辑模式下显示在标题右侧 */
  var APP_VERSION = 'v1.0 · 2026.11.16';
  var Lib = window.Lib;

  /* ================= 存储 ================= */
  var Store = {
    data: null,
    source: '',
    /* 取时间戳，用于判断哪份数据更新 */
    stamp: function (d) {
      var t = d && d.meta && d.meta.updatedAt;
      var v = Date.parse(t || '');
      return isNaN(v) ? 0 : v;
    },
    /* 候选数据比本地缓存新就用候选，否则保留本地（本地才有未导出的编辑） */
    pick: function (cand, src, cb) {
      var local = null;
      try { local = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { }

      if (!cand) {
        if (local) { this.data = local; this.source = 'local'; }
        else { this.source = 'empty'; }
        return cb(null);
      }
      if (local && this.stamp(local) >= this.stamp(cand)) {
        this.data = local; this.source = 'local';
        return cb(null);
      }
      this.data = cand; this.source = src;
      try { localStorage.setItem(LS_KEY, JSON.stringify(cand)); } catch (e) { }
      cb(null);
    },
    load: function (cb) {
      var self = this;
      fetch('data.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (d) { self.pick(d, 'json', cb); })
        .catch(function () {
          /* file:// 下只能靠内置快照，同样要比时间戳，否则缓存永远压着新数据 */
          if (window.__LIB_SEED__) { return self.pick(window.__LIB_SEED__, 'seed', cb); }
          var s = document.createElement('script');
          s.src = 'data.js';
          s.onload = function () { self.pick(window.__LIB_SEED__ || null, 'seed', cb); };
          s.onerror = function () { self.pick(null, 'empty', cb); };
          document.head.appendChild(s);
        });
    },
    save: function () {
      try {
        this.data.meta.updatedAt = new Date().toISOString();
        localStorage.setItem(LS_KEY, JSON.stringify(this.data));
      } catch (e) { }
    },
    get: function (id) {
      var items = (this.data && this.data.items) || [];
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
      return null;
    },
    update: function (id, patch) {
      var it = this.get(id);
      if (!it) return null;
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) it[k] = patch[k];
      it.lastModified = new Date().toISOString();
      this.save();
      return it;
    }
  };

  /* ================= 编辑模式（键盘 a b a b c 切换） ================= */
  var EditMode = {
    on: false,
    seq: [],
    CODE: ['a', 'b', 'a', 'b', 'c'],
    init: function () {
      try { this.on = localStorage.getItem('anime-lib/edit') === '1'; } catch (e) { }
      var self = this;

      /* Esc 随时可退出，哪怕光标正停在输入框里 */
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && self.on) { self.toggle(); return; }
        var t = e.target;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var k = String(e.key || '').toLowerCase();
        if (!/^[a-z]$/.test(k)) return;
        self.seq.push(k);
        if (self.seq.length > self.CODE.length) self.seq.shift();
        if (self.seq.join('') === self.CODE.join('')) { self.seq = []; self.toggle(); }
      });

      /* 点右上角的标记也能退出 */
      var pill = document.getElementById('editpill');
      if (pill) {
        pill.style.cursor = 'pointer';
        pill.title = '点击退出编辑模式（或按 Esc）';
        pill.onclick = function () { if (self.on) self.toggle(); };
      }

      this.apply();
    },
    toggle: function () {
      this.on = !this.on;
      try { localStorage.setItem('anime-lib/edit', this.on ? '1' : '0'); } catch (e) { }
      this.apply();
      toast(this.on ? '编辑模式已开启' : '编辑模式已关闭');
      if (document.getElementById('detail')) {
        var m = (location.hash || '').match(/#anime\/([A-Za-z0-9_-]+)/);
        var it = m ? Store.get(m[1]) : null;
        if (it) renderDetail(it);
      }
    },
    apply: function () {
      document.body.classList.toggle('edit-on', this.on);
    }
  };

  /* ================= 工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }
  function fmtDate(d) {
    if (!d) return '';
    return String(d).replace(/-/g, '/').replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2}).*$/, '$1.$2.$3');
  }
  function yearOf(it) {
    var d = (it.meta && it.meta.date) || '';
    var m = String(d).match(/^(\d{4})/);
    return m ? m[1] : '';
  }
  function watchTime(it) { return it.watchEnd || it.watchStart || ''; }
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  window.animeImgFail = function (img) {
    if (img.dataset.step !== '1' && img.dataset.remote) {
      img.dataset.step = '1'; img.src = img.dataset.remote; return;
    }
    img.style.display = 'none';
    var ph = img.parentNode.querySelector('.ph');
    if (ph) ph.style.display = 'flex';
  };

  /* ================= 常量 ================= */
  var AREA_LABEL = { tv: 'TV番组', movie: '剧场番组', galgame: 'Galgame' };
  var AREA_ORDER = ['tv', 'movie'];
  var GENRE_ORDER = ['原创', '漫画改', '小说改', '游戏改', '异世界', '特摄', '热血', '穿越',
    '奇幻', '战斗', '搞笑', '日常', '科幻', '治愈', '校园', '泡面', '恋爱', '后宫',
    '少女', '百合', '魔法', '冒险', '历史', '架空', '机战', '运动', '励志', '音乐',
    '推理', '社团', '智斗', '催泪', '美食', '偶像', '乙女', '职场'];
  var SORTS = [['default', '默认'], ['time', '观看时间'], ['name', '名称']];

  /* 两个板块：番剧 / Galgame，各自一套状态用词 */
  var TABS = [['anime', '番剧'], ['galgame', 'Galgame']];
  var STATUS_LABEL = {
    anime: { watching: '在看', planned: '想看', done: '看过' },
    galgame: { watching: '在玩', planned: '想玩', done: '玩过' }
  };
  var STATUS_ORDER = ['watching', 'planned', 'done'];

  var state = {
    q: '', tab: 'anime', sort: 'default',
    /* 筛选一律多选：空数组 = 不限 */
    statusBy: { anime: [], galgame: [] },
    area: [], genre: [], year: [],
    expandGenre: false, expandYear: false
  };
  function curStatus() { return state.statusBy[state.tab] || []; }
  function has(a, v) { return a.indexOf(v) >= 0; }
  function toggleIn(a, v) {
    var i = a.indexOf(v);
    if (i >= 0) a.splice(i, 1); else a.push(v);
  }

  /* 番剧板块的题材 / 年份选项由数据推导 */
  function allGenres() {
    var s = {};
    (Store.data.items || []).forEach(function (it) {
      if (tabOf(it) !== 'anime') return;
      (it.genres || []).forEach(function (g) { s[g] = (s[g] || 0) + 1; });
    });
    var ordered = GENRE_ORDER.filter(function (g) { return s[g]; });
    Object.keys(s).forEach(function (g) { if (ordered.indexOf(g) < 0) ordered.push(g); });
    return ordered;
  }
  function allYears() {
    var s = {};
    (Store.data.items || []).forEach(function (it) {
      if (tabOf(it) !== 'anime') return;
      var y = yearOf(it); if (y) s[y] = 1;
    });
    return Object.keys(s).sort().reverse();
  }

  function tabOf(it) { return it.type === 'galgame' ? 'galgame' : 'anime'; }
  function statusLabel(it) {
    var m = STATUS_LABEL[tabOf(it)];
    return m[it.status] || '';
  }

  /* ================= 筛选栏 ================= */
  function sortLabel(k) {
    if (k === 'default') return '默认';
    if (k === 'time') return state.tab === 'galgame' ? '游玩时间' : '观看时间';
    if (k === 'name') return '名称';
    return k;
  }

  function chip(label, on, attrs) {
    return '<button class="fchip' + (on ? ' on' : '') + '" ' + attrs + '>' + esc(label) + '</button>';
  }

  function renderTabs() {
    var box = document.getElementById('tabs');
    if (!box) return;
    var html = '';
    TABS.forEach(function (t) {
      var n = (Store.data.items || []).filter(function (it) { return tabOf(it) === t[0]; }).length;
      html += '<button class="tab' + (state.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' +
        esc(t[1]) + '<span class="tabn">' + n + '</span></button>';
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () {
        if (state.tab === b.dataset.tab) return;
        state.tab = b.dataset.tab;
        renderTabs(); renderFilters(); renderStats(); renderList(); renderSide();
      };
    });
  }

  function renderFilters() {
    var box = document.getElementById('filters');
    if (!box) return;
    var labels = STATUS_LABEL[state.tab];
    var html = '';

    /* 分区 / 题材 / 年份 只属于番剧板块 */
    if (state.tab === 'anime') {
      var areas = AREA_ORDER.filter(function (a) {
        return (Store.data.items || []).some(function (it) {
          return tabOf(it) === 'anime' && (it.area || 'tv') === a;
        });
      });
      html += '<div class="frow"><span class="flabel">分区</span><div class="fopts">';
      html += chip('全部', state.area.length === 0, 'data-area="__all"');
      areas.forEach(function (a) { html += chip(AREA_LABEL[a], has(state.area, a), 'data-area="' + a + '"'); });
      html += '</div></div>';

      var gs = allGenres(), LIMIT = 18;
      var showG = state.expandGenre ? gs : gs.slice(0, LIMIT);
      html += '<div class="frow"><span class="flabel">题材</span><div class="fopts">';
      html += chip('全部', state.genre.length === 0, 'data-genre="__all"');
      showG.forEach(function (g) { html += chip(g, has(state.genre, g), 'data-genre="' + esc(g) + '"'); });
      html += '</div>';
      if (gs.length > LIMIT) {
        html += '<button class="fmore" data-more="genre">' + (state.expandGenre ? '收起 ⌃' : '展开 ⌄') + '</button>';
      }
      html += '</div>';

      var ys = allYears(), YLIMIT = 9;
      var showY = state.expandYear ? ys : ys.slice(0, YLIMIT);
      html += '<div class="frow"><span class="flabel">年份</span><div class="fopts">';
      html += chip('全部', state.year.length === 0, 'data-year="__all"');
      showY.forEach(function (y) { html += chip(y, has(state.year, y), 'data-year="' + y + '"'); });
      html += '</div>';
      if (ys.length > YLIMIT) {
        html += '<button class="fmore" data-more="year">' + (state.expandYear ? '收起 ⌃' : '展开 ⌄') + '</button>';
      }
      html += '</div>';
    }

    /* 状态：两个板块各用一套词，可多选 */
    var st = curStatus();
    html += '<div class="frow"><span class="flabel">状态</span><div class="fopts">';
    html += chip('不限', st.length === 0, 'data-status="__all"');
    STATUS_ORDER.forEach(function (k) {
      html += chip(labels[k], has(st, k), 'data-status="' + k + '"');
    });
    html += '</div></div>';

    html += '<div class="frow"><span class="flabel">排序</span><div class="fopts">';
    SORTS.forEach(function (p) {
      html += chip(sortLabel(p[0]), state.sort === p[0], 'data-sort="' + p[0] + '"');
    });
    html += '</div></div>';

    box.innerHTML = html;

    box.querySelectorAll('[data-area]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.area === '__all') state.area = [];
        else toggleIn(state.area, b.dataset.area);
        renderFilters(); renderList();
      };
    });
    box.querySelectorAll('[data-genre]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.genre === '__all') state.genre = [];
        else toggleIn(state.genre, b.dataset.genre);
        renderFilters(); renderList();
      };
    });
    box.querySelectorAll('[data-year]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.year === '__all') state.year = [];
        else toggleIn(state.year, b.dataset.year);
        renderFilters(); renderList();
      };
    });
    box.querySelectorAll('[data-status]').forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.status;
        if (v === '__all') state.statusBy[state.tab] = [];
        else toggleIn(state.statusBy[state.tab], v);
        renderFilters(); renderList();
      };
    });
    box.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () { state.sort = b.dataset.sort; renderFilters(); renderList(); };
    });
    box.querySelectorAll('[data-more]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.more === 'genre') state.expandGenre = !state.expandGenre;
        else state.expandYear = !state.expandYear;
        renderFilters();
      };
    });
  }

  /* ================= 卡片 ================= */
  function posterHtml(it, showBadge, showProg) {
    var src = it.coverLocal ? it.coverLocal : (it.cover || '');
    var remote = it.cover || '';
    var badge = '';
    if (showBadge) {
      badge = '<span class="badge ' + it.status + '">' + statusLabel(it) + '</span>';
    }
    var bar = '';
    if (showProg && it.progress && it.progress.current != null && it.meta && it.meta.eps) {
      var pct = Math.min(100, Math.round(it.progress.current / it.meta.eps * 100));
      bar = '<div class="progbar"><i style="width:' + pct + '%"></i></div>';
    }
    var img = src
      ? '<img src="' + esc(src) + '" alt="" loading="lazy" data-step="0" data-remote="' + esc(remote) + '" onerror="animeImgFail(this)">'
      : '';
    return '<div class="poster">' + img +
      '<div class="ph" style="display:' + (src ? 'none' : 'flex') + '">' + esc(it.title) + '</div>' +
      badge + bar + '</div>';
  }

  function cardHtml(it) {
    var sub = [];
    var y = yearOf(it);
    if (y) sub.push(y);
    if (it.type === 'galgame') {
      if (it.meta && it.meta.hours) sub.push('约 ' + it.meta.hours + ' 小时');
    } else if (it.meta && it.meta.eps) {
      sub.push(it.meta.eps + '话');
    }
    if (it.progress && it.progress.current != null) sub.push('看到 ' + it.progress.current);
    else if (it.progress && it.progress.state === 'unknown') sub.push('进度未知');
    if (it.type !== 'galgame' && !it.bgmId) sub.push('待补全');
    var subHtml = sub.map(esc).join('<span class="sep">·</span>');
    return '<a class="card" href="detail.html#anime/' + esc(it.id) + '">' +
      posterHtml(it, it.status !== 'done', it.status === 'watching') +
      '<div class="card-title">' + esc(it.title) +
      (it.rewatch ? ' <span class="re">重审</span>' : '') + '</div>' +
      (subHtml ? '<div class="card-sub">' + subHtml + '</div>' : '') +
      '</a>';
  }

  /* ================= 过滤与排序 ================= */
  function matchQ(it) {
    if (!state.q) return true;
    var q = state.q.toLowerCase().trim();
    var hay = [it.title, it.titleCn, it.titleJp, it.note, it.comment, (it.genres || []).join(' ')].join(' ').toLowerCase();
    if (hay.indexOf(q) >= 0) return true;
    var py = '';
    var raw = String(it.title).replace(/[\s！!？?：:·・,，.。、"'"'（）()\[\]【】\-—―–_~/～＊*×]/g, '');
    for (var i = 0; i < raw.length && i < 14; i++) py += Lib.pinyinInitial(raw[i]).toLowerCase();
    return py.indexOf(q) === 0;
  }

  function pass(it) {
    if (tabOf(it) !== state.tab) return false;
    if (!matchQ(it)) return false;
    var st = curStatus();
    if (st.length && !has(st, it.status)) return false;
    if (state.tab === 'anime') {
      if (state.area.length && !has(state.area, it.area || 'tv')) return false;
      if (state.genre.length) {
        var gs = it.genres || [], hitG = false;
        for (var i = 0; i < state.genre.length; i++) {
          if (gs.indexOf(state.genre[i]) >= 0) { hitG = true; break; }
        }
        if (!hitG) return false;
      }
      if (state.year.length && !has(state.year, yearOf(it))) return false;
    }
    return true;
  }

  function sortItems(arr) {
    var a = arr.slice();
    var s = state.sort;
    if (s === 'time') {
      /* 只看登记过时间的，新的在前 */
      a = a.filter(function (x) { return !!watchTime(x); });
      a.sort(function (x, y) { return watchTime(x) < watchTime(y) ? 1 : -1; });
    } else if (s === 'name') {
      a.sort(function (x, y) { return String(x.title).localeCompare(String(y.title), 'zh-Hans-CN'); });
    } else {
      /* 默认：最近添加的在前 */
      a.sort(function (x, y) { return String(x.id) < String(y.id) ? 1 : -1; });
    }
    return a;
  }

  /* ================= 列表渲染 ================= */
  function renderList() {
    var root = document.getElementById('list');
    var labels = STATUS_LABEL[state.tab];
    var st = curStatus();
    var items = (Store.data.items || []).filter(pass);

    function grid(arr) { return '<div class="grid">' + arr.map(cardHtml).join('') + '</div>'; }
    function emptyBox(t, tip) {
      return '<div class="empty"><b>' + esc(t) + '</b>' + esc(tip || '') + '</div>';
    }

    /* 按时间排序时若一条都没登记时间，单独提示，避免误以为数据丢了 */
    if (state.sort === 'time' && !items.some(function (x) { return !!watchTime(x); })) {
      root.innerHTML = emptyBox(
        '还没有登记' + (state.tab === 'galgame' ? '游玩' : '观看') + '时间的条目',
        '按时间排序只列出登记过时间的记录。进详情页点一下「' +
        (state.tab === 'galgame' ? '开始玩' : '开始看') + '」就能补上。'
      );
      return;
    }

    /* 不限 或 只选了一个状态：不分组、不写标题，直接平铺 */
    if (st.length < 2) {
      var flat = sortItems(items);
      root.innerHTML = flat.length ? grid(flat) : emptyBox('这里还没有条目');
      return;
    }

    /* 多选：按状态分段显示 */
    var html = '';
    STATUS_ORDER.forEach(function (k) {
      if (!has(st, k)) return;
      var arr = sortItems(items.filter(function (i) { return i.status === k; }));
      if (!arr.length) return;
      html += '<section class="section"><div class="section-head">' +
        '<h2><span class="dot ' + k + '"></span>' + esc(labels[k]) + '</h2>' +
        '<span class="count">' + arr.length + '</span></div>' + grid(arr) + '</section>';
    });
    root.innerHTML = html || emptyBox('这里还没有条目');
  }

  function renderStats() {
    var box = document.getElementById('stats');
    if (!box) return;
    var labels = STATUS_LABEL[state.tab];
    var c = { watching: 0, planned: 0, done: 0 };
    (Store.data.items || []).forEach(function (it) {
      if (tabOf(it) !== state.tab) return;
      c[it.status] = (c[it.status] || 0) + 1;
    });
    box.innerHTML = ['done', 'watching', 'planned'].map(function (k) {
      return '<span>' + esc(labels[k]) + ' <b>' + c[k] + '</b></span>';
    }).join('');
  }

  /* ================= 右侧边栏 ================= */
  function renderSide() {
    var box = document.getElementById('side');
    if (!box) return;
    var items = (Store.data.items || []).filter(function (it) { return tabOf(it) === state.tab; });
    var isGal = state.tab === 'galgame';

    /* 最近添加：按 addedAt 倒序，同一时间再按 id 倒序 */
    var recent = items.slice().sort(function (a, b) {
      var ta = Date.parse(a.addedAt || '') || 0;
      var tb = Date.parse(b.addedAt || '') || 0;
      if (ta !== tb) return tb - ta;
      return String(a.id) < String(b.id) ? 1 : -1;
    }).slice(0, 6);

    /* 最近评论：按最后修改时间倒序 */
    var commented = items.filter(function (it) {
      return it.comment && String(it.comment).trim();
    }).sort(function (a, b) {
      return String(a.lastModified || '') < String(b.lastModified || '') ? 1 : -1;
    }).slice(0, 5);

    /* 题材分布（只番剧有题材数据） */
    var gcount = {};
    items.forEach(function (it) {
      (it.genres || []).forEach(function (g) { gcount[g] = (gcount[g] || 0) + 1; });
    });
    var topG = Object.keys(gcount).sort(function (a, b) { return gcount[b] - gcount[a]; }).slice(0, 8);
    var gmax = topG.length ? gcount[topG[0]] : 1;

    var html = '';

    html += '<div class="sideblock"><h3>最近添加</h3>';
    if (!recent.length) html += '<div class="sempty">还没有条目</div>';
    recent.forEach(function (it) {
      html += '<a class="srow" href="detail.html#anime/' + esc(it.id) + '">' +
        '<span class="stag ' + it.status + '">' + esc(statusLabel(it)) + '</span>' +
        '<span class="stitle">' + esc(it.title) + '</span></a>';
    });
    html += '</div>';

    html += '<div class="sideblock"><h3>最近评论</h3>';
    if (!commented.length) {
      html += '<div class="sempty">还没有写过评论</div>';
    }
    commented.forEach(function (it) {
      var c = String(it.comment).replace(/\s+/g, ' ').trim();
      if (c.length > 46) c = c.slice(0, 46) + '…';
      html += '<a class="srow scol" href="detail.html#anime/' + esc(it.id) + '">' +
        '<span class="stitle">' + esc(it.title) + '</span>' +
        '<span class="sexcerpt">' + esc(c) + '</span></a>';
    });
    html += '</div>';

    if (topG.length) {
      html += '<div class="sideblock"><h3>题材分布</h3><div class="sbars">';
      topG.forEach(function (g) {
        var w = Math.max(6, Math.round(gcount[g] / gmax * 100));
        html += '<div class="sbar"><span class="sbname">' + esc(g) + '</span>' +
          '<span class="sbtrack"><i style="width:' + w + '%"></i></span>' +
          '<span class="sbnum">' + gcount[g] + '</span></div>';
      });
      html += '</div></div>';
    }

    box.innerHTML = html;
  }

  /* ================= 导入 / 导出 ================= */
  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var incoming = null;
      try {
        if (/\.json$/i.test(file.name)) {
          var j = JSON.parse(text);
          incoming = (j.items || j).map(function (it) {
            return {
              title: it.title, note: it.note || '', status: it.status || 'planned',
              letter: it.letter || '', progress: it.progress || { current: null, total: null, state: 'none' },
              rewatch: !!it.rewatch, comment: it.comment || '', bgmId: it.bgmId || null,
              type: it.type || 'anime', remote: it.remote || null,
              coverLocal: it.coverLocal || '', cover: it.cover || '',
              watchStart: it.watchStart || '', watchEnd: it.watchEnd || '', addedAt: it.addedAt || '',
              genres: it.genres || [], area: it.area || 'tv', meta: it.meta || null
            };
          });
        } else {
          incoming = Lib.parseText(text).items;
        }
      } catch (e) { toast('文件解析失败：' + e.message); return; }
      if (!incoming || !incoming.length) { toast('没读到任何条目'); return; }

      var before = Store.data.items.length;
      var res = Lib.mergeLibraries(Store.data.items, incoming);
      Store.data.items = res.items;
      Store.data.items.forEach(function (it) {
        if (!it.letter) it.letter = Lib.pinyinInitial(it.title);
        if (!it.id) it.id = 'x' + Math.random().toString(36).slice(2, 8);
        if (!it.progress) it.progress = { current: null, total: null, state: 'none' };
        if (!it.type) it.type = 'anime';
        if (!it.area) it.area = 'tv';
        if (!it.genres) it.genres = [];
        if (!it.meta) it.meta = { date: '', eps: 0, platform: '', score: null, tags: [], summary: '' };
        if (!it.addedAt) it.addedAt = new Date().toISOString();
      });
      Store.save();
      renderStats(); renderTabs(); renderFilters(); renderList(); renderSide();
      toast('合并完成：新增 ' + (Store.data.items.length - before) + ' 条，当前共 ' + Store.data.items.length + ' 条');
    };
    reader.readAsText(file, 'utf-8');
  }

  function exportJson() {
    Store.data.meta.count = Store.data.items.length;
    download('data.json', JSON.stringify(Store.data, null, 1), 'application/json');
    Store.data.meta.lastExport = { at: new Date().toISOString(), snapshot: Lib.snapshot(Store.data.items) };
    Store.save();
    toast('已导出 data.json —— 用它覆盖文件夹里的同名文件');
  }

  function exportNote() {
    var txt = Lib.serializeText(Store.data);
    download('Cintserの宅记.txt', txt, 'text/plain');
    Store.data.meta.lastExport = { at: new Date().toISOString(), snapshot: Lib.snapshot(Store.data.items) };
    Store.save();
    toast('已导出笔记：' + Store.data.items.length + ' 条');
  }

  /* ================= 列表页初始化 ================= */
  function initIndex() {
    Store.load(function () {
      if (Store.source === 'empty') {
        var bn = document.getElementById('banner');
        bn.classList.remove('hide');
        bn.innerHTML = '<span>没有数据。拖入 <b>data.json</b> 开始。</span>';
        document.getElementById('list').innerHTML =
          '<div class="empty"><b>先导入数据</b>把 data.json 拖到窗口里，或点右上角「导入」。</div>';
        bindDrop();
        return;
      }
      if (Store.source === 'seed') {
        var stamp = Store.data.meta.updatedAt || '';
        var dismissed = '';
        try { dismissed = localStorage.getItem('anime-lib/seed-dismissed') || ''; } catch (e) { }
        if (dismissed !== stamp) {
          var b2 = document.getElementById('banner');
          var d0 = new Date(Store.data.meta.updatedAt || Date.now());
          var ds = isNaN(d0) ? '' : d0.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
          b2.classList.remove('hide');
          b2.innerHTML = '<span>当前显示的是内置初始快照（' + esc(ds) +
            '）。如果你在外面更新过 data.json，请点「导入」选择它后再编辑。</span>' +
            '<button class="btn" id="banner-x">知道了</button>';
          var x = document.getElementById('banner-x');
          if (x) x.onclick = function () {
            b2.classList.add('hide');
            try { localStorage.setItem('anime-lib/seed-dismissed', stamp); } catch (e) { }
          };
        }
      }
      renderStats(); renderTabs(); renderFilters(); renderList(); renderSide(); bindDrop();
    });

    var si = document.getElementById('search');
    si.addEventListener('input', function () { state.q = si.value; renderList(); });

    var fi = document.getElementById('file');
    fi.addEventListener('change', function () { if (fi.files[0]) doImport(fi.files[0]); fi.value = ''; });
    document.getElementById('btn-import').onclick = function () { fi.click(); };
    document.getElementById('btn-json').onclick = exportJson;
    document.getElementById('btn-note').onclick = exportNote;
  }

  function bindDrop() {
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) doImport(e.dataTransfer.files[0]);
    });
  }

  /* ================= 详情页 ================= */
  function initDetail() {
    Store.load(function () {
      function route() {
        var m = (location.hash || '').match(/#anime\/([A-Za-z0-9_-]+)/);
        var it = m ? Store.get(m[1]) : null;
        if (!it) {
          document.getElementById('detail').innerHTML =
            '<div class="empty"><b>没找到这条记录</b><a href="index.html" class="link">回列表</a></div>';
          return;
        }
        renderDetail(it);
      }
      window.addEventListener('hashchange', route);
      route();
    });
  }

  function renderDetail(it) {
    document.title = it.title + ' · Cintserの宅记';
    var m = it.meta || {};
    var st = it.status;
    var eps = m.eps || 0;
    var pg = it.progress || {};
    var editing = EditMode.on;
    var isGal = it.type === 'galgame';

    var pgText = pg.current != null ? (pg.current + (eps ? ' / ' + eps : '') + ' 话')
      : (pg.state === 'unknown' ? '进度未知' : '未记录');

    var tags = (m.tags || []).slice(0, 12).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    var genreTags = (it.genres || []).map(function (g) { return '<span class="tag">' + esc(g) + '</span>'; }).join('');

    var links = [];
    if (it.bgmId) links.push('<a class="extlink" href="https://bgm.tv/subject/' + esc(it.bgmId) + '" target="_blank" rel="noopener">Bangumi</a>');
    if (it.vndbId) links.push('<a class="extlink" href="https://vndb.org/' + esc(it.vndbId) + '" target="_blank" rel="noopener">VNDB</a>');
    if (it.ymgalId) links.push('<a class="extlink" href="https://www.ymgal.games/ga' + esc(it.ymgalId) + '" target="_blank" rel="noopener">月幕</a>');
    if (it.dlsite) links.push('<a class="extlink" href="' + esc(it.dlsite) + '" target="_blank" rel="noopener">DLsite</a>');
    var linkHtml = links.length ? links.join('<span class="linksep">·</span>') : '<span class="muted">未匹配到条目</span>';

    var sideSummary = m.summary
      ? '<div class="block side-block"><h3>简介</h3><div class="summary tight">' + esc(m.summary) + '</div></div>'
      : '';

    var commentBlock = editing
      ? '<div class="block"><h3>评论</h3>' +
      '<textarea class="comment" id="comment" placeholder="看完想说点什么…">' + esc(it.comment || '') + '</textarea>' +
      '<div class="save-hint" id="hint"></div></div>'
      : '<div class="block"><h3>评论</h3>' +
      (it.comment
        ? '<div class="summary comment-view">' + esc(it.comment) + '</div>'
        : '<div class="summary nothing">暂无评论</div>') + '</div>';

    var html =
      '<div class="detail">' +
      '<div class="side">' + posterHtml(it, false, false) + sideSummary + '</div>' +
      '<div class="main">' +
      '<h1>' + esc(it.title) + (it.rewatch ? ' <span class="re">重审</span>' : '') + '</h1>' +
      (it.titleCn && it.titleCn !== it.title ? '<div class="jp">' + esc(it.titleCn) + '</div>' : '') +
      (it.titleJp ? '<div class="jp">' + esc(it.titleJp) + '</div>' : '') +
      '<div class="tagrow">' +
      (editing
        ? '<span class="stpick">' + STATUS_ORDER.map(function (k) {
          return '<button class="stbtn' + (st === k ? ' on' : '') + '" data-setstatus="' + k + '">' +
            esc(STATUS_LABEL[tabOf(it)][k]) + '</button>';
        }).join('') + '</span>'
        : '<span class="tag status ' + st + '">' + statusLabel(it) + '</span>') +
      (isGal ? '<span class="tag">Galgame</span>' : '<span class="tag">' + esc(AREA_LABEL[it.area || 'tv']) + '</span>') +
      (m.platform && !isGal ? '<span class="tag">' + esc(m.platform) + '</span>' : '') +
      '</div>' +

      '<dl class="facts">' +
      factRow(isGal ? '发售日' : '放送开始', m.date ? esc(fmtDate(m.date)) : '<span class="muted">—</span>') +
      (isGal
        ? factRow('游戏时长', m.hours ? esc('约 ' + m.hours + ' 小时') : '<span class="muted">—</span>')
        : factRow('话数', eps ? esc(eps + ' 话') : '<span class="muted">—</span>')) +
      (isGal && m.developer ? factRow('开发厂商', esc(m.developer)) : '') +
      factRow('我的进度', editing ? editableProgress(it, pgText) : esc(pgText)) +
      factRow(isGal ? '开始玩' : '开始看', editing ? editableDate(it, 'watchStart') : dateText(it.watchStart)) +
      factRow(isGal ? '通关于' : '看完于', editing ? editableDate(it, 'watchEnd') : dateText(it.watchEnd)) +
      factRow('来源', linkHtml) +
      (m.score != null ? factRow('评分', '<span class="score">' + esc(m.score) + '</span>' +
        '<small class="muted" style="margin-left:8px">' +
        (m.rank ? '#' + m.rank + ' · ' : '') + (m.votes || 0) + ' 人</small>') : '') +
      '</dl>' +

      (it.note ? '<div class="block"><h3>原笔记备注</h3><div class="summary">' + esc(it.note) + '</div></div>' : '') +

      commentBlock +

      (genreTags ? '<div class="block"><h3>题材</h3><div class="tagrow">' + genreTags + '</div></div>' : '') +
      (tags ? '<div class="block"><h3>标签</h3><div class="tagrow">' + tags + '</div></div>' : '') +
      '</div></div>';

    document.getElementById('detail').innerHTML = html;

    if (!editing) return;

    /* 状态切换：点哪个人物就改成哪个状态 */
    document.querySelectorAll('[data-setstatus]').forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.setstatus;
        if (v === it.status) return;
        Store.update(it.id, { status: v });
        var cur = Store.get(it.id);
        renderDetail(cur);
        toast('已改为「' + statusLabel(cur) + '」');
      };
    });

    var ta = document.getElementById('comment');
    var hint = document.getElementById('hint');
    if (ta) {
      var tid = null;
      ta.addEventListener('input', function () {
        clearTimeout(tid);
        hint.textContent = '正在保存…';
        tid = setTimeout(function () {
          Store.update(it.id, { comment: ta.value });
          hint.textContent = '已保存 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }, 500);
      });
    }

    document.querySelectorAll('.editable[data-field]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (el.querySelector('input')) return;
        var field = el.dataset.field;
        var inp = document.createElement('input');
        inp.type = 'date';
        inp.value = it[field] || '';
        el.innerHTML = '';
        el.appendChild(inp);
        inp.focus();
        if (inp.showPicker) { try { inp.showPicker(); } catch (e) { } }
        function commit() {
          var v = inp.value;
          var o = {}; o[field] = v;
          Store.update(it.id, o);
          renderDetail(Store.get(it.id));
          toast(v ? (isGal ? '已更新游玩时间' : '已更新观看时间') : '已清空');
        }
        inp.addEventListener('change', commit);
        inp.addEventListener('blur', function () {
          setTimeout(function () { if (document.body.contains(inp)) commit(); }, 180);
        });
      });
    });

    var pe = document.querySelector('.editable[data-progress]');
    if (pe) {
      pe.addEventListener('click', function () {
        if (pe.querySelector('input')) return;
        var inp = document.createElement('input');
        inp.type = 'number'; inp.min = 0; inp.max = 9999;
        inp.value = (it.progress && it.progress.current != null) ? it.progress.current : '';
        inp.style.maxWidth = '90px';
        pe.innerHTML = '';
        pe.appendChild(inp);
        inp.focus(); inp.select();
        function commit() {
          var v = inp.value === '' ? null : parseInt(inp.value, 10);
          Store.update(it.id, {
            progress: {
              current: v,
              total: (it.meta && it.meta.eps) || (it.progress && it.progress.total) || null,
              state: v == null ? 'none' : 'watching'
            }
          });
          renderDetail(Store.get(it.id));
        }
        inp.addEventListener('change', commit);
        inp.addEventListener('blur', function () {
          setTimeout(function () { if (document.body.contains(inp)) commit(); }, 180);
        });
      });
    }
  }

  function factRow(k, v) {
    return '<div class="fact"><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>';
  }
  function dateText(v) {
    return v ? esc(fmtDate(v)) : '<span class="muted">—</span>';
  }
  function editableDate(it, field) {
    var v = it[field];
    return '<span class="editable' + (v ? '' : ' empty-val') + '" data-field="' + field + '">' +
      (v ? esc(fmtDate(v)) : '点这里填写') + '<span class="pencil">✎</span></span>';
  }
  function editableProgress(it, pgText) {
    return '<span class="editable" data-progress="1">' + esc(pgText) + '<span class="pencil">✎</span></span>';
  }

  /* ================= 启动 ================= */
  document.addEventListener('DOMContentLoaded', function () {
    EditMode.init();
    var ve = document.getElementById('ver');
    if (ve) ve.textContent = APP_VERSION;
    if (document.getElementById('list')) initIndex();
    else if (document.getElementById('detail')) initDetail();
  });

  window.__Store = Store;
  window.__Edit = EditMode;
})();
