/* ECO-MOBILE v1 · 基线脚本（作者：军哥懂保 / 微信 xunijiayuan）
   只做三件事：① 适配 viewport-fit ② 量出底部固定栏高度写入 --eco-bb
   ③ 识别 iframe 壳页 + 给首启弹窗补右上角关闭。不改任何业务逻辑。 */
(function () {
  var d = document, de = d.documentElement;
  if (!de) return;
  de.classList.add('eco-m');

  // ① viewport-fit=cover（只在缺的时候补，不覆盖已有 content）
  var m = d.querySelector('meta[name="viewport"]');
  if (m) {
    var c = m.getAttribute('content') || '';
    if (c.indexOf('viewport-fit') < 0 && c.indexOf('width=device-width') >= 0) {
      m.setAttribute('content', c + ',viewport-fit=cover');
    }
  }

  // ③ 壳页识别
  try {
    if (d.querySelector('.stage > iframe')) de.classList.add('eco-shell');
  } catch (e) {}

  // ② 底部固定栏 + 浮层实测
  function measureBottomBar() {
    var vh = window.innerHeight || de.clientHeight || 0, mx = 0;
    if (!d.body || !vh) return 0;
    var all = d.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id && /^eco|^ebBall|^ebPanel|^ecoPromote/.test(el.id)) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.height < 20 || r.height > 240 || r.width < 40) continue;
      var gap = vh - r.bottom;
      if (gap <= 2 && gap >= -2) { if (r.height > mx) mx = r.height; }
    }
    return Math.round(mx);
  }

  // 浮层（AI 球 / 推广条 / 气泡）会盖住内容，量出它们占的高度做底部预留
  function measureFloat() {
    var vh = window.innerHeight || de.clientHeight || 0, mx = 0;
    if (!vh) return 0;
    var sel = ['#ebBall', '.fab', '.eb-tip'];
    for (var i = 0; i < sel.length; i++) {
      var el = d.querySelector(sel[i]);
      if (!el) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.height < 10 || r.width < 10) continue;
      var topGap = vh - r.top;
      if (topGap > mx) mx = topGap;
    }
    return Math.round(mx);
  }

  // 推广悬浮按钮在 Shadow DOM 里，document.querySelector 看不到，单独取
  function promoFab() {
    var host = d.getElementById('ecoPromoteHost');
    if (!host || !host.shadowRoot) return null;
    return host.shadowRoot.querySelector('.fab');
  }

  function shown(el) {
    if (!el) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    var r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 10 && r.height > 10;
  }

  // 浮层的真实占位：本体 + 子孙（AI 球的文字标签会溢出 44px 圆外，只量圆本身会漏判）
  function unionBox(el) {
    var u = el.getBoundingClientRect();
    var l = u.left, t = u.top, r = u.right, b = u.bottom;
    var kids = el.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      var cs;
      try { cs = getComputedStyle(kids[i]); } catch (e) { continue; }
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var k = kids[i].getBoundingClientRect();
      if (k.width < 2 || k.height < 2) continue;
      l = Math.min(l, k.left); t = Math.min(t, k.top); r = Math.max(r, k.right); b = Math.max(b, k.bottom);
    }
    return {left: l, top: t, right: r, bottom: b, width: r - l, height: b - t};
  }

  // 同源 iframe 里的可点元素：壳页的底部 Tab 栏、主操作按钮都在内层文档，
  // 顶层 elementFromPoint 量不到，这里投射成顶层坐标再判重叠（跨层避让的关键）
  function foreignBoxes() {
    var out = [];
    var fs = d.querySelectorAll('iframe');
    var vh = window.innerHeight;
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], fr = f.getBoundingClientRect(), cd = null;
      if (fr.width < 2 || fr.height < 2) continue;
      try { cd = f.contentDocument; } catch (e) { cd = null; }
      if (!cd || !cd.body) continue;
      var win = cd.defaultView || window;
      var els = cd.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="tab"],' +
                                    '[onclick],[data-act],[class*="btn"],[class*="chip"],' +
                                    '[class*="status"],[class*="badge"],[class*="pill"],nav');
      for (var j = 0; j < els.length; j++) {
        var el = els[j], cs;
        try { cs = win.getComputedStyle(el); } catch (e) { continue; }
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
        var r = el.getBoundingClientRect();
        // 门槛和顶层一致（16×16）：理赔助手页的 ⚙ 只有 22×26，卡在 24 的旧门槛外
        // 被整批丢掉，球就会稳稳压在上面
        if (r.width < 16 || r.height < 16) continue;
        // 同理：内层整页容器（列表外壳 / 画布包装）不当按钮
        if (r.width > window.innerWidth * 0.8 && r.height > window.innerHeight * 0.6) continue;
        var t = r.top + fr.top, b = r.bottom + fr.top;
        if (b < 0 || t > vh) continue;
        out.push({ l: r.left + fr.left, t: t, r: r.right + fr.left, b: b });
      }
    }
    return out;
  }

  // 内层「贴 iframe 底」的 Tab 栏顶边（顶层坐标）；没有则返回 null
  function tabBarTop() {
    var top = null;
    var fs = d.querySelectorAll('iframe');
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], fr = f.getBoundingClientRect(), cd = null;
      try { cd = f.contentDocument; } catch (e) { cd = null; }
      if (!cd || !cd.body || fr.height < 2) continue;
      var frameBottom = fr.top + fr.height;
      var els = cd.querySelectorAll('nav,[class*="tab"]');
      for (var j = 0; j < els.length; j++) {
        var el = els[j], r = el.getBoundingClientRect();
        if (r.height < 30 || r.height > 140) continue;
        if (r.width < fr.width * 0.55) continue;
        // 贴的是 iframe 的底（不是视口底）——壳页下面还有「相关工具/作者行」
        if (Math.abs(r.bottom + fr.top - frameBottom) > 60) continue;
        if (el.querySelectorAll('button,a,[role="button"]').length < 2) continue;
        var t = r.top + fr.top;
        if (top === null || t < top) top = t;
      }
    }
    return top;
  }

  // ---- 障碍物采集：量之前先把自家浮层「让开」--------------------------------
  // 必须让开的原因：A 浮层压着按钮时，B 浮层用 elementFromPoint 只会看到 A，
  // 于是把那个按钮判成「已被盖住的死元素」而放过；A 一挪开就露出被 B 压住的按钮。
  // 全站扫描里 screenshots 的「推广压住登录/注册、气泡压住 ⚙」都是这条互盲漏出来的。
  function peelOwn() {
    var saved = [], i, el;
    // 注入宿主 #ecoPromoteHost 是铺满整屏的透明层，量障碍时临时让开；
    // 但它的内联 pointer-events:none 没有 !important：若按「原值还原」会被
    // removeProperty 抹掉、退回 auto，整屏吃掉点击（线上 P0）。
    // 所以它不参与冻结/还原，量完固定硬写回 none !important（自愈，见 restore 末尾）。
    var pinHost = d.getElementById('ecoPromoteHost');
    if (pinHost) pinHost.style.setProperty('pointer-events', 'none', 'important');
    // #ecoBarWrap 仍临时冻结：它没有内联值，且子节点（AI 球）未单独声明
    // pointer-events:auto，若永久设 none 会让球点不动，只能按原值精确还原。
    var hosts = [d.getElementById('ecoBarWrap')];
    for (i = 0; i < hosts.length; i++) {
      el = hosts[i];
      if (!el) continue;
      saved.push([el, el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')]);
      el.style.setProperty('pointer-events', 'none', 'important');
    }
    var fab = promoFab();
    if (fab) {
      saved.push([fab, fab.style.getPropertyValue('pointer-events'), fab.style.getPropertyPriority('pointer-events')]);
      fab.style.setProperty('pointer-events', 'none', 'important');
    }
    var tip = d.querySelector('.eb-tip');
    if (tip) {
      saved.push([tip, tip.style.getPropertyValue('pointer-events'), tip.style.getPropertyPriority('pointer-events')]);
      tip.style.setProperty('pointer-events', 'none', 'important');
    }
    return function () {
      for (var j = 0; j < saved.length; j++) {
        var s = saved[j], e = s[0];
        // 精确还原：原本有值 → 按「原值 + 原 priority」写回；原本没有值 → 才 removeProperty。
        // 绝不能只按 priority 判断，否则无 !important 的内联 none 会被永久抹掉。
        if (s[1]) e.style.setProperty('pointer-events', s[1], s[2]);
        else e.style.removeProperty('pointer-events');
      }
      // 注入宿主永远保持 none !important（真正可点的是 shadow 内 .fab/.mask）
      if (pinHost) pinHost.style.setProperty('pointer-events', 'none', 'important');
    };
  }

  function ownOverlay(el) {
    var w = d.getElementById('ecoBarWrap'), h = d.getElementById('ecoPromoteHost');
    return !!((w && w.contains(el)) || (h && h.contains(el)));
  }

  // 统一成 {l,t,r,b}，避免两套字段名混用
  function boxOf(el) {
    var u = unionBox(el);
    return { l: u.left, t: u.top, r: u.right, b: u.bottom };
  }

  // 当前视口里可点元素的矩形，分两档：
  //   live = 剥掉自家浮层后仍然点得到的（真按钮，绝不许压）
  //   dead = 本来就被页面自己的层（画布/预览 iframe/模态）盖住的（点了也没反应，
  //          但仍尽量别压，否则看着像在挡按钮 —— 用户就是这么以为的）
  function collectObstacles(withBrand) {
    var live = [], dead = [], vw = window.innerWidth, vh = window.innerHeight;
    var restore = peelOwn();
    try {
      // 除了语义按钮，还要覆盖「div 做的按钮」：onclick / data-act / 类名含 btn、chip 的
      // （壳页里的「画质 / 画面 / 适应 / 填充 / 放大」这类控件都是这类标签，漏掉就会被球压住）
      var sel = 'button,a,input,select,textarea,[role=button],[role=tab],[role=link],[onclick],[data-act],' +
                '[class*="btn"],[class*="Btn"],[class*="chip"],' +
                '[class*="status"],[class*="badge"],[class*="pill"],[data-fab-avoid]' +
                (withBrand === false ? '' : ',.brand,.panel,#panel');
      var els = d.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (ownOverlay(el)) continue;
        var cs;
        try { cs = getComputedStyle(el); } catch (e) { continue; }
        if (cs.pointerEvents === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        var r = el.getBoundingClientRect();
        if (r.width < 16 || r.height < 16) continue;
        // 整页容器不算按钮：screenpen 的 ASIDE.panel 命中 [class*=btn] 之类被算成一颗 300×536 的
        // 「按钮」，把整个视口堵死 → 找空位永远失败，最后只能挑「压得最少」的 (12,232)。
        if (r.width > vw * 0.8 && r.height > vh * 0.6) continue;
        if (r.top > vh || r.bottom < 0) continue;
        var top = d.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), vw - 1),
                                     Math.min(Math.max(r.top + r.height / 2, 1), vh - 1));
        var hit = !!(top && (top === el || el.contains(top) || top.contains(el)));
        // 状态胶囊 / 徽标不是按钮，但压住它们一样难看 → 统一降到 dead 档（轻罚，尽量躲）
        var decor = false;
        try { decor = /status|badge|pill/i.test(String(el.className || '')); } catch (e) {}
        // 页面主动标注「浮标勿压」的关键信息块（如清单页的搜索计数、卡片首行信息）：
        // 它们不是按钮，但被浮层压住就是丢信息，统一按装饰档轻罚躲开（不阻断显示）
        if (!decor && el.hasAttribute && el.hasAttribute('data-fab-avoid')) decor = true;
        // 语义控件（button/a/input/select/textarea/role=button|tab/带 onclick）一律按真按钮对待：
        // 理赔助手页的 ⚙ 是 button.category-edit，被列表裁切层压着 → elementFromPoint 打不着，
        // 原来被降成 dead（轻罚）导致球/气泡压着它不动。用户看到的就是「气泡挡住 ⚙ 按不了」。
        var sem = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ||
                  el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab' ||
                  el.hasAttribute('onclick');
        ((!decor && (hit || sem)) ? live : dead).push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
      }
    } catch (e) {}
    restore();
    // 内层 iframe 的可点元素（含底部 Tab 栏）一律算真按钮——跨层遮挡就是这样漏掉的
    return { live: live.concat(foreignBoxes()), dead: dead };
  }

  function hitsBox(box, list) {
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      if (box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t) return true;
    }
    return false;
  }
  function countHits(box, list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      if (box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t) n++;
    }
    return n;
  }

  // 视口内找空位：优先「完全不压任何可点元素」→ 只压死元素最少 → 压真按钮最少
  // 位置顺序：右下/左下（不超过贴底 Tab 栏）→ 两侧自下而上 → 顶部 → 中部
  function findSpot(w, h, obs) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var tbt = tabBarTop();
    var maxY = (tbt !== null) ? Math.max(20, tbt - h - 8) : (vh - h - 12);
    var R = vw - w - 12, L = 12, M = Math.round((vw - w) / 2);
    // cands = [x, y, 左右偏好分]：右 0 / 左 10 / 中 16，底部 Tab 栏上方是最低可用位
    var cands = [];
    for (var y = maxY; y >= 64; y -= 14) { cands.push([R, y, 0]); cands.push([L, y, 10]); }
    cands.push([R, 10, 0]); cands.push([L, 10, 10]);
    for (var y2 = Math.round(vh * 0.55); y2 >= 64; y2 -= 14) cands.push([M, y2, 16]);
    var best = null, bestScore = 1e9, bestLv = 0, freeSpot = null;
    for (var i = 0; i < cands.length; i++) {
      var x = Math.max(6, Math.min(cands[i][0], vw - w - 6));
      var yy = Math.max(6, Math.min(cands[i][1], vh - h - 6));
      var box = { l: x, t: yy, r: x + w, b: yy + h };
      var lv = countHits(box, obs.live);
      var dd = countHits(box, obs.dead);
      // 第一个「什么都不压」的候选位记下来：循环自下而上，它就是最低的那个干净位
      if (!lv && !dd && !freeSpot) freeSpot = [x, yy, 0];
      // 真按钮最重（40/个）→ 装饰胶囊（4/个）→ 左右偏好 → 越低越好（每上一档 +1）
      // 这样「右下角被状态胶囊占住」时只会上移一格，不会整块跳到左边
      // 窄屏（≤640）正文铺满整屏、文字不算障碍物：把「上移」的代价抬高到 24/格，
      // 否则算法会为了躲 1 个按钮一路爬到视口中部，正好压在标题/数据条上
      var stepW = (window.innerWidth <= 640) ? 24 : 1;
      var score = lv * 40 + dd * 4 + cands[i][2] + Math.round((maxY - yy) / 14) * stepW;
      if (score < bestScore) { bestScore = score; best = [x, yy]; bestLv = lv; }
    }
    // 低处全都被占（320 常见）但上方还有干净位：宁可靠上一点也不隐藏
    // （用户要的是「能拖、能吸附、不挡东西」，不是「没有就消失」）
    if (bestLv > 0 && freeSpot) return freeSpot;
    return best ? [best[0], best[1], bestLv] : [R, Math.max(10, maxY), 0];
  }

  // ⑤ 浮层避让：有贴底 Tab 栏时优先把浮层推到 Tab 栏「上方」，再退左右两侧
  //    （推广按钮的位置改由 promote.js 自己管：可拖动 + 记忆 + 同一套跨层避让）
  // ⑥ 小鸽子球位置：拖动/吸附/记忆/复位都由 eco-bar.js 负责（它渲染这个球，键名 eco_ball_pos，存 x/y）
  //    这里只读它的记录，做「不压可点元素」的落位微调；避免两套逻辑互相覆写
  var ballDrag = null;
  function readBallPos() {
    try {
      var v = JSON.parse(localStorage.getItem('eco_ball_pos') || 'null');
      if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') return null;
      // 0/0 = 球隐藏时量出的脏值（旧版本会写进去），不当作位置
      if (v.x === 0 && v.y === 0) return null;
      return v;
    } catch (e) { return null; }
  }

  // 真实遮挡口径：在候选框内网格采样，直接看「手指下是什么」
  // 障碍集只收可点元素，漏掉普通段落文字；这里按钮与正文一起数，才能真正做到贴边不压内容
  function visOverlap(x, y, w, h) {
    var self = d.getElementById('ebBall');
    var live = 0, text = 0;
    for (var sy = y + 4; sy < y + h - 4; sy += 8) {
      for (var sx = x + 4; sx < x + w - 4; sx += 8) {
        var els;
        try { els = d.elementsFromPoint(sx, sy); } catch (e) { continue; }
        var hl = false, ht = false;
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if ((self && (el === self || self.contains(el))) || ownOverlay(el)) continue;
          var cs;
          try { cs = getComputedStyle(el); } catch (e2) { continue; }
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.06) continue;
          var tg = el.tagName;
          if (tg === 'A' || tg === 'BUTTON' || tg === 'INPUT' || tg === 'SELECT' ||
              tg === 'TEXTAREA' || tg === 'LABEL' || tg === 'SUMMARY' ||
              (el.getAttribute && el.getAttribute('role') === 'button')) { hl = true; }
          else {
            for (var k = 0; k < el.childNodes.length; k++) {
              var nd = el.childNodes[k];
              if (nd.nodeType === 3 && nd.textContent.replace(/\s/g, '').length > 1) { ht = true; break; }
            }
          }
          if (hl && ht) break;
        }
        if (hl) live++; else if (ht) text++;
      }
    }
    // 推广标在 shadow DOM 里，elementsFromPoint 只拿到宿主，单独按矩形算
    var pf = promoFab();
    if (pf && shown(pf)) {
      var pr = pf.getBoundingClientRect();
      if (x < pr.right && x + w > pr.left && y < pr.bottom && y + h > pr.top) live++;
    }
    return {live: live, text: text};
  }

  // 在某一侧沿纵向找「按钮与正文都不压」的位置；有干净的取离松手点最近的，没有就取压得最少的
  function visSettleY(x, y0, w, h) {
    var vw = window.innerWidth, vh = window.innerHeight;
    x = Math.max(6, Math.min(x, vw - w - 6));
    var clean = [], best = null, bestScore = 1e9;
    for (var yy = 64; yy <= vh - h - 8; yy += 7) {
      var o = visOverlap(x, yy, w, h);
      if (!o.live && !o.text) clean.push(yy);
      var sc = o.live * 40 + o.text * 4 + Math.abs(yy - y0) / 7;
      if (sc < bestScore) { bestScore = sc; best = [yy, o.live, o.text]; }
    }
    if (clean.length) {
      var pick = clean[0], dmin = 1e9;
      for (var i = 0; i < clean.length; i++) {
        var dd = Math.abs(clean[i] - y0);
        if (dd < dmin) { dmin = dd; pick = clean[i]; }
      }
      return [pick, 0, 0];
    }
    return best || [y0, 1, 1];
  }

  function placeBall(ball) {
    var imp = function (k, v) { ball.style.setProperty(k, v, 'important'); };
    var bb = ball.getBoundingClientRect();
    var bw = bb.width || 58, bh = bb.height || 58;
    var obs = collectObstacles(true);
    var pfab = promoFab();
    if (pfab && shown(pfab)) obs.live.push(boxOf(pfab));   // 两个浮层不许互压
    // ① 用户拖过的位置优先：沿用 eco-bar 记下的边，纵向挪到「按钮与正文都不压」的干净带
    var saved = ballDrag ? null : readBallPos();
    if (saved) {
      var vw0 = window.innerWidth;
      var side = (saved.x + bw / 2 < vw0 / 2) ? 'l' : 'r';
      var sx0 = side === 'l' ? 12 : vw0 - bw - 12;
      var sy = visSettleY(sx0, saved.y, bw, bh);
      if (sy[1] === 0) {
        ballParked = false;
        imp('display', 'flex');
        imp('left', sx0 + 'px');
        imp('right', 'auto');
        imp('top', sy[0] + 'px');
        imp('bottom', 'auto');
        return true;
      }
    }
    // 现在的位置还是空的就别动：否则每次 sync/点击都会把球挪到「第一个空位」，看着像在跳
    var cb = boxOf(ball);
    if (!hitsBox(cb, obs.live) && !hitsBox(cb, obs.dead)) { ballParked = false; return true; }
    var s = findSpot(bw, bh, obs);
    // 障碍集只认按钮，可能仍压着正文；再用真实采样把 y 挪到干净带（320 上有且仅有一处）
    if (s[2] === 0) {
      var rf = visSettleY(s[0], s[1], bw, bh);
      if (rf[1] === 0) s = [s[0], rf[0], 0];
    }
    // 连一个「不压真按钮」的位置都没有（320×568 的 screenpen 就是这样，整屏都是链接），
    // 那就先不显示这只球 —— 挡按钮的代价比少一个入口大。等 guard 发现有空位再自动回来。
    if (s[2] > 0) {
      ballParked = true;
      imp('display', 'none');
      return false;
    }
    ballParked = false;
    imp('display', 'flex');
    imp('left', s[0] + 'px');
    imp('right', 'auto');
    imp('top', s[1] + 'px');
    imp('bottom', 'auto');
    return true;
  }

  // ⑥b 供 eco-bar.js 调用：拖动结束 / 双击复位后，重新做一次「不压可点元素」的落位
  window.ecoBallPlace = function () {
    var b = document.getElementById('ebBall');
    if (b && shown(b)) { try { placeBall(b); } catch (e) {} }
  };

  // 小鸽子首启气泡：宽 204、标题一行 + 正文最多两行；
  // 只允许贴在球的上方 / 左侧 / 下方三个位置，且必须完全避开球、推广标和所有可点元素，
  // 三处都不行就整块不出 —— 宁可不出，也不能挡住按钮
  // 收起：先淡出 200ms 再隐藏（不弹跳、不闪烁）
  function hideTipAnimated(tip) {
    if (!tip) return;
    try { tip.classList.add('eco-tip-out'); } catch (e) {}
    setTimeout(function () {
      try { tip.style.setProperty('display', 'none', 'important'); } catch (e) {}
    }, 220);
  }

  function decorateTip(tip) {
    if (!tip || tip.getAttribute('data-eco-tip')) return;
    tip.setAttribute('data-eco-tip', '1');
    tip.innerHTML = '<button type="button" class="eb-tip-x" aria-label="关闭提示">×</button>' +
                    '<b>小鸽子</b><span class="eb-tip-t">找不到工具？页面打不开？点我直接问</span>';
    var x = tip.querySelector('.eb-tip-x');
    if (x) x.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      try { localStorage.setItem('eco_tip_seen', '1'); } catch (e) {}
      hideTipAnimated(tip);
    }, true);
    // 页面自己的 12 秒自动移除会直接 remove 掉，这里提前 2 秒淡出，避免「啪」一下消失
    setTimeout(function () { hideTipAnimated(tip); }, 10000);
  }

  function placeTip(tip) {
    var imp = function (k, v) { tip.style.setProperty(k, v, 'important'); };
    var b = d.getElementById('ebBall');
    // 先复位成「自然宽度」再量：left/right 都设着时固定定位会被挤成一条竖排，量出来全是错的
    imp('left', '0px'); imp('right', 'auto'); imp('top', '0px'); imp('bottom', 'auto');
    imp('display', 'block'); imp('width', '204px');
    var tb = unionBox(tip);
    if (tb.height > 96) { imp('display', 'none'); return false; }   // 标题 1 行 + 正文 2 行上限
    var obs = collectObstacles(true);
    var br = b ? b.getBoundingClientRect() : null;
    var pf = promoFab();
    var pbox = (pf && shown(pf)) ? boxOf(pf) : null;
    var vw = window.innerWidth, vh = window.innerHeight, cands = [];
    if (br) {
      var midY = br.top + (br.height - tb.height) / 2;
      // 球在哪边就把「同边上方」排第一，另一侧的位置作为备选（球被避让推到左边时也能出气泡）
      if (br.left + br.width / 2 > vw / 2) {
        cands.push([br.right - tb.width, br.top - tb.height - 8]);   // 球上方·右对齐
        cands.push([br.left - tb.width - 10, midY]);                 // 球左侧
        cands.push([br.left, br.top - tb.height - 8]);               // 球上方·左对齐
        cands.push([br.right + 10, midY]);                           // 球右侧
      } else {
        cands.push([br.left, br.top - tb.height - 8]);               // 球上方·左对齐
        cands.push([br.right + 10, midY]);                           // 球右侧
        cands.push([br.right - tb.width, br.top - tb.height - 8]);   // 球上方·右对齐
        cands.push([br.left - tb.width - 10, midY]);                 // 球左侧
      }
      cands.push([br.right - tb.width, br.bottom + 8]);              // 球下方
    } else {
      cands.push([vw - tb.width - 10, vh - tb.height - 10]);
    }
    for (var i = 0; i < cands.length; i++) {
      // 越界就换位置，不硬夹：夹进来的位置会和球/推广标重叠
      var x = Math.round(cands[i][0]), y = Math.round(cands[i][1]);
      if (x < 8 || x + tb.width > vw - 8 || y < 8 || y + tb.height > vh - 8) continue;
      var bx = { l: x, t: y, r: x + tb.width, b: y + tb.height };
      if (br && hitsBox(bx, [boxOf(b)]) ) continue;      // 不许压住球本体
      if (pbox && hitsBox(bx, [pbox])) continue;         // 不许压住推广标
      if (hitsBox(bx, obs.live) || hitsBox(bx, obs.dead)) continue;
      imp('left', x + 'px');
      imp('right', 'auto');
      imp('top', y + 'px');
      imp('bottom', 'auto');
      imp('display', 'block');
      return true;
    }
    imp('display', 'none');
    return false;
  }

  // 小鸽子球体里的矢量图标：注入层补齐（不改 eco-bar.js 的渲染与点击逻辑，可重复执行）
  var ICO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M20.5 11.6c0 4-3.6 7.2-8 7.2-1 0-2-.2-2.9-.5L5 20l1.2-3.6a7 7 0 0 1-1.7-4.8C4.5 7.6 8.1 4.4 12.5 4.4S20.5 7.6 20.5 11.6z"/>' +
                '<path d="M9.4 10.4h6.2M9.4 13.6h4"/></svg><i class="eb-dot"></i>';

  function decorateBall(ball) {
    if (!ball || ball.querySelector('.eb-ico')) return;
    var ico = d.createElement('span');
    ico.className = 'eb-ico';
    ico.innerHTML = ICO_SVG;
    ball.insertBefore(ico, ball.firstChild);
    var lab = ball.querySelector('.eb-sub');
    if (lab) lab.textContent = '小鸽子';
    ball.setAttribute('aria-label', 'AI 智能体 小鸽子');
    ball.setAttribute('role', 'button');
  }

  // 小鸽子外观方向：默认 A（黑金圆章）；B（琥珀胶囊）保留开关，不删。
  // 切换方式任选：<html data-eco-dove="b"> 或 <html class="eco-ball-b">
  function doveDir() {
    var v = (de.getAttribute('data-eco-dove') || '').toLowerCase();
    if (v === 'a' || v === 'b') return v;
    return de.classList.contains('eco-ball-b') ? 'b' : 'a';
  }

  function skinBall() {
    var ball = d.getElementById('ebBall');
    if (!ball) return;
    decorateBall(ball);
    // 各家页面给 .eb-ball 的宽度规则会互相打架（实测被压成 44px，字挤在一起），
    // 这里直接用内联 important 定死尺寸；方向 B 是胶囊，宽度按内容自适应
    var isB = doveDir() === 'b';
    de.setAttribute('data-eco-dove', isB ? 'b' : 'a');
    if (isB) {
      ball.style.setProperty('width', 'auto', 'important');
      ball.style.setProperty('min-width', '104px', 'important');
      ball.style.setProperty('height', '44px', 'important');
    } else {
      ball.style.setProperty('width', '58px', 'important');
      ball.style.setProperty('min-width', '0', 'important');
      ball.style.setProperty('height', '58px', 'important');
    }
    ball.style.setProperty('display', 'flex', 'important');
    ball.style.setProperty('flex-direction', isB ? 'row' : 'column', 'important');
    ball.style.setProperty('align-items', 'center', 'important');
    ball.style.setProperty('justify-content', 'center', 'important');
  }

  // ⑥ 推广悬浮标：拖动 + 松手吸附最近边缘 + 位置记忆 + 落点不压可点元素
  //    （全站一套：门户 static/js/promote.min.js 与工具页 promote.js 两份都适用）
  var POS_KEY = 'eco.promo.pos.v3';
  var dragState = null, promoSuppress = false, promoBound = false, ballParked = false;

  function readPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      return (p && typeof p.x === 'number' && typeof p.y === 'number') ? p : null;
    } catch (e) { return null; }
  }
  function savePos(x, y) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (e) {}
  }
  function putPos(fab, x, y) {
    fab.style.setProperty('left', Math.round(x) + 'px', 'important');
    fab.style.setProperty('top', Math.round(y) + 'px', 'important');
    fab.style.setProperty('right', 'auto', 'important');
    fab.style.setProperty('bottom', 'auto', 'important');
  }

  // 落位优先级：本次拖动边自下而上 → 同边向下 → 换边 → 中部；都撞则取重叠最少
  function settlePromo(fab, x, y) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var r = fab.getBoundingClientRect();
    var fw = r.width || 120, fh = r.height || 44;
    var page = collectObstacles(true);
    var ball = d.getElementById('ebBall'), tip = d.querySelector('.eb-tip');
    var ownBoxes = [];
    if (ball && shown(ball)) ownBoxes.push(boxOf(ball));    // 两个浮层正常不互压
    if (tip && shown(tip)) ownBoxes.push(boxOf(tip));
    var obs = { live: page.live.concat(ownBoxes), dead: page.dead };
    var tbt = tabBarTop();
    var maxY = vh - fh - 10;
    if (tbt !== null) maxY = Math.min(maxY, tbt - fh - 8);
    y = Math.max(10, Math.min(y, Math.max(10, maxY)));
    var near = (x + fw / 2 < vw / 2) ? 12 : (vw - fw - 12);
    var far = near === 12 ? (vw - fw - 12) : 12;
    var M = Math.round((vw - fw) / 2);
    var Q1 = Math.round(vw * 0.25 - fw / 2), Q3 = Math.round(vw * 0.75 - fw / 2);
    var cands = [];
    // 同高度先试对边，再试本边：避免在本边一路往上叠到气泡/球的上方，三个浮层摞成一列
    for (var ty = y; ty >= 64; ty -= 14) { cands.push([near, ty]); cands.push([far, ty]); }
    for (var ty2 = y + 14; ty2 <= maxY; ty2 += 14) { cands.push([near, ty2]); cands.push([far, ty2]); }
    for (var ty5 = maxY; ty5 >= 64; ty5 -= 14) cands.push([M, ty5]);
    // 兜底加密：screenpen 这种内容密到没有整列空白的页面，14px 步长 + 三列扫不出空位，
    // 会退化成「压得最少」而不是「完全不压」。这里补 8px 步长 + 四个 1/4 列再扫一遍。
    var dense = [near, far, M, Q1, Q3];
    for (var dy = maxY; dy >= 40; dy -= 8) {
      for (var di = 0; di < dense.length; di++) cands.push([dense[di], dy]);
    }
    var best = null, bestScore = 1e9;
    for (var i = 0; i < cands.length; i++) {
      var bx = Math.max(6, Math.min(cands[i][0], vw - fw - 6));
      var by = Math.max(6, Math.min(cands[i][1], vh - fh - 6));
      var box = { l: bx, t: by, r: bx + fw, b: by + fh };
      var lv = countHits(box, obs.live);
      var dd = countHits(box, obs.dead);
      if (!lv && !dd) { putPos(fab, bx, by); return; }
      var score = lv * 20 + dd;
      if (score < bestScore) { bestScore = score; best = [bx, by]; }
    }
    // 最后一档：6px 全网格密集扫描（320 窄屏 + 长文档会把整页填满，14/8px 步长仍可能漏空档）。
    // 只要存在一个「完全不压」的位置就得用它，宁可贴到很靠上也绝不压按钮。
    for (var fy = maxY; fy >= 34; fy -= 6) {
      for (var fx = 6; fx <= vw - fw - 6; fx += 6) {
        var fbox = { l: fx, t: fy, r: fx + fw, b: fy + fh };
        if (!countHits(fbox, obs.live) && !countHits(fbox, obs.dead)) { putPos(fab, fx, fy); return; }
      }
    }
    // 最后一档 · 放宽：只让页面元素，不再让自家球/气泡（球形是个浮层，挪它是一瞬间的事）。
    // 320 窄屏上唯一的空档正好被球占着，不让球就永远压着页面的 FAQ 按钮。
    for (var gy = maxY; gy >= 34; gy -= 6) {
      for (var gx = 6; gx <= vw - fw - 6; gx += 6) {
        var gbox = { l: gx, t: gy, r: gx + fw, b: gy + fh };
        if (!countHits(gbox, page.live) && !countHits(gbox, page.dead)) {
          putPos(fab, gx, gy);
          if (ball && shown(ball)) placeBall(ball);   // 立刻把球挪走，不等 guard
          return;
        }
      }
    }
    putPos(fab, best ? best[0] : near, best ? best[1] : Math.max(10, maxY));
  }

  function bindPromoDrag(fab) {
    if (!fab || promoBound) return;
    promoBound = true;
    fab.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      var r = fab.getBoundingClientRect();
      dragState = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: ev.clientX - r.left,
                    oy: ev.clientY - r.top, w: r.width, h: r.height, moved: false };
      try { fab.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    }, true);
    fab.addEventListener('pointermove', function (ev) {
      if (!dragState || ev.pointerId !== dragState.id) return;
      if (!dragState.moved && (Math.abs(ev.clientX - dragState.sx) > 6 || Math.abs(ev.clientY - dragState.sy) > 6)) {
        dragState.moved = true;
        fab.classList.add('dragging');
      }
      if (!dragState.moved) return;
      putPos(fab, Math.max(6, Math.min(ev.clientX - dragState.ox, window.innerWidth - dragState.w - 6)),
             Math.max(6, Math.min(ev.clientY - dragState.oy, window.innerHeight - dragState.h - 6)));
      ev.preventDefault();
    }, true);
    function end(ev) {
      if (!dragState || (ev.pointerId !== undefined && ev.pointerId !== dragState.id)) return;
      var moved = dragState.moved;
      dragState = null;
      fab.classList.remove('dragging');
      if (!moved) return;                        // 没拖动 → 交给原来的 click 打开推广
      var r = fab.getBoundingClientRect();
      var tx = (r.left + r.width / 2 < window.innerWidth / 2) ? 12 : (window.innerWidth - r.width - 12);
      settlePromo(fab, tx, r.top);
      savePos(parseFloat(fab.style.left), parseFloat(fab.style.top));
      promoSuppress = true;
      setTimeout(function () { promoSuppress = false; }, 380);
    }
    fab.addEventListener('pointerup', end, true);
    fab.addEventListener('pointercancel', end, true);
    // 拖动结束的那一下不能触发跳转（捕获阶段先拦住，promote 的 click 在冒泡阶段）
    fab.addEventListener('click', function (ev) {
      if (promoSuppress) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  }

  // 弹窗是不是「真的」挡在用户面前：只看 display 会误判 —— 理赔助手页的 #permIntro
  // 一直是 display:flex，但其实并不盖住页面，结果避让逻辑整段被跳过（球停在默认位压住 ⚙）。
  // 判定改成「视口中心点被它接住」才算挡路。
  function modalBlocking() {
    var ids = ['permIntro', 'welcomeModal'], vw = window.innerWidth, vh = window.innerHeight;
    for (var i = 0; i < ids.length; i++) {
      var m = d.getElementById(ids[i]);
      if (!m || !shown(m)) continue;
      var cs;
      try { cs = getComputedStyle(m); } catch (e) { continue; }
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.2) continue;
      var t = d.elementFromPoint(Math.round(vw / 2), Math.round(vh / 2));
      if (t && (m === t || m.contains(t))) return true;
    }
    return false;
  }

  // 推广入口去重：页面自己那排工具条里也有一个「推广有惊喜」（灵犀互传房主态等），
  // 和注入层的悬浮标是两套源头 → 全站只保留悬浮标这一个入口。
  // 只在注入层把它隐藏（不删、不改页面文件），推广功能与文案本身都还在。
  //
  // 判定顺序（结构化优先，文案只兜底）：
  //   ① [data-eco-promo]              页面显式标注的推广位
  //   ② id / class 带 promo|promote|guanggao   （页面改文案、换图标都不会失效）
  //   ③ 文案含「推广有惊喜」            最后一条兜底，防止漏网
  var PROMO_STRUCT = '[data-eco-promo],[id*="promo" i],[class*="promo" i],' +
                     '[id*="promote" i],[class*="promote" i],[id*="guanggao" i],[class*="guanggao" i]';

  function looksLikePromo(el) {
    // ① / ② 结构化命中：自己命中，或父级命中且父级只包着这一颗按钮
    try {
      if (el.matches(PROMO_STRUCT)) return 'struct';
      var p = el.parentElement;
      if (p && p.matches(PROMO_STRUCT) && p.querySelectorAll('button,a,[role="button"]').length <= 1) return 'struct';
    } catch (e) {}
    // ③ 文案兜底
    var tx = (el.textContent || '').replace(/\s/g, '');
    if (tx.indexOf('推广有惊喜') >= 0) return 'text';
    return '';
  }

  function dedupePromo() {
    var host = d.getElementById('ecoPromoteHost');
    if (!host) return;
    // 保留的那个入口打上稳定标记，计数与去重都从标记算，不依赖文字
    if (host.getAttribute('data-eco-promo-host') !== '1') host.setAttribute('data-eco-promo-host', '1');
    if (!promoFab()) return;
    var docs = [d], fs = d.querySelectorAll('iframe'), i, j, k;
    for (i = 0; i < fs.length; i++) {
      try { if (fs[i].contentDocument && fs[i].contentDocument.body) docs.push(fs[i].contentDocument); } catch (e) {}
    }
    for (j = 0; j < docs.length; j++) {
      var els;
      try { els = docs[j].querySelectorAll('button,a,[role="button"],[onclick],[class*="btn"],[class*="chip"],' + PROMO_STRUCT); } catch (e) { continue; }
      for (k = 0; k < els.length; k++) {
        var el = els[k];
        if (el.__ecoPromoDup || ownOverlay(el) || el === host) continue;
        var cs;
        try { cs = docs[j].defaultView.getComputedStyle(el); } catch (e) { cs = null; }
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 14) continue;
        var why = looksLikePromo(el);
        if (!why) continue;
        // 只处理「自己就是那一颗按钮」的，别把整排工具条 / 整张推广卡一起隐藏
        var tx = (el.textContent || '').replace(/\s/g, '');
        if (tx.length > 24 || el.querySelectorAll('button,a,[role="button"]').length > 1) continue;
        el.__ecoPromoDup = why;
        try {
          el.style.setProperty('display', 'none', 'important');
          el.setAttribute('data-eco-promo-dup', why);   // 留痕：便于线上核查是哪条规则命中的
        } catch (e) {}
      }
    }
  }

  function avoidFloat() {
    var fab = promoFab();
    var ball = d.getElementById('ebBall');
    var tip = d.querySelector('.eb-tip');
    skinBall();
    dedupePromo();
    // 首启弹窗开着的时候整个页面被模态压住，此时量出来的「空位」全是假的
    // （所有按钮都被弹窗盖住 → 会被当成死元素放过），所以直接等用户关掉再量
    if (modalBlocking()) {
      if (fab) fab.style.display = 'none';
      if (tip) tip.style.display = 'none';
      return;
    }
    if (shown(ball)) placeBall(ball);
    if (tip) { decorateTip(tip); placeTip(tip); }
    if (!fab) return;
    if (fab.style.display === 'none') fab.style.display = '';
    // 推广按钮的位置与拖动统一在这里管（门户与工具页两份 promote 脚本都适用）
    bindPromoDrag(fab);
    var p = readPos();
    var fh = fab.getBoundingClientRect().height || 44;
    if (p) settlePromo(fab, p.x, p.y);
    else settlePromo(fab, 12, window.innerHeight - fh - 96);
  }

  // ⑦ 事后校验：页面内容是渐进的（图片/懒加载/字体/首启弹窗收起），注入层第一次量的时候
  //    很多东西还没出来，位置过一会儿就过期了。这里只做「现在压住了就重找，没压住就一动不动」，
  //    不主动挪，避免浮层自己跳来跳去。
  var guardT = 0, lastDedup = 0;
  function guard() {
    if (d.hidden || dragState) return;
    if (modalBlocking()) return;
    // 页面可能在建房/切 Tab 之后才渲染出内联的「推广有惊喜」，这里低频补一次去重
    var now = new Date().getTime();
    if (now - lastDedup > 1200) { lastDedup = now; dedupePromo(); }
    // 之前因为「整屏没有空位」被收起来的球，这里抽空试放回去（放不下会再次收起）
    var b0 = d.getElementById('ebBall');
    if (b0 && ballParked && !shown(b0)) {
      try { b0.style.setProperty('display', 'flex', 'important'); } catch (e) {}
      placeBall(b0);
    }
    var fab = promoFab(), ball = d.getElementById('ebBall'), tip = d.querySelector('.eb-tip');
    if (tip) decorateTip(tip);
    var hasAny = (ball && shown(ball)) || (fab && shown(fab)) || (tip && shown(tip));
    if (!hasAny) return;
    // 三个浮层共用一次采集（自家浮层量之前已经剥掉，障碍集与「谁在试位」无关）
    var obs = collectObstacles(true);
    var ballB = (ball && shown(ball)) ? boxOf(ball) : null;
    var tipB = (tip && shown(tip)) ? boxOf(tip) : null;
    var fabB = (fab && shown(fab)) ? boxOf(fab) : null;
    if (ballB && (hitsBox(ballB, obs.live) || hitsBox(ballB, obs.dead))) placeBall(ball);
    if (tipB) {
      var to = { live: obs.live.concat(fabB ? [fabB] : []), dead: obs.dead };
      if (hitsBox(tipB, to.live) || hitsBox(tipB, to.dead)) placeTip(tip);
    }
    if (fabB) {
      var fo = { live: obs.live.concat(ballB ? [ballB] : [], tipB ? [tipB] : []), dead: obs.dead };
      if (hitsBox(fabB, fo.live) || hitsBox(fabB, fo.dead)) {
        var r = fab.getBoundingClientRect();
        settlePromo(fab, r.left, r.top);
      }
    }
  }
  function guardLater() {
    clearTimeout(guardT);
    guardT = setTimeout(guard, 420);
  }

  // 滚动时内容是流动的，固定浮层会被「送」到按钮上面；停下来 260ms 再校验一次
  // （壳页的滚动发生在 iframe 内，所以内层文档的 scroll 也要挂上）
  var scrollT = 0, scrollHooked = false;
  function onScroll() {
    clearTimeout(scrollT);
    scrollT = setTimeout(guard, 260);
  }
  function hookScroll() {
    if (!scrollHooked) {
      scrollHooked = true;
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      d.addEventListener('scroll', onScroll, { capture: true, passive: true });
    }
    var fs = d.querySelectorAll('iframe');
    for (var i = 0; i < fs.length; i++) {
      try {
        var w = fs[i].contentWindow, cd = fs[i].contentDocument;
        if (w && cd && !w.__ecoScrollHooked) {
          w.__ecoScrollHooked = 1;
          cd.addEventListener('scroll', onScroll, true);
          w.addEventListener('scroll', onScroll, true);
          // 内层页面的内容变化（切 Tab、开面板）不会惊动顶层 MutationObserver，
          // 这里单独挂一份，壳页重排后浮层也能跟着重新校验
          try {
            var mo2 = new MutationObserver(function () { guardLater(); });
            mo2.observe(cd.body || cd.documentElement, { childList: true, subtree: true });
          } catch (e) {}
          w.addEventListener('resize', guardLater);
        }
      } catch (e) {}
    }
  }

  function sync() {
    hookScroll();
    avoidFloat();
    var inset = measureBottomBar();
    de.style.setProperty('--eco-bb', inset + 'px');
    var fh = (window.innerWidth <= 820) ? measureFloat() : 0;
    de.style.setProperty('--eco-reserve', Math.max(0, fh - 6) + 'px');
    // 壳页 / 全屏滚动容器不加 padding，避免撑破或双滚动
    var bcs;
    try { bcs = d.body ? getComputedStyle(d.body) : null; } catch (e) { bcs = null; }
    if (!bcs) return;
    if (bcs.overflowY === 'hidden' || bcs.display === 'flex' && bcs.height.indexOf('px') >= 0 && parseInt(bcs.height, 10) >= window.innerHeight - 2) {
      de.classList.remove('eco-pad');
    } else {
      de.classList.add('eco-pad');
    }
  }

  sync();
  var t = 0;
  function later() { clearTimeout(t); t = setTimeout(sync, 160); }
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  // 诊断钩子：controllers 可在控制台/自动化里手动触发一次校验（不参与业务逻辑）
  try {
    window.__ecoDbg = { guard: guard, avoid: avoidFloat, placeTip: placeTip, placeBall: placeBall,
                        settle: settlePromo, obs: collectObstacles, peel: peelOwn };
  } catch (e) {}

  // 浮层（AI 球/推广条）是延迟出现的，多补几次测量
  [600, 1600, 3200].forEach(function (ms) { setTimeout(sync, ms); });
  // 页面继续长内容时再校验（只校正压住的，没压住不动）
  [900, 2400, 4000, 6000, 9000].forEach(function (ms) { setTimeout(guard, ms); });
  // 前 28 秒每 700ms 校验一次（内容分批出现/内层滚动时能立刻纠位），之后降到每 2.5 秒
  var gN = 0;
  var gi = setInterval(function () {
    gN++;
    guard();
    if (gN >= 40) { clearInterval(gi); setInterval(guard, 2500); }
  }, 700);
  window.addEventListener('load', function () { setTimeout(guard, 500); setTimeout(guard, 1800); });
  try {
    var gmo = null;
    var startMO = function () {
      if (!d.body) { setTimeout(startMO, 120); return; }
      try {
        gmo = new MutationObserver(function (ms) {
          for (var i = 0; i < ms.length; i++) {
            if (ms[i].addedNodes && ms[i].addedNodes.length) { guardLater(); return; }
          }
        });
        gmo.observe(d.body, { childList: true, subtree: true });
      } catch (e) {}
    };
    startMO();
  } catch (e) {}
  // 用户关掉首启引导后，推广按钮要重新找空位（点一下算一次，延迟 300ms 等弹窗收起）
  d.addEventListener('click', function () { setTimeout(avoidFloat, 300); }, true);

  // ⑥ 页面元信息校正：程序大小/上次保存 由页面自己的 app.js 用 HEAD 的 Content-Length 累加，
  //    nginx 开 gzip 后 HEAD 两次都只回 20 字节 → 显示成「26 B / 40 B」这种假数字。
  //    这里改用资源计时里的真实解码字节数重算；拿不到时间就写「未知」，不写 "--"。
  var metaBusy = false, metaGood = null;
  function fmtSize(n) {
    if (!(n > 0)) return null;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function fmtTime(t) {
    var x = new Date(t);
    function p(v) { return v < 10 ? '0' + v : '' + v; }
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()) + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
  }
  function resStat(name) {
    var es = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
    for (var i = 0; i < es.length; i++) {
      if ((es[i].name || '').indexOf(name) < 0) continue;
      if (es[i].decodedBodySize) return es[i].decodedBodySize;
    }
    return 0;
  }
  function setMeta(ps, pt, size, time) {
    var s = ps ? '程序大小: ' + (size || '未知') : '';
    var t = pt ? '上次保存: ' + (time || '未知') : '';
    if (ps && ps.textContent !== s) ps.textContent = s;
    if (pt && pt.textContent !== t) pt.textContent = t;
    metaGood = s + '|' + t;
  }
  function fixMeta() {
    var ps = d.getElementById('progSize'), pt = d.getElementById('progTime');
    if (!ps && !pt) return;
    if (metaBusy) return;
    metaBusy = true;
    var names = ['style.css', 'app.js'];
    Promise.all(names.map(function (n) {
      return fetch(n, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        return { n: n, len: parseInt(r.headers.get('Content-Length') || '0', 10) || 0, lm: r.headers.get('Last-Modified') };
      }).catch(function () { return { n: n, len: 0, lm: null }; });
    })).then(function (hs) {
      var total = 0, lm = 0, any = false;
      for (var i = 0; i < hs.length; i++) {
        var sz = resStat(hs[i].n);
        if (!sz && hs[i].len > 1024) sz = hs[i].len;   // 只有明显是真实长度的才采信
        if (sz > 0) { total += sz; any = true; }
        var tt = hs[i].lm ? Date.parse(hs[i].lm) : 0;
        if (tt && tt > lm) lm = tt;
      }
      if (any) { setMeta(ps, pt, fmtSize(total), lm ? fmtTime(lm) : null); metaBusy = false; return; }
      // 资源计时拿不到（缓存抹平/老浏览器）时退回 GET 文本的真实字节数
      Promise.all(names.map(function (n) {
        return fetch(n, { cache: 'no-store' }).then(function (r) { return r.text(); })
          .then(function (tx) { return new TextEncoder().encode(tx).length; }).catch(function () { return 0; });
      })).then(function (arr) {
        var sum = 0;
        for (var i = 0; i < arr.length; i++) sum += arr[i];
        setMeta(ps, pt, sum > 0 ? fmtSize(sum) : null, lm ? fmtTime(lm) : null);
        metaBusy = false;
      });
    }).catch(function () { setMeta(ps, pt, null, null); metaBusy = false; });
  }
  if (d.getElementById('progSize') || d.getElementById('progTime')) {
    [600, 1500, 3000, 5000, 8000].forEach(function (ms) { setTimeout(fixMeta, ms); });
    try {
      var mo = new MutationObserver(function () {
        var ps = d.getElementById('progSize'), pt = d.getElementById('progTime');
        if (!ps && !pt) return;
        var now = (ps ? ps.textContent : '') + '|' + (pt ? pt.textContent : '');
        if (now !== metaGood) fixMeta();          // 页面自己写回假值时再校正一次
      });
      [d.getElementById('progSize'), d.getElementById('progTime')].forEach(function (n) {
        if (n) mo.observe(n, { childList: true, characterData: true, subtree: true });
      });
    } catch (e) {}
  }

  // ③ 首启弹窗：补右上角常驻关闭（转调页面自己的 OK 按钮，保留 localStorage 记忆）
  function closeBtn() {
    var p = d.getElementById('permIntro');
    if (!p || p.querySelector('.eco-perm-x')) return;
    var card = p.firstElementChild;
    if (!card) return;
    var x = d.createElement('button');
    x.type = 'button';
    x.className = 'eco-perm-x';
    x.setAttribute('aria-label', '关闭使用说明');
    x.title = '关闭';
    x.innerHTML = '&times;';
    x.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var ok = d.getElementById('permIntroOk') || p.querySelector('button');
      if (ok) { ok.click(); } else { p.style.display = 'none'; }
    });
    card.insertBefore(x, card.firstChild);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', closeBtn);
  else closeBtn();

  // ④ 字号地板：CSS 选不到「计算后小于 12px」的元素，这里只抬带文本的节点，不动布局与交互
  function fontFloor() {
    if (window.innerWidth > 820 || !d.body) return;
    var SKIP = {SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, PATH: 1, TEXT: 1, TSPAN: 1, CODE: 1,
                PRE: 1, CANVAS: 1, IFRAME: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, OPTION: 1};
    var all = d.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP[el.tagName]) continue;
      if (el.classList && (el.classList.contains('eco-nosize') || el.classList.contains('eco-perm-x'))) continue;
      var fs;
      try { fs = parseFloat(getComputedStyle(el).fontSize); } catch (e) { continue; }
      if (!(fs > 0 && fs < 12)) continue;
      var own = false;
      for (var j = 0; j < el.childNodes.length; j++) {
        var nd = el.childNodes[j];
        if (nd.nodeType === 3 && nd.textContent.replace(/\s/g, '')) { own = true; break; }
      }
      if (!own) continue;
      el.style.fontSize = '12px';
      el.style.lineHeight = el.style.lineHeight || '1.5';
    }
  }
  function floorLater() { setTimeout(fontFloor, 80); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', fontFloor);
  else fontFloor();
  [400, 900, 1800, 3400].forEach(function (ms) { setTimeout(fontFloor, ms); });
  window.addEventListener('resize', floorLater);
  window.addEventListener('orientationchange', floorLater);

  // ⑤ 小鸽子提示气泡：滚过 1.2 屏后才允许出现（首屏 + 首屏统计条不被压），回到顶部自动收起
  var scrollTmr = 0;
  function markScrolled() {
    var y = window.pageYOffset || de.scrollTop || 0;
    var vh = window.innerHeight || de.clientHeight || 0;
    var on = y > Math.max(140, vh * 1.2);
    if (on) de.classList.add('eco-scrolled'); else de.classList.remove('eco-scrolled');
    // 滚动过程中把球降一档透明度（停下 1.2s 复位）：边滚边读时球不抢视线
    de.classList.add('eco-scrolling');
    if (scrollTmr) clearTimeout(scrollTmr);
    scrollTmr = setTimeout(function () { de.classList.remove('eco-scrolling'); }, 1200);
    // 手机首屏把推广球收起：320/375 首屏没有空白位，它只会压住标题与搜索计数；
    // 滚过 1.2 屏（此时底部是内容留白区）再放出来。用 visibility 而非 display，
    // 避免和 avoidFloat() 的 display 复位、promote.js 的 mob-hide(opacity) 互相覆盖。
    if (window.innerWidth <= 640) {
      var pf = promoFab();
      if (pf) {
        if (on) { try { pf.style.removeProperty('visibility'); } catch (e) {} }
        else { try { pf.style.setProperty('visibility', 'hidden', 'important'); } catch (e) {} }
      }
      // 首屏的智能体球：320/375 首屏没有空白位，它只能压住标题或说明文字，
      // 这里降一档透明度（仍可点），滚过 1.2 屏恢复正常
      var eb = d.getElementById('ebBall');
      if (eb) { try { if (on) eb.classList.remove('eco-ball-dim'); else eb.classList.add('eco-ball-dim'); } catch (e) {} }
    } else {
      var eb2 = d.getElementById('ebBall');
      if (eb2) { try { eb2.classList.remove('eco-ball-dim'); } catch (e) {} }
    }
  }
  window.addEventListener('scroll', markScrolled, { passive: true });
  // 推广球由后面的脚本注入，首屏那次量不到；注入完成后再补两次
  [300, 900, 2000].forEach(function (ms) { setTimeout(markScrolled, ms); });
  markScrolled();

  // ⑤b 顶部导航横滑可达：窄屏一行放不下 9 个页签，「AI 动态榜」等会被裁在右边。
  //     这里 ①把当前页签滚进可视区（直接访问 /rank 时不再看到半截字）
  //          ②有可滚内容时右侧渐隐，滚到尾部自动取消，明确「还能往右滑」
  function navReveal() {
    var nav = d.querySelector('header.topbar .nav, .topbar .nav');
    if (!nav) return;
    function paint() {
      var more = nav.scrollWidth > nav.clientWidth + 2 &&
                 nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2;
      nav.classList.toggle('eco-nav-more', more);
    }
    var act = nav.querySelector('a.active');
    if (act && nav.scrollWidth > nav.clientWidth + 2) {
      var nr = nav.getBoundingClientRect(), ar = act.getBoundingClientRect();
      // 只在本页签真的看不见时才滚，避免首屏无谓跳动
      if (ar.left < nr.left + 2 || ar.right > nr.right - 2) {
        nav.scrollLeft = Math.max(0, act.offsetLeft - 12);
      }
    }
    paint();
    nav.addEventListener('scroll', paint, { passive: true });
    window.addEventListener('resize', function () { setTimeout(paint, 200); });
    setTimeout(paint, 600);
  }
  navReveal();

  // ⑥ 说明类折叠 + 联动工具横滑 + 长面板收口（全端生效，HTML 一行不改）
  //    统一组件：.eco-fold / .eco-open / .eco-fold-body / .eco-fold-bar
  //    统一存储前缀 eco.fold.*；只移动 DOM 位置，不删除任何内容
  //    #gx-about（26 页硬编码）· #gx-links（27 页）· screenpen 侧栏长文 · digital-vault 安卓卡
  (function growth() {
    var path = location.pathname || '';
    // 约定不动的两处，全局脚本主动避让
    if (path.indexOf('/jungedongbao-website') === 0 || path.indexOf('/p/locker') === 0) return;
    var P = 'eco.fold.';
    var uid = 0;
    var faqDts = [];

    function get(k, dflt) {
      try { var v = localStorage.getItem(P + k); return v === null ? dflt : v === '1'; }
      catch (e) { return dflt; }
    }
    function set(k, v) { try { localStorage.setItem(P + k, v ? '1' : '0'); } catch (e) {} }

    function apply(el, bar, open) {
      if (open) el.classList.add('eco-open'); else el.classList.remove('eco-open');
      bar.setAttribute('aria-expanded', open ? 'true' : 'false');
      var ac = bar.querySelector('.eco-fold-a');
      if (ac) ac.textContent = open ? '收起' : '展开';
    }

    // 通用折叠：keep>0 时保留前 keep 个子节点（如「3 条核心」），其余收进 body
    function fold(el, key, sum, keep, defaultOpen) {
      if (!el || el.getAttribute('data-eco-fold')) return null;
      el.setAttribute('data-eco-fold', '1');
      el.setAttribute('data-fold-key', key);
      el.classList.add('eco-fold');
      var body = d.createElement('div');
      body.className = 'eco-fold-body';
      body.id = 'eco-fold-' + key + '-' + (el.id || 'x') + '-' + (++uid);
      keep = keep || 0;
      if (keep > 0) {
        var ks = [].slice.call(el.children, keep);
        for (var i = 0; i < ks.length; i++) body.appendChild(ks[i]);   // 内容仍留在 DOM 里
      } else {
        while (el.firstChild) body.appendChild(el.firstChild);
      }
      var bar = d.createElement('button');
      bar.type = 'button';
      bar.className = 'eco-fold-bar';
      bar.setAttribute('data-act', 'eco-fold');
      bar.setAttribute('aria-controls', body.id);
      bar.setAttribute('aria-expanded', 'false');
      bar.setAttribute('aria-label', '展开或收起说明内容');
      var st = d.createElement('span');
      st.className = 'eco-fold-t';
      st.textContent = sum;
      var ac = d.createElement('span');
      ac.className = 'eco-fold-a';
      ac.textContent = '展开';
      bar.appendChild(st);
      bar.appendChild(ac);
      el.appendChild(bar);
      el.appendChild(body);
      apply(el, bar, defaultOpen != null ? defaultOpen : get(key, false));
      return el;
    }

    // ① 页尾通用说明区：一行摘要（标题）+ 展开全文
    function buildAbout() {
      var about = d.getElementById('gx-about');
      if (!about) return;
      var sum = '';
      var ttl = d.getElementById('gx-title');
      if (ttl && ttl.innerText) sum = ttl.innerText.replace(/\s+/g, ' ').trim();
      if (!sum) {
        var h2 = about.querySelector('h2');
        sum = h2 && h2.innerText ? h2.innerText.replace(/\s+/g, ' ').trim() : '工具说明与常见问题';
      }
      fold(about, 'v1', sum, 0, null);
    }

    // ② 常见问题：默认只展开第一条，其余收起，逐条记住状态
    function readFaq() {
      var s = '';
      try { s = localStorage.getItem(P + 'faq') || ''; } catch (e) {}
      return s ? s.split(',') : [];
    }
    function saveFaq() {
      var v = [];
      for (var i = 0; i < faqDts.length; i++) v.push(faqDts[i].getAttribute('aria-expanded') === 'true' ? '1' : '0');
      try { localStorage.setItem(P + 'faq', v.join(',')); } catch (e) {}
    }
    function buildFaq() {
      var faq = d.getElementById('faq');
      if (!faq || faq.getAttribute('data-eco-faq')) return;
      var dl = faq.querySelector('dl');
      if (!dl) return;
      faq.setAttribute('data-eco-faq', '1');
      var dts = [].slice.call(dl.querySelectorAll('dt'));
      var saved = readFaq();
      for (var i = 0; i < dts.length; i++) {
        var dt = dts[i];
        var dd = dt.nextElementSibling;
        if (!dd || dd.tagName !== 'DD') continue;
        dt.classList.add('eco-faq-q');
        dt.setAttribute('data-act', 'eco-faq');
        dt.setAttribute('role', 'button');
        dt.setAttribute('tabindex', '0');
        var open = saved.length ? (saved[i] === '1') : (i === 0);
        dt.setAttribute('aria-expanded', open ? 'true' : 'false');
        faqDts.push(dt);
      }
    }
    function flipFaq(q) {
      var open = q.getAttribute('aria-expanded') !== 'true';
      q.setAttribute('aria-expanded', open ? 'true' : 'false');
      saveFaq();
    }

    // ③ 联动工具：一行横滑小条目（图标 + 名称 + 一句用途）
    function buildLinks() {
      var links = d.getElementById('gx-links');
      if (!links) return;
      var ul = links.querySelector('ul');
      if (!ul) return;
      // details/summary 变体本来就是一行折叠，别用横滑接管（lan-share-hub-pro）
      if (links.querySelector('details')) return;
      links.classList.add('eco-row');
      var lis = ul.querySelectorAll('li');
      for (var i = 0; i < lis.length; i++) {
        var li = lis[i];
        if (li.getAttribute('data-eco-row')) continue;
        var a = li.querySelector('a');
        if (!a) continue;
        li.setAttribute('data-eco-row', '1');
        var ic = d.createElement('i');
        ic.className = 'eco-gx-ic';
        ic.setAttribute('aria-hidden', 'true');
        ic.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
          'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/>' +
          '<path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>';
        var tx = d.createElement('div');
        tx.className = 'eco-gx-tx';
        while (li.firstChild) tx.appendChild(li.firstChild);   // 名称 + 一句用途原样保留
        li.appendChild(ic);
        li.appendChild(tx);
      }
    }

    // ④ 录屏笔侧栏：内容区可滚 + 底部工具按钮固定成脚
    function buildPanelShell() {
      var panel = d.getElementById('panel');
      var pb = d.getElementById('pBody');
      if (!panel || !pb || panel.getAttribute('data-eco-panel')) return;
      panel.setAttribute('data-eco-panel', '1');
      de.classList.add('eco-screenpen');
      var foot = d.createElement('div');
      foot.className = 'eco-p-foot';
      var grids = [];
      for (var i = 0; i < pb.children.length; i++) {
        var el = pb.children[i];
        if (el.classList && (el.classList.contains('grid4') || el.classList.contains('grid3'))) grids.push(el);
      }
      for (var j = 0; j < grids.length; j++) foot.appendChild(grids[j]);
      panel.appendChild(foot);
    }
    // ⑤ 录屏笔侧栏长文（无 class 的内联块）收成一行摘要
    function buildPanelNote() {
      var pb = d.getElementById('pBody');
      if (!pb) return;
      var kids = [].slice.call(pb.children);
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.tagName !== 'DIV' || el.id) continue;
        if (el.className && String(el.className).trim()) continue;
        if ((el.innerText || '').trim().length < 180) continue;
        fold(el, 'sp', '手机录屏为什么受限 · 权限清单 · 免费版说明', 0, false);
      }
    }

    // ⑥ digital-vault 安卓下载卡：保留标题 + 3 条核心更新，其余收进折叠
    function buildDl() {
      if (!d.querySelector('.dl-card')) return;
      de.classList.add('eco-vault');
      var card = d.querySelector('.dl-card.android');
      if (!card) return;
      var kids = [].slice.call(card.children);
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.tagName !== 'DIV' || el.id) continue;
        if (el.className && String(el.className).trim()) continue;
        if ((el.innerText || '').trim().length < 180) continue;
        fold(el, 'dl', '本次更新（构建 31）· 3 项权限 · 安装包与 SHA-256', 4, false);
      }
    }

    function run() {
      buildPanelShell();
      buildPanelNote();
      buildAbout();
      buildFaq();
      buildDl();
      buildLinks();
      // 面板脚/折叠会让右栏变高，浮层要按新高度重新量一次空位（否则球会压在最后一排按钮上）
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', run);
    else run();
    setTimeout(run, 700);        // 页面尾块可能晚于脚本渲染

    // 事件委托：CSP 下不写内联 onclick
    d.addEventListener('click', function (ev) {
      var t = ev.target;
      var bar = t && t.closest ? t.closest('[data-act="eco-fold"]') : null;
      if (bar) {
        var box = bar.closest('.eco-fold');
        if (!box) return;
        ev.preventDefault();
        var open = !box.classList.contains('eco-open');
        apply(box, bar, open);
        set(box.getAttribute('data-fold-key') || 'v1', open);
        return;
      }
      var q = t && t.closest ? t.closest('[data-act="eco-faq"]') : null;
      if (q) { ev.preventDefault(); flipFaq(q); }
    }, false);
    d.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
      var t = ev.target;
      var q = t && t.closest ? t.closest('[data-act="eco-faq"]') : null;
      if (q) { ev.preventDefault(); flipFaq(q); }
    }, false);
  })();
})();
