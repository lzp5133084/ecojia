/* ═══════════════════════════════════════════════════════════
   家庭抗风险测算 / 家庭保障体检 · 前端交互
   - 所有计算走服务端接口，前端只负责取值与呈现
   - 分享卡用 Canvas 现场绘制，不含任何金额与个人信息
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var state = { resilience: null, detail: null, cardDrawn: false, cardUrl: '', cardQr: true };

  function toastSafe(msg) {
    if (typeof window.toast === 'function') { window.toast(msg, true); }
  }

  function fmtMoney(v) {
    var n = Math.round(Number(v) || 0);
    try { return new Intl.NumberFormat('zh-CN').format(n); }
    catch (e) { return String(n); }
  }

  function setText(id, text) {
    var el = $(id);
    if (el) { el.textContent = text == null ? '' : String(text); }
  }

  function showError(id, msg) {
    var el = $(id);
    if (!el) { return; }
    el.textContent = msg || '请检查输入后再试';
    el.hidden = false;
  }

  function clearError(id) {
    var el = $(id);
    if (el) { el.hidden = true; el.textContent = ''; }
  }

  function markBad(id) {
    var el = $(id);
    if (el) { el.classList.add('is-bad'); }
  }

  function clearBad() {
    var list = document.querySelectorAll('.is-bad');
    for (var i = 0; i < list.length; i++) { list[i].classList.remove('is-bad'); }
  }

  function headerOffset() {
    var header = document.querySelector('.topbar');
    return (header ? header.getBoundingClientRect().height : 0) + 12;
  }

  function scrollToEl(el) {
    if (!el) { return; }
    var y = el.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - headerOffset();
    try {
      window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
    } catch (e) {
      window.scrollTo(0, Math.max(0, y));
    }
  }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  }

  /* ───────────────── 第一层 ───────────────── */
  function payloadFromForm() {
    return {
      liquid: ($('bzLiquid') || {}).value || '',
      expense: ($('bzExpense') || {}).value || '',
      earners: ($('bzEarners') || {}).value || '1',
      housing: ($('bzHousing') || {}).value || '0'
    };
  }

  /* 金额只走 POST 请求体：不进 URL、浏览器历史与访问日志。
     接口要求 X-CSRF-Token，先向 /api/calc/token 领签名 token（匿名同样可用），缓存在内存里。 */
  var calcToken = '';
  function getCalcToken() {
    if (calcToken) { return Promise.resolve(calcToken); }
    return fetch('/api/calc/token', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        calcToken = (d && d.token) || '';
        return calcToken;
      })
      .catch(function () { return ''; });
  }

  function apiPost(path, params) {
    return getCalcToken().then(function (tok) {
      if (!tok) {
        return { status: 0, data: { ok: false, msg: '计算令牌获取失败，请刷新页面后重试' } };
      }
      return fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tok },
        body: JSON.stringify(params)
      }).then(function (r) {
        return r.json().then(function (d) { return { status: r.status, data: d }; },
          function () { return { status: r.status, data: { ok: false, msg: '服务返回异常，请稍后再试' } }; });
      });
    });
  }

  function submitResilience(e) {
    if (e) { e.preventDefault(); }
    clearError('bzErr');
    clearBad();

    var payload = payloadFromForm();
    if (!String(payload.liquid).trim()) {
      showError('bzErr', '请先填「家里能马上动用的钱」');
      markBad('bzLiquid');
      $('bzLiquid').focus();
      return;
    }
    if (!String(payload.expense).trim() || Number(payload.expense) <= 0) {
      showError('bzErr', '请填写大于 0 的「家庭每月固定支出」');
      markBad('bzExpense');
      $('bzExpense').focus();
      return;
    }

    var btn = $('bzSubmit');
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '正在计算…'; }

    apiPost('/api/resilience/calc', payload).then(function (res) {
      var d = res.data || {};
      if (!d.ok) {
        showError('bzErr', d.msg || '计算失败，请稍后再试');
        var map = { liquid: 'bzLiquid', expense: 'bzExpense', housing: 'bzHousing' };
        if (d.field && map[d.field]) { markBad(map[d.field]); var el = $(map[d.field]); if (el) { el.focus(); } }
        return;
      }
      renderResilience(d.result);
    }).catch(function () {
      showError('bzErr', '网络有点忙，请稍后再试');
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = old || '算出我能撑几个月'; }
    });
  }

  function renderResilience(r) {
    state.resilience = r;
    state.cardDrawn = false;
    state.cardUrl = '';

    setText('bzMonths', r.months_display);
    setText('bzTier', r.tier.name);
    setText('bzTierRange', r.tier.range);
    setText('bzConclusion', r.conclusion);
    var caveat = $('bzCaveat');
    if (caveat) {
      if (r.income_caveat) { caveat.textContent = r.income_caveat; caveat.hidden = false; }
      else { caveat.textContent = ''; caveat.hidden = true; }
    }
    setText('bzReference', r.reference);
    setText('bzAdviceSavings', r.advice.savings);
    setText('bzAdviceProtection', r.advice.protection);
    setText('bzDisclaimer', r.disclaimer);

    var tags = $('bzTags');
    if (tags) {
      tags.innerHTML = '';
      (r.tags || []).forEach(function (t) {
        var s = document.createElement('span');
        s.textContent = t;
        tags.appendChild(s);
      });
    }

    var mark = $('bzMark');
    if (mark) {
      var pct = Math.max(1, Math.min(100, (Number(r.months) / 18) * 100));
      mark.style.left = pct + '%';
    }

    renderMini(r);
    $('bzResult').hidden = false;
    $('bzAdvice').hidden = false;
    $('bzShareBox').hidden = true;
    var emptyBox = $('bzEmpty');
    if (emptyBox) { emptyBox.hidden = true; }

    // 结果页下一步：偏紧时给明确入口，充裕时只留轻入口
    var tight = r.tier && (r.tier.key === 'tight' || r.tier.key === 'basic');
    var strong = $('bzPolicyNextStrong'), light = $('bzPolicyNextLight');
    if (strong) { strong.hidden = !tight; strong.style.display = tight ? '' : 'none'; }
    if (light) { light.hidden = !!tight; light.style.display = tight ? 'none' : ''; }

    if (isMobile()) {
      setTimeout(function () { scrollToEl($('bzResult')); }, 60);
    }
  }

  function renderMini(r) {
    var box = $('bzMiniRow');
    if (!box) { return; }
    box.innerHTML = '';
    var items = [
      ['每月需要补上的支出', '¥' + fmtMoney(r.basis.monthly_gap)],
      ['住房支出占比', r.basis.housing_ratio + '%'],
      ['距离 3 个月', r.breakdown.to_3m > 0 ? '差 ¥' + fmtMoney(r.breakdown.to_3m) : '已覆盖'],
      ['距离 6 个月', r.breakdown.to_6m > 0 ? '差 ¥' + fmtMoney(r.breakdown.to_6m) : '已覆盖']
    ];
    items.forEach(function (it) {
      var d = document.createElement('div');
      d.className = 'bz-mini';
      var s = document.createElement('span');
      s.textContent = it[0];
      var b = document.createElement('b');
      b.textContent = it[1];
      d.appendChild(s); d.appendChild(b);
      box.appendChild(d);
    });
  }

  /* ───────────────── 分享卡 ───────────────── */
  var FONT = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei","Segoe UI",sans-serif';

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth) {
    var lines = [], line = '';
    var chars = String(text || '').split('');
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = chars[i];
      } else {
        line = test;
      }
    }
    if (line) { lines.push(line); }
    return lines;
  }

  function drawCard(r, withQr, qrImg) {
    var c = $('bzCanvas');
    if (!c) { return; }
    var ctx = c.getContext('2d');
    c.width = 1080;
    c.height = 1350;

    // 背景
    var bg = ctx.createLinearGradient(0, 0, 1080, 1350);
    bg.addColorStop(0, '#1a1025');
    bg.addColorStop(0.55, '#241335');
    bg.addColorStop(1, '#130b1e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1350);

    var glow = ctx.createRadialGradient(540, 360, 40, 540, 360, 760);
    glow.addColorStop(0, 'rgba(244,114,182,.22)');
    glow.addColorStop(0.55, 'rgba(147,51,234,.10)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1080, 1350);

    ctx.strokeStyle = 'rgba(192,132,252,.07)';
    ctx.lineWidth = 1;
    for (var x = 60; x < 1080; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1350); ctx.stroke();
    }
    for (var y = 60; y < 1350; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke();
    }

    // 顶部品牌
    var logoGrad = ctx.createLinearGradient(90, 76, 154, 140);
    logoGrad.addColorStop(0, '#f472b6');
    logoGrad.addColorStop(0.55, '#c084fc');
    logoGrad.addColorStop(1, '#fbbf24');
    ctx.fillStyle = logoGrad;
    roundRect(ctx, 90, 76, 64, 64, 18);
    ctx.fill();
    ctx.fillStyle = '#2a1035';
    ctx.font = '800 34px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('生', 122, 110);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f3edfa';
    ctx.font = '700 30px ' + FONT;
    ctx.fillText('数字生态家园', 174, 108);
    ctx.fillStyle = '#a99bc0';
    ctx.font = '400 21px ' + FONT;
    ctx.fillText('ecojia.cn · 军哥懂保', 174, 140);

    // 顶部说明
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a99bc0';
    ctx.font = '500 26px ' + FONT;
    ctx.fillText('家庭抗风险 · 应急金测算', 540, 246);

    ctx.fillStyle = '#f3edfa';
    ctx.font = '400 34px ' + FONT;
    ctx.fillText('如果主要收入中断，大约能撑', 540, 386);

    // 主数字
    var numberGrad = ctx.createLinearGradient(260, 470, 840, 740);
    numberGrad.addColorStop(0, '#f472b6');
    numberGrad.addColorStop(0.5, '#c084fc');
    numberGrad.addColorStop(1, '#fbbf24');

    var numText = String(r.months_display);
    ctx.font = '800 250px ' + FONT;
    var numW = ctx.measureText(numText).width;
    ctx.font = '500 52px ' + FONT;
    var unitW = ctx.measureText('个月').width;
    var startX = (1080 - (numW + 18 + unitW)) / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = numberGrad;
    ctx.font = '800 250px ' + FONT;
    ctx.fillText(numText, startX, 706);
    ctx.fillStyle = '#a99bc0';
    ctx.font = '500 52px ' + FONT;
    ctx.fillText('个月', startX + numW + 18, 698);

    // 分档徽章
    var tierText = r.tier.name + ' · ' + r.tier.range;
    ctx.font = '700 28px ' + FONT;
    var tw = ctx.measureText(tierText).width;
    var chipW = tw + 64;
    var chipX = (1080 - chipW) / 2;
    var chipGrad = ctx.createLinearGradient(chipX, 0, chipX + chipW, 0);
    chipGrad.addColorStop(0, '#f472b6');
    chipGrad.addColorStop(0.55, '#c084fc');
    chipGrad.addColorStop(1, '#fbbf24');
    ctx.fillStyle = chipGrad;
    roundRect(ctx, chipX, 760, chipW, 62, 31);
    ctx.fill();
    ctx.fillStyle = '#2a1035';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tierText, 540, 792);
    ctx.textBaseline = 'alphabetic';

    // 结论（卡片上不重复金额，也不重复主数字，避免断行）
    var cardLine = '处于「' + r.tier.name + '」区间：' + r.tier.note;
    ctx.fillStyle = '#f3edfa';
    ctx.font = '400 32px ' + FONT;
    var lines = wrapLines(ctx, cardLine, 920);
    var ly = 906;
    lines.forEach(function (line) {
      ctx.fillText(line, 540, ly);
      ly += 52;
    });

    // 家庭结构标签
    var tagText = (r.tags || []).join(' · ');
    ctx.fillStyle = '#c9b7dc';
    ctx.font = '400 27px ' + FONT;
    ctx.fillText(tagText, 540, ly + 30);

    // 底部装饰与说明
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(201,183,220,.55)';
    ctx.font = '400 24px ' + FONT;
    ctx.fillText('应急金 · 短期现金流缓冲', 540, 1086);

    if (withQr) {
      drawQrFooter(ctx, qrImg);
    } else {
      // 无码版：保持原来的居中版式
      var lineGrad = ctx.createLinearGradient(240, 0, 840, 0);
      lineGrad.addColorStop(0, 'rgba(192,132,252,0)');
      lineGrad.addColorStop(0.5, 'rgba(192,132,252,.55)');
      lineGrad.addColorStop(1, 'rgba(192,132,252,0)');
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(240, 1152);
      ctx.lineTo(840, 1152);
      ctx.stroke();

      ctx.fillStyle = '#a99bc0';
      ctx.font = '400 22px ' + FONT;
      ctx.fillText('基于你输入数字的算术估算，不是预测，也不构成投保建议', 540, 1206);
      ctx.fillStyle = '#c9b7dc';
      ctx.font = '500 24px ' + FONT;
      ctx.fillText('ecojia.cn · 家庭抗风险测算', 540, 1256);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(201,183,220,.5)';
      ctx.font = '400 18px ' + FONT;
      ctx.fillText('微信 xunijiayuan', 1010, 1306);
      ctx.textAlign = 'left';
    }
  }

  /* 底部：左侧说明文字 + 右下角离线二维码（不压主数字与结论） */
  function drawQrFooter(ctx, img) {
    var lineGrad = ctx.createLinearGradient(90, 0, 990, 0);
    lineGrad.addColorStop(0, 'rgba(192,132,252,0)');
    lineGrad.addColorStop(0.5, 'rgba(192,132,252,.5)');
    lineGrad.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, 1108);
    ctx.lineTo(990, 1108);
    ctx.stroke();

    // 左侧文字（右边界留到 740，避免压到二维码）
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a99bc0';
    ctx.font = '400 20px ' + FONT;
    ctx.fillText('基于你输入数字的算术估算，不是预测，也不构成投保建议', 90, 1158);
    ctx.fillStyle = '#c9b7dc';
    ctx.font = '500 24px ' + FONT;
    ctx.fillText('ecojia.cn · 家庭抗风险测算', 90, 1206);
    ctx.fillStyle = 'rgba(201,183,220,.5)';
    ctx.font = '400 18px ' + FONT;
    ctx.fillText('微信 xunijiayuan', 90, 1248);

    // 二维码引导文案（两行，右对齐贴近二维码）
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f3edfa';
    ctx.font = '600 27px ' + FONT;
    ctx.fillText('扫码测测', 752, 1160);
    ctx.fillText('你家能撑几个月', 752, 1198);
    ctx.fillStyle = '#a99bc0';
    ctx.font = '400 18px ' + FONT;
    ctx.fillText('ecojia.cn/baozhang-score', 752, 1234);

    // 二维码白底面板
    var panel = {x: 790, y: 1080, w: 226, h: 226, r: 16};
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, panel.r);
    ctx.fill();
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, panel.x + 13, panel.y + 13, panel.w - 26, panel.w - 26);
    }
    ctx.textAlign = 'left';
  }

  /* ── 二维码：本地静态 PNG，页面加载即预取，不请求任何第三方 ── */
  var qrImg = null;
  function ensureQr(cb) {
    if (qrImg) {
      if (qrImg.complete) { cb(qrImg); }
      else {
        qrImg.addEventListener('load', function () { cb(qrImg); });
        qrImg.addEventListener('error', function () { cb(null); });
      }
      return;
    }
    qrImg = new Image();
    qrImg.onload = function () { cb(qrImg); };
    qrImg.onerror = function () { qrImg = null; cb(null); };
    qrImg.src = '/static/img/baozhang-qr.png';
  }

  function openShare() {
    if (!state.resilience) { return; }
    ensureQr(function (img) {
      try {
        drawCard(state.resilience, state.cardQr, img);
        state.cardDrawn = true;
        state.cardUrl = cardDataUrl();
        var el = $('bzCardImg');
        if (el && state.cardUrl) { el.src = state.cardUrl; }
        $('bzShareBox').hidden = false;
        setTimeout(function () { scrollToEl($('bzShareBox')); }, 40);
        toastSafe('分享卡已生成，可长按图片或点「下载图片」保存');
      } catch (e) {
        showError('bzErr', '分享卡生成失败，请刷新页面再试');
      }
    });
  }

  /* 切换带码版 / 纯净版：同一张卡片重绘，不额外存任何数据 */
  function switchCard(kind) {
    state.cardQr = kind !== 'plain';
    document.querySelectorAll('.bz-tab').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-card') === (state.cardQr ? 'qr' : 'plain'));
    });
    if (!state.resilience || !state.cardDrawn) { return; }
    ensureQr(function (img) {
      try {
        drawCard(state.resilience, state.cardQr, img);
        state.cardUrl = cardDataUrl();
        var el = $('bzCardImg');
        if (el && state.cardUrl) { el.src = state.cardUrl; }
      } catch (e) { /* 保持上一版预览 */ }
    });
  }

  /* 导出用 JPEG 质量 0.95：1080×1350 实测量级 170KB 左右，
     PNG 同尺寸接近 1MB，微信里预览与转发都不占优 */
  function cardDataUrl() {
    var c = $('bzCanvas');
    if (!c) { return ''; }
    try {
      return c.toDataURL('image/jpeg', 0.95);
    } catch (e) {
      return '';
    }
  }

  function downloadCard() {
    if (!state.cardDrawn || !state.cardUrl) { openShare(); }
    var c = $('bzCanvas');
    if (!c) { return; }
    var name = '家庭抗风险-' + (state.resilience ? state.resilience.months_display : '结果') + '个月'
      + (state.cardQr ? '-带码' : '') + '.jpg';
    if (state.cardUrl) {
      var a = document.createElement('a');
      a.href = state.cardUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
      toastSafe('已保存到下载目录');
      return;
    }
    window.open(c.toDataURL('image/png'), '_blank');
  }

  /* ───────────────── 第二层 ───────────────── */
  function prefillDetail() {
    if (!state.resilience) { return; }
    var yexp = $('bzYearExpense'), assets = $('bzAssets');
    if (yexp && !String(yexp.value).trim()) {
      yexp.value = Math.round(state.resilience.basis.monthly_expense * 12);
    }
    if (assets && !String(assets.value).trim()) {
      assets.value = Math.round(state.resilience.basis.liquid);
    }
  }

  function toggleDetail(forceOpen) {
    var body = $('bzDetailBody'), btn = $('bzDetailToggle');
    if (!body || !btn) { return; }
    var open = typeof forceOpen === 'boolean' ? forceOpen : body.hidden;
    body.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? '收起保障体检' : '开始保障体检';
    if (open) {
      prefillDetail();
      if (isMobile()) { setTimeout(function () { scrollToEl($('bzDetail')); }, 60); }
    }
  }

  function submitDetail(e) {
    if (e) { e.preventDefault(); }
    clearError('bzDetailErr');
    clearBad();

    var payload = {
      age: ($('bzAge') || {}).value || '',
      structure: ($('bzStructure') || {}).value || '',
      annual_income: ($('bzIncome') || {}).value || '',
      annual_expense: ($('bzYearExpense') || {}).value || '',
      mortgage: ($('bzMortgage') || {}).value || '0',
      liquid_assets: ($('bzAssets') || {}).value || '0',
      child_education: ($('bzEdu') || {}).value || '',
      life: ($('bzLife') || {}).value || '0',
      ci: ($('bzCi') || {}).value || '0',
      medical: ($('bzMedical') || {}).value || '0',
      accident: ($('bzAccident') || {}).value || '0',
      annual_premium: ($('bzPremium') || {}).value || '0',
      social: !!($('bzSocial') && $('bzSocial').checked),
      million_medical: !!($('bzMillion') && $('bzMillion').checked)
    };

    if (!String(payload.age).trim()) {
      showError('bzDetailErr', '请填写年龄');
      markBad('bzAge'); $('bzAge').focus(); return;
    }
    if (!String(payload.annual_income).trim()) {
      showError('bzDetailErr', '请填写家庭年收入');
      markBad('bzIncome'); $('bzIncome').focus(); return;
    }
    if (!String(payload.annual_expense).trim()) {
      showError('bzDetailErr', '请填写家庭年支出');
      markBad('bzYearExpense'); $('bzYearExpense').focus(); return;
    }

    var btn = $('bzDetailSubmit');
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '正在计算…'; }

    apiPost('/api/baozhang/score', payload).then(function (res) {
      var d = res.data || {};
      if (!d.ok) {
        showError('bzDetailErr', d.msg || '计算失败，请稍后再试');
        var map = {
          age: 'bzAge', annual_income: 'bzIncome', annual_expense: 'bzYearExpense',
          mortgage: 'bzMortgage', liquid_assets: 'bzAssets', child_education: 'bzEdu',
          life: 'bzLife', ci: 'bzCi', medical: 'bzMedical', accident: 'bzAccident',
          annual_premium: 'bzPremium'
        };
        if (d.field && map[d.field]) {
          markBad(map[d.field]);
          var el = $(map[d.field]);
          if (el) { el.focus(); }
        }
        return;
      }
      renderDetail(d.result);
    }).catch(function () {
      showError('bzDetailErr', '网络有点忙，请稍后再试');
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = old || '查看体检结果'; }
    });
  }

  function renderDetail(r) {
    state.detail = r;
    setText('bzDetailScore', r.score);
    setText('bzDetailLevel', r.level.name);
    setText('bzDetailConclusion', r.conclusion);
    setText('bzGapTotal', '¥' + fmtMoney(r.gap.total));
    setText('bzCoverage', r.gap.coverage_ratio + '%');
    setText('bzLeverage', r.leverage.value == null ? '未填保费' : r.leverage.value + ' 倍');
    setText('bzDetailDisclaimer', r.disclaimer);

    var box = $('bzItems');
    if (box) {
      box.innerHTML = '';
      (r.items || []).forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'bz-item';

        var top = document.createElement('div');
        top.className = 'bz-item-top';
        var name = document.createElement('span');
        name.className = 'bz-item-name';
        name.textContent = it.name;
        var gap = document.createElement('span');
        gap.className = 'bz-item-gap';
        gap.appendChild(document.createTextNode('缺口 '));
        var gb = document.createElement('b');
        gb.textContent = '¥' + fmtMoney(it.gap);
        gap.appendChild(gb);
        top.appendChild(name); top.appendChild(gap);

        var bar = document.createElement('div');
        bar.className = 'bz-item-bar';
        var fill = document.createElement('i');
        fill.style.width = Math.max(0, Math.min(100, it.ratio)) + '%';
        bar.appendChild(fill);

        var meta = document.createElement('p');
        meta.className = 'bz-item-meta';
        meta.textContent = '估算目标 ¥' + fmtMoney(it.target) + ' · 已有 ¥' + fmtMoney(it.have) +
          ' · 覆盖 ' + it.ratio + '%';

        row.appendChild(top); row.appendChild(bar); row.appendChild(meta);
        box.appendChild(row);
      });
    }

    var notes = $('bzNotes');
    if (notes) {
      notes.innerHTML = '';
      (r.notes || []).forEach(function (n) {
        var li = document.createElement('li');
        li.textContent = n;
        notes.appendChild(li);
      });
    }

    $('bzDetailResult').hidden = false;
    if (isMobile()) {
      setTimeout(function () { scrollToEl($('bzDetailResult')); }, 60);
    }
  }

  /* ───────────────── 事件绑定 ───────────────── */
  function bind() {
    var form = $('bzForm');
    if (form) { form.addEventListener('submit', submitResilience); }

    var seg = document.querySelectorAll('.bz-seg-btn');
    for (var i = 0; i < seg.length; i++) {
      seg[i].addEventListener('click', function () {
        for (var j = 0; j < seg.length; j++) {
          seg[j].classList.remove('is-on');
          seg[j].setAttribute('aria-pressed', 'false');
        }
        this.classList.add('is-on');
        this.setAttribute('aria-pressed', 'true');
        var hidden = $('bzEarners');
        if (hidden) { hidden.value = this.getAttribute('data-earners'); }
      });
    }

    var again = $('bzAgain');
    if (again) {
      again.addEventListener('click', function () {
        scrollToEl($('bzFormCard'));
        setTimeout(function () { var el = $('bzLiquid'); if (el) { el.focus(); } }, 320);
      });
    }

    var share = $('bzShare');
    if (share) { share.addEventListener('click', openShare); }
    var dl = $('bzDownload');
    if (dl) { dl.addEventListener('click', downloadCard); }

    var tabs = document.querySelectorAll('.bz-tab[data-card]');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function () {
        switchCard(this.getAttribute('data-card'));
      });
    }
    // 预取二维码，点「生成分享卡」时无需等待
    ensureQr(function () {});

    var toggle = $('bzDetailToggle');
    if (toggle) { toggle.addEventListener('click', function () { toggleDetail(); }); }

    var detailForm = $('bzDetailForm');
    if (detailForm) { detailForm.addEventListener('submit', submitDetail); }

    document.addEventListener('click', function (e) {
      var q = e.target.closest ? e.target.closest('.bz-q') : null;
      if (q) {
        var tip = $(q.getAttribute('data-tip'));
        var open = q.getAttribute('aria-expanded') === 'true';
        q.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (tip) { tip.hidden = open; }
        return;
      }
      var jump = e.target.closest ? e.target.closest('[data-open-detail]') : null;
      if (jump) {
        e.preventDefault();
        toggleDetail(true);
        setTimeout(function () { scrollToEl($('bzDetail')); }, 80);
      }
    });

    var inputs = document.querySelectorAll('#bzForm input');
    for (var k = 0; k < inputs.length; k++) {
      inputs[k].addEventListener('input', function () { this.classList.remove('is-bad'); });
    }

    // 从家庭保单夹跳过来：金额不经 URL（避免落进历史、访问日志与 Referer）
    // 登录态直接问 /api/policies 拿 totals；本地模式读保单夹写入的一次性 sessionStorage
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get('from') === 'policy') {
        var applyPrefill = function (d) {
          if (!d) { toggleDetail(true); return; }
          var map = { life: 'bzLife', ci: 'bzCi', medical: 'bzMedical',
                      accident: 'bzAccident', premium: 'bzPremium' };
          Object.keys(map).forEach(function (key) {
            var v = Math.round(Number(d[key]) || 0);
            if (v > 0 && $(map[key])) { $(map[key]).value = String(v); }
          });
          var note = $('bzPolicySource');
          var total = Math.round(Number(d.insured) || 0);
          if (note && total > 0) {
            note.textContent = '已带上你在家庭保单夹里记录的总保额 ¥' +
              total.toLocaleString('zh-CN') +
              '，并按险种拆好了；补上年龄、家庭年收入和年支出就能出体检分。';
            note.hidden = false;
          }
          toggleDetail(true);
          setTimeout(function () { scrollToEl($('bzDetail')); }, 120);
        };
        var cached = null;
        try {
          var raw = sessionStorage.getItem('ecj_bs_prefill_v1');
          if (raw) {
            sessionStorage.removeItem('ecj_bs_prefill_v1');
            cached = JSON.parse(raw);
          }
        } catch (e) { cached = null; }
        if (cached) {
          applyPrefill(cached);
        } else {
          fetch('/api/policies', { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              if (!d || !d.totals || !d.totals.count) { toggleDetail(true); return; }
              var by = { '寿险': 0, '重疾': 0, '医疗': 0, '意外': 0 };
              (d.policies || []).forEach(function (p) {
                if (by[p.category] != null) { by[p.category] += Number(p.insured_amount) || 0; }
              });
              applyPrefill({ insured: d.totals.insured, premium: d.totals.premium,
                             life: by['寿险'], ci: by['重疾'],
                             medical: by['医疗'], accident: by['意外'] });
            })
            .catch(function () { toggleDetail(true); });
        }
      }
    } catch (err) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
