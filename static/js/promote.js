/**
 * 生态全域推广组件 V2 · 推广有惊喜
 * 一处脚本，全站生效：门户 ecojia.cn + 全部工具页 tools.ecojia.cn
 * V2 变更：专属邀请码（注册+实名认证后生成，好友必须经链接/邀请码注册才计入名下）、
 * 推广微信群二维码、合伙人 ¥999 扫码支付二维码（均由后台 /admin 设置）
 * 作者：军哥懂保　微信：xunijiayuan　官网：www.ecojia.cn
 */
(function () {
  'use strict';
  if (window.__ecoPromoteLoaded) return;
  window.__ecoPromoteLoaded = true;

  var API = 'https://ecojia.cn';
  var SITE = 'www.ecojia.cn';
  var WECHAT = 'xunijiayuan';

  var TIERS = [
    { num: '1',  name: '推广大使',   color: '#6366f1' },
    { num: '5',  name: '精英级大使', color: '#a78bfa' },
    { num: '10', name: '骨灰级大使', color: '#ec4899' },
    { num: '20', name: '项目合伙人', color: '#fbbf24', pay: true }
  ];

  var CSS = [
    ':host{all:initial;}',
    '.fab,.mask{pointer-events:auto;}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}',
    '.fab{position:fixed;right:18px;bottom:88px;z-index:2147483600;display:flex;align-items:center;gap:8px;',
    'padding:10px 18px;border:none;border-radius:999px;cursor:pointer;color:#1a1408;font-size:14px;font-weight:700;',
    'background:linear-gradient(135deg,#ffe9b6 0%,#fbbf24 45%,#e8a0bf 100%);',
    'box-shadow:0 8px 26px rgba(251,191,36,.42),0 0 0 1px rgba(255,255,255,.35) inset;',
    'transition:transform .25s cubic-bezier(.2,.9,.3,1.3),box-shadow .25s;}',
    '.fab:hover{transform:translateY(-3px) scale(1.03);box-shadow:0 12px 34px rgba(251,191,36,.6);}',
    '.fab .pulse{width:8px;height:8px;border-radius:50%;background:#7c2d12;box-shadow:0 0 0 0 rgba(124,45,18,.6);animation:pl 1.8s infinite;}',
    '@keyframes pl{0%{box-shadow:0 0 0 0 rgba(124,45,18,.55)}70%{box-shadow:0 0 0 9px rgba(124,45,18,0)}100%{box-shadow:0 0 0 0 rgba(124,45,18,0)}}',
    '.mask{position:fixed;inset:0;z-index:2147483601;background:rgba(6,6,16,.72);backdrop-filter:blur(6px);',
    'display:flex;align-items:center;justify-content:center;padding:16px;animation:fi .2s ease;}',
    '@keyframes fi{from{opacity:0}to{opacity:1}}',
    '.card{position:relative;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;border-radius:20px;color:#e8e8f6;',
    'padding:26px 22px 20px;background:linear-gradient(160deg,#151129 0%,#1b1533 50%,#120f24 100%);',
    'border:1px solid rgba(251,191,36,.3);box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 40px rgba(99,102,241,.18) inset;',
    'animation:pi .28s cubic-bezier(.2,.9,.3,1.2);}',
    '@keyframes pi{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:none}}',
    '.x{position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.18);',
    'background:rgba(255,255,255,.06);color:#cfcfe6;font-size:14px;line-height:1;cursor:pointer;}',
    '.x:hover{background:rgba(255,255,255,.14);color:#fff;}',
    '.h1{font-size:20px;font-weight:800;text-align:center;letter-spacing:.5px;',
    'background:linear-gradient(135deg,#ffe9b6,#fbbf24 55%,#e8a0bf);-webkit-background-clip:text;background-clip:text;color:transparent;}',
    '.sub{text-align:center;font-size:12px;color:#a0a0c0;margin-top:8px;line-height:1.6;}',
    '.hr{height:1px;margin:16px 0 14px;background:linear-gradient(90deg,transparent,rgba(99,102,241,.5),transparent);}',
    '.st{font-size:13px;font-weight:700;color:#c4b5fd;margin-bottom:10px;}',
    '.tier{display:flex;align-items:center;gap:10px;padding:9px 12px;margin-bottom:8px;border-radius:12px;',
    'background:rgba(99,102,241,.09);border:1px solid rgba(99,102,241,.22);}',
    '.tier .dot{width:9px;height:9px;border-radius:50%;flex:none;}',
    '.tier .need{font-size:12.5px;color:#b9b9d4;flex:none;min-width:64px;}',
    '.tier .rank{font-size:13px;font-weight:700;flex:1;}',
    '.tier .box{font-size:11px;padding:3px 8px;border-radius:8px;flex:none;',
    'background:rgba(251,191,36,.14);border:1px solid rgba(251,191,36,.45);color:#fbbf24;font-weight:700;}',
    '.tier .pay{font-size:11px;padding:3px 8px;border-radius:8px;flex:none;margin-left:6px;',
    'background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.45);color:#4ade80;font-weight:700;}',
    '.note{font-size:11.5px;color:#fbbf24;background:rgba(251,191,36,.08);border:1px dashed rgba(251,191,36,.35);',
    'border-radius:10px;padding:8px 10px;line-height:1.6;margin-top:4px;}',
    '.qrs{display:flex;gap:12px;margin-top:12px;}',
    '.qr{flex:1;text-align:center;border:1px dashed rgba(251,191,36,.4);border-radius:12px;padding:10px;}',
    '.qr img{width:118px;height:118px;object-fit:contain;background:#fff;border-radius:8px;}',
    '.qr .cap{font-size:11px;color:#a0a0c0;margin-top:6px;line-height:1.5;}',
    '.qr .ph{width:118px;height:118px;margin:0 auto;border-radius:8px;display:flex;align-items:center;justify-content:center;',
    'background:rgba(255,255,255,.05);color:#8888a0;font-size:11px;line-height:1.6;padding:8px;}',
    '.code{display:flex;align-items:center;gap:10px;margin-top:14px;padding:12px 14px;border-radius:12px;',
    'background:rgba(251,191,36,.07);border:1px dashed rgba(251,191,36,.5);}',
    '.code .lb{font-size:11.5px;color:#a0a0c0;flex:none;}',
    '.code .val{font-family:Consolas,Menlo,monospace;font-size:15px;font-weight:800;color:#fbbf24;flex:1;letter-spacing:.6px;}',
    '.code .cp{border:none;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;color:#fbbf24;',
    'background:rgba(251,191,36,.16);border:1px solid rgba(251,191,36,.45);}',
    '.code .cp:hover{background:rgba(251,191,36,.3);}',
    '.progress{font-size:11.5px;color:#9f9fb8;margin-top:8px;text-align:center;}',
    '.progress b{color:#fbbf24;font-size:13px;}',
    '.login-tip{text-align:center;margin-top:14px;padding:14px;border-radius:12px;',
    'background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);}',
    '.login-tip p{font-size:12px;color:#b9b9d4;line-height:1.7;margin-bottom:10px;}',
    '.login-tip a,.vbtn{display:inline-block;border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;',
    'color:#1a1408;background:linear-gradient(135deg,#ffe9b6,#fbbf24);cursor:pointer;text-decoration:none;}',
    '.rform{margin-top:14px;padding:14px;border-radius:12px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);}',
    '.rform p{font-size:12px;color:#b9b9d4;line-height:1.7;margin-bottom:10px;}',
    '.rform input{width:100%;padding:10px 12px;margin-bottom:8px;border-radius:8px;font-size:13px;color:#e8e8f6;',
    'background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.15);}',
    '.rform input:focus{outline:none;border-color:#fbbf24;}',
    '.rform .vbtn{width:100%;text-align:center;}',
    '.rmsg{font-size:11.5px;margin-top:8px;text-align:center;min-height:14px;}',
    '.btns{display:flex;gap:8px;margin-top:14px;}',
    '.btns button{flex:1;border:none;border-radius:10px;padding:11px 0;font-size:12.5px;font-weight:700;color:#fff;cursor:pointer;}',
    '.btns button:hover{filter:brightness(1.12);}',
    '.bp-wechat{background:#07c160;}.bp-qq{background:#12b7f5;}.bp-link{background:linear-gradient(135deg,#6366f1,#a78bfa);}',
    '.foot{text-align:center;font-size:11px;color:#8484a0;margin-top:14px;line-height:1.8;}',
    '.foot b{color:#fbbf24;}',
    '@media(max-width:480px){.fab{right:12px;bottom:78px;padding:9px 14px;font-size:12.5px;}',
    '.card{padding:22px 16px 16px;border-radius:16px;}.h1{font-size:17px;}',
    '.tier .need{min-width:56px;font-size:11.5px;}.tier .rank{font-size:12px;}}'
  ].join('');

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:2147483650;' +
      'padding:10px 18px;border-radius:10px;font-size:13px;color:#0e0a1a;font-weight:700;' +
      'background:linear-gradient(135deg,#ffe9b6,#fbbf24);box-shadow:0 8px 24px rgba(0,0,0,.35);';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 1600);
    setTimeout(function () { t.remove(); }, 2000);
  }

  function copy(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动复制：' + text); }
      ta.remove();
    }
  }

  function j(url, opts) {
    return fetch(API + url, Object.assign({ credentials: 'include' }, opts || {}))
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false }; });
  }

  var state = { cfg: null, me: null, loading: false };

  function tierHtml() {
    return TIERS.map(function (t) {
      var payTag = t.pay ? '<span class="pay">¥999 扫码加入</span>' : '';
      return '<div class="tier"><span class="dot" style="background:' + t.color + '"></span>' +
        '<span class="need">邀请 ' + t.num + ' 人</span>' +
        '<span class="rank" style="color:' + t.color + '">' + t.name + '</span>' +
        '<span class="box">盲盒</span>' + payTag + '</div>';
    }).join('');
  }

  function qrHtml() {
    var g = state.cfg && state.cfg.group_qr;
    var p = state.cfg && state.cfg.pay_qr;
    var price = (state.cfg && state.cfg.pay_price) || '999';
    return '<div class="qrs">' +
      '<div class="qr">' + (g
        ? '<img src="' + API + g + '" alt="推广微信群二维码">'
        : '<div class="ph">推广微信群<br>二维码后台设置中<br>可先加站长微信 ' + WECHAT + '</div>') +
        '<div class="cap">📱 扫码进推广群<br>素材 / 政策 / 盲盒兑付</div></div>' +
      '<div class="qr">' + (p
        ? '<img src="' + API + p + '" alt="合伙人支付二维码">'
        : '<div class="ph">合伙人 ¥' + price + ' 支付码<br>后台设置中<br>详询站长微信 ' + WECHAT + '</div>') +
        '<div class="cap">👑 满 20 人扫码 ¥' + price + '<br>加入项目合伙人</div></div>' +
      '</div>';
  }

  function personalHtml() {
    var me = state.me;
    if (!me || !me.login) {
      return '<div class="login-tip"><p>🔑 登录 / 注册账号后，系统为你生成<b style="color:#fbbf24">专属邀请码</b>（推广码+账号码）<br>' +
        '好友必须通过你的链接或邀请码注册，才会计入你的名下；<br>否则视为网站自然获客。</p>' +
        '<a href="https://ecojia.cn/login" target="_blank">登录 / 注册，获取我的专属邀请码</a></div>';
    }
    if (!me.verified) {
      return '<div class="rform"><p>🪪 你已登录（' + me.nickname + '）。完成<b style="color:#fbbf24">实名认证</b>后即可激活专属邀请码并参与推广：</p>' +
        '<input id="ep-name" placeholder="真实姓名">' +
        '<input id="ep-idcard" placeholder="身份证号（15或18位）" maxlength="18">' +
        '<button class="vbtn" id="ep-verify">提交实名认证</button>' +
        '<div class="rmsg" id="ep-rmsg"></div></div>';
    }
    return '<div class="code"><span class="lb">我的邀请码</span><span class="val">' + me.invite_code + '</span>' +
      '<button class="cp" id="ep-copy">📋 复制</button></div>' +
      '<div class="progress">已邀请 <b>' + me.invited + '</b> 人' +
      (me.is_partner ? ' ｜ 👑 你已是项目合伙人' : ' ｜ 满 20 人可扫码 ¥999 升级合伙人') + '</div>';
  }

  function bindPersonal(root) {
    var me = state.me;
    var cp = root.getElementById('ep-copy');
    if (cp && me && me.login) {
      cp.addEventListener('click', function () { copy(me.invite_code, '专属邀请码已复制：' + me.invite_code); });
    }
    var vb = root.getElementById('ep-verify');
    if (vb) {
      vb.addEventListener('click', function () {
        var name = root.getElementById('ep-name').value.trim();
        var idc = root.getElementById('ep-idcard').value.trim();
        var msg = root.getElementById('ep-rmsg');
        msg.style.color = '#fbbf24';
        msg.textContent = '提交中…';
        j('/api/promo/realname', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ real_name: name, real_idcard: idc })
        }).then(function (d) {
          if (d.ok) { toast(d.msg); refresh(); }
          else { msg.style.color = '#ff8a65'; msg.textContent = d.msg || '认证失败'; }
        });
      });
    }
  }

  function render(root) {
    var me = state.me;
    var link = (me && me.login && me.verified) ? me.invite_url : 'https://ecojia.cn/login?ref=';
    var mask = root.querySelector('.mask');
    if (!mask) return;
    mask.querySelector('.dyn-tiers').innerHTML = tierHtml();
    mask.querySelector('.dyn-qrs').innerHTML = qrHtml();
    mask.querySelector('.dyn-personal').innerHTML = personalHtml();
    bindPersonal(root);
    var txt = '🎁 我在用「EcoJia 数字生态」工具，2027 科技风超好用！通过我的链接注册，双方都有奖励，还能开盲盒：\n' + link +
      ((me && me.login && me.verified) ? '\n我的专属邀请码：' + me.invite_code : '');
    mask.querySelector('.bp-link').onclick = function () { copy(link, '推广链接已复制，去发给好友吧'); };
    mask.querySelector('.bp-wechat').onclick = function () { copy(txt, '微信分享文案已复制，粘贴给好友即可'); };
    mask.querySelector('.bp-qq').onclick = function () { copy(txt, 'QQ 分享文案已复制，粘贴给好友即可'); };
  }

  function refresh() {
    state.loading = true;
    Promise.all([j('/api/promo/config'), j('/api/promo/me')]).then(function (rs) {
      state.cfg = rs[0] && rs[0].ok ? rs[0] : null;
      state.me = rs[1] || null;
      state.loading = false;
      var host = document.getElementById('ecoPromoteHost');
      if (host && host.shadowRoot) render(host.shadowRoot);
    });
  }

  function build() {
    var host = document.createElement('div');
    host.id = 'ecoPromoteHost';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483600;';
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    var fab = document.createElement('button');
    fab.className = 'fab';
    fab.innerHTML = '<span class="pulse"></span><span>🎁 推广有惊喜</span>';
    root.appendChild(fab);

    var mask = null;
    function open() {
      if (mask) return;
      mask = document.createElement('div');
      mask.className = 'mask';
      mask.innerHTML =
        '<div class="card" role="dialog" aria-modal="true">' +
          '<button class="x" aria-label="关闭">✕</button>' +
          '<div class="h1">🎁 推广有惊喜 · 大使招募</div>' +
          '<div class="sub">注册账号并完成实名认证，获取你的<b style="color:#fbbf24">专属邀请码</b><br>' +
          '分享 1 位好友就能开盲盒，阶梯升级大使身份</div>' +
          '<div class="hr"></div>' +
          '<div class="st">🏆 阶梯奖励 · 大使晋升</div>' +
          '<div class="dyn-tiers">' + tierHtml() + '</div>' +
          '<div class="note">🎁 盲盒福利后期公布，每档均可开；满 20 人另可 ¥999 扫码加入<b>项目合伙人</b>（利益详情咨询站长）。' +
          '好友必须通过你的链接或邀请码注册才计入你名下，否则算网站自然获客。</div>' +
          '<div class="dyn-qrs">' + qrHtml() + '</div>' +
          '<div class="dyn-personal">' + personalHtml() + '</div>' +
          '<div class="btns">' +
            '<button class="bp-wechat">💬 微信</button>' +
            '<button class="bp-qq">🐧 QQ</button>' +
            '<button class="bp-link">🔗 复制链接</button>' +
          '</div>' +
          '<div class="foot">🌐 ' + SITE + ' ｜ 微信：' + WECHAT + ' ｜ 作者：军哥懂保<br>' +
          '推广咨询与盲盒兑付，统一联系站长微信 <b>' + WECHAT + '</b></div>' +
        '</div>';
      root.appendChild(mask);
      mask.addEventListener('click', function (e) {
        if (e.target === mask || e.target.classList.contains('x')) close();
      });
      refresh();
    }
    function close() { if (mask) { mask.remove(); mask = null; } }

    fab.addEventListener('click', open);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    window.EcoPromote = { open: open, close: close };
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
