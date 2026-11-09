/**
 * 生态全域推广组件 V3 · 推广有惊喜
 * 一处脚本，全站生效：门户 ecojia.cn + 全部工具页 tools.ecojia.cn
 * V3 变更（商业级改版）：
 *  1. 阶梯改为「等级 + 可感知权益」，四档不重复：盲盒次数 / 工具 VIP 时长 / 优先体验 / ¥999 合伙人；
 *  2. 统一「达成状态」唯一口径（已达成 / 还差 N 人 / 未开始），20 人档与支付二维码区文案一致；
 *  3. 未配置的二维码不再渲染灰色空壳，改为一行文字引导；
 *  4. 主按钮收进固定底栏（CTA 常驻可见），弹窗限高 + 内部滚动，小屏不再截断；
 *  5. 收敛黄色强调色，改用站内星空紫金主色。
 * 作者：军哥懂保　微信：xunijiayuan　官网：www.ecojia.cn
 */
(function () {
  'use strict';
  if (window.__ecoPromoteLoaded) return;
  window.__ecoPromoteLoaded = true;

  var API = 'https://ecojia.cn';
  var SITE = 'www.ecojia.cn';
  var WECHAT = 'xunijiayuan';
  var LOGIN_URL = 'https://ecojia.cn/login';

  /* 四档权益：全部由后台在达标后开通（盲盒＝工具 VIP 兑换券），不承诺无后台支撑的金额 */
  var TIERS = [
    {
      num: 1, lv: 'L1', name: '推广大使', color: '#c084fc',
      perks: ['盲盒 ×1', '工具 VIP 7 天']
    },
    {
      num: 5, lv: 'L2', name: '精英级大使', color: '#a78bfa',
      perks: ['盲盒 ×2', '指定工具 VIP 30 天']
    },
    {
      num: 10, lv: 'L3', name: '骨灰级大使', color: '#f472b6',
      perks: ['盲盒 ×3', '指定工具 VIP 90 天', '新品优先体验']
    },
    {
      num: 20, lv: 'L4', name: '项目合伙人', color: '#fbbf24', pay: true,
      perks: ['¥999 加入', '盲盒 ×5', '合伙人分成']
    }
  ];
  var PARTNER_MIN = 20;

  var CSS = [
    ':host{all:initial;}',
    '.fab,.mask{pointer-events:auto;}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}',
    /* —— 悬浮按钮 —— */
    '.fab{position:fixed;right:18px;bottom:88px;z-index:2147483600;display:flex;align-items:center;gap:8px;',
    'padding:10px 16px;border:none;border-radius:999px;cursor:pointer;color:#fff;font-size:13.5px;font-weight:700;letter-spacing:.3px;',
    'background:linear-gradient(135deg,#f472b6 0%,#c084fc 100%);',
    'box-shadow:0 10px 26px rgba(244,114,182,.34),0 0 0 1px rgba(255,255,255,.16) inset;',
    'transition:transform .25s cubic-bezier(.2,.9,.3,1.3),box-shadow .25s;}',
    '.fab:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 14px 34px rgba(244,114,182,.46);}',
    /* 智能体面板展开时，推广球暂避，避免两个浮层互相压字 */
    '.fab.parked{opacity:0;pointer-events:none;transform:scale(.8);}',
    '.fab .pulse{width:7px;height:7px;border-radius:50%;background:#fbbf24;box-shadow:0 0 0 0 rgba(251,191,36,.7);animation:pl 1.9s infinite;}',
    '@keyframes pl{0%{box-shadow:0 0 0 0 rgba(251,191,36,.6)}70%{box-shadow:0 0 0 8px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}',
    /* —— 遮罩与弹窗骨架：限高 + 内部滚动 —— */
    '.mask{position:fixed;inset:0;z-index:2147483601;background:rgba(8,3,16,.7);backdrop-filter:blur(7px);',
    'display:flex;align-items:center;justify-content:center;padding:16px;animation:fi .2s ease;}',
    '@keyframes fi{from{opacity:0}to{opacity:1}}',
    '.card{position:relative;display:flex;flex-direction:column;width:100%;max-width:492px;',
    'max-height:min(512px,calc(100vh - 40px));overflow:hidden;border-radius:18px;color:#f3edfa;',
    'background:linear-gradient(168deg,#241736 0%,#1a1025 52%,#140c1d 100%);',
    'border:1px solid rgba(192,132,252,.26);',
    'box-shadow:0 30px 80px rgba(6,2,14,.7),0 0 0 1px rgba(255,255,255,.04) inset,0 0 56px rgba(192,132,252,.14);',
    'animation:pi .26s cubic-bezier(.2,.9,.3,1.2);}',
    '@keyframes pi{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
    '.x{position:absolute;top:10px;right:10px;z-index:3;width:32px;height:32px;border-radius:50%;',
    'border:1px solid rgba(192,132,252,.28);background:rgba(255,255,255,.05);color:#cfc3e2;font-size:14px;line-height:1;cursor:pointer;}',
    '.x:hover{background:rgba(192,132,252,.18);color:#fff;}',
    /* —— 头部（不滚动） —— */
    '.head{flex:none;padding:15px 20px 11px;border-bottom:1px solid rgba(192,132,252,.14);',
    'background:linear-gradient(180deg,rgba(192,132,252,.08),transparent 80%);}',
    '.kick{font-size:9.5px;letter-spacing:2.4px;color:#9c8fae;text-transform:uppercase;}',
    '.h1{margin-top:4px;font-size:17px;font-weight:800;letter-spacing:.4px;',
    'background:linear-gradient(120deg,#f9a8d4,#c084fc 55%,#fbbf24);-webkit-background-clip:text;background-clip:text;color:transparent;}',
    '.sub{margin-top:5px;font-size:11.5px;color:#b3a6c9;line-height:1.6;}',
    /* —— 内容区（滚动） —— */
    '.body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 20px 6px;}',
    '.bodymain{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;}',
    '.body::-webkit-scrollbar{width:6px;}',
    '.body::-webkit-scrollbar-thumb{background:rgba(192,132,252,.28);border-radius:6px;}',
    '.body::-webkit-scrollbar-track{background:transparent;}',
    '.sec{display:flex;align-items:baseline;justify-content:space-between;margin:2px 0 9px;}',
    '.sec .t{font-size:12.5px;font-weight:700;color:#e8dcff;letter-spacing:.3px;}',
    '.sec .tag{font-size:10px;color:#9c8fae;letter-spacing:.8px;}',
    /* —— 阶梯卡片 —— */
    '.tier{display:grid;grid-template-columns:34px 1fr auto;gap:4px 10px;align-items:center;',
    'padding:8px 10px;margin-bottom:5px;border-radius:11px;',
    'background:rgba(255,255,255,.035);border:1px solid rgba(192,132,252,.15);transition:border-color .2s,background .2s;}',
    '.tier.reached{background:rgba(244,114,182,.065);border-color:rgba(244,114,182,.34);}',
    '.tier.top{background:rgba(251,191,36,.045);border-color:rgba(251,191,36,.3);}',
    '.lvl{grid-row:1 / span 2;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;',
    'font-size:10.5px;font-weight:800;color:#fff;letter-spacing:.5px;box-shadow:0 4px 12px rgba(0,0,0,.3) inset;}',
    /* 四档等级色：原来写在 HTML 的 style 属性里，CSP 会拦，改成类（与 TIERS 的色值一一对应） */
    '.lvl.lv1{background:linear-gradient(135deg,#c084fc,rgba(255,255,255,.16));}',
    '.lvl.lv2{background:linear-gradient(135deg,#a78bfa,rgba(255,255,255,.16));}',
    '.lvl.lv3{background:linear-gradient(135deg,#f472b6,rgba(255,255,255,.16));}',
    '.lvl.lv4{background:linear-gradient(135deg,#fbbf24,rgba(255,255,255,.16));}',
    '.hl-pink{color:#f9a8d4;}',
    '.nm{font-size:13.5px;font-weight:700;color:#f3edfa;line-height:1.45;}',
    '.nm em{font-style:normal;font-size:10.5px;font-weight:500;color:#9d90b6;margin-left:7px;}',
    '.state{font-size:10.5px;color:#8b7ea6;white-space:nowrap;text-align:right;}',
    '.state.ok{color:#f9a8d4;font-weight:700;}',
    '.state.next{color:#fbbf24;}',
    '.perks{grid-column:2 / span 2;display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;}',
    '.perk{font-size:10.5px;color:#cfc3e2;background:rgba(192,132,252,.1);border:1px solid rgba(192,132,252,.2);',
    'border-radius:5px;padding:2px 7px;line-height:1.5;}',
    '.tier.top .perk{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.24);color:#fde7b0;}',
    '.perk b{color:#f9a8d4;font-weight:800;}',
    '.tier.top .perk b{color:#fbbf24;}',
    /* —— 进度 —— */
    '.prog{padding:9px 11px;border-radius:11px;background:rgba(255,255,255,.03);border:1px solid rgba(192,132,252,.14);margin:2px 0 10px;}',
    '.prog .row{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;color:#a99bc0;}',
    '.prog b{color:#f9a8d4;font-size:13px;font-weight:800;}',
    '.bar{height:4px;border-radius:99px;background:rgba(255,255,255,.07);margin-top:7px;overflow:hidden;}',
    '.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#f472b6,#c084fc,#fbbf24);transition:width .35s;}',
    /* —— 二维码区：只渲染后台已配置的图 —— */
    '.qrrow{display:flex;gap:10px;}',
    '.qrbox{flex:1;min-width:0;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(192,132,252,.18);padding:9px;text-align:center;}',
    '.qrbox img{width:104px;height:104px;display:block;margin:0 auto;border-radius:7px;background:#fff;object-fit:contain;}',
    '.qrbox .cap{font-size:10px;color:#a99bc0;line-height:1.6;margin-top:6px;}',
    '.qrline{font-size:10.5px;color:#a99bc0;background:rgba(255,255,255,.03);border:1px dashed rgba(192,132,252,.18);',
    'border-radius:10px;padding:8px 10px;line-height:1.7;margin-top:8px;}',
    '.qrline b{color:#f9a8d4;}',
    /* —— 实名表单 —— */
    '.rform{margin-top:10px;padding:12px;border-radius:12px;background:rgba(192,132,252,.07);border:1px solid rgba(192,132,252,.24);}',
    '.rform p{font-size:11px;color:#b6a9cd;line-height:1.7;margin-bottom:9px;}',
    '.rform input{width:100%;height:38px;padding:0 11px;margin-bottom:7px;border-radius:9px;font-size:12.5px;color:#f3edfa;',
    'background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.14);outline:none;}',
    '.rform input:focus{border-color:rgba(244,114,182,.6);box-shadow:0 0 0 3px rgba(244,114,182,.12);}',
    '.vbtn{width:100%;height:38px;border:none;border-radius:9px;font-size:12.5px;font-weight:700;color:#fff;cursor:pointer;',
    'background:linear-gradient(135deg,#f472b6,#c084fc);}',
    '.vbtn:hover{filter:brightness(1.08);}',
    '.rmsg{font-size:11px;margin-top:7px;text-align:center;min-height:14px;}',
    /* —— 固定底栏 CTA —— */
    '.foot{flex:none;padding:10px 20px 13px;border-top:1px solid rgba(192,132,252,.16);',
    'background:linear-gradient(180deg,rgba(18,10,28,.5),rgba(18,10,28,.96));',
    'box-shadow:0 -14px 26px rgba(8,3,16,.4);}',
    '.cta{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:46px;border:none;',
    'border-radius:12px;cursor:pointer;font-size:14px;font-weight:800;letter-spacing:.3px;color:#fff;text-decoration:none;',
    'background:linear-gradient(135deg,#f472b6 0%,#c084fc 100%);',
    'box-shadow:0 10px 26px rgba(244,114,182,.3),0 0 0 1px rgba(255,255,255,.12) inset;',
    'transition:transform .2s,box-shadow .2s;}',
    '.cta:hover{transform:translateY(-1px);box-shadow:0 14px 32px rgba(244,114,182,.42);}',
    '.ctahint{font-size:10px;color:#7f7398;text-align:center;margin-top:6px;line-height:1.5;}',
    '.codeRow{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;',
    'background:rgba(255,255,255,.055);border:1px solid rgba(192,132,252,.28);}',
    '.codeRow .lb{font-size:10px;color:#a99bc0;flex:none;}',
    '.codeRow .val{flex:1;min-width:0;font-family:Consolas,Menlo,monospace;font-size:14px;font-weight:800;color:#f9a8d4;',
    'letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.cp{flex:none;height:28px;padding:0 11px;border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;color:#f9a8d4;',
    'background:rgba(244,114,182,.14);border:1px solid rgba(244,114,182,.36);}',
    '.cp:hover{background:rgba(244,114,182,.26);}',
    '.shareRow{display:flex;gap:6px;margin-top:7px;}',
    '.shareRow button{flex:1;height:32px;border-radius:8px;cursor:pointer;font-size:11px;color:#cfc3e2;',
    'background:rgba(255,255,255,.05);border:1px solid rgba(192,132,252,.2);}',
    '.shareRow button:hover{background:rgba(192,132,252,.16);}',
    '.rules{margin-top:10px;font-size:10px;color:#7f7398;line-height:1.75;}',
    '.rules b{color:#a99bc0;font-weight:600;}',
    /* —— 小屏：近全屏但保留内滚与固定 CTA —— */
    '@media(max-width:640px){',
    '.mask{padding:10px;align-items:flex-end;}',
    '.card{max-width:100%;max-height:calc(100vh - 92px);border-radius:16px;}',
    '.head{padding:14px 16px 10px;}',
    '.body{padding:11px 16px 6px;}',
    '.foot{padding:9px 16px 12px;}',
    '.h1{font-size:16px;}',
    '.sub{font-size:11.5px;}',
    '.nm{font-size:14px;}',
    '.perk{font-size:11px;}',
    '.state{font-size:11px;}',
    '.qrbox img{width:92px;height:92px;}',
    /* 手机端悬浮球收成 46px 圆球，位置由 guardFab 动态避让 */
    '.fab{width:46px;height:46px;right:10px;bottom:92px;padding:0;border-radius:50%;justify-content:center;gap:0;}',
    '.fab span:last-child{display:none;}',
    '.fab .pulse{display:none;}',
    '.fab::before{content:"🎁";font-size:19px;line-height:1;}',
    '.fab.mob-hide{opacity:0;pointer-events:none;}',
    '}',
    /* 短屏（720p 及以下）：收起说明文案，优先保证四档权益与 CTA 同时可见 */
    '@media(max-height:780px){.sub{display:none;}.card{max-height:min(486px,calc(100vh - 28px));}.head{padding-bottom:9px;}}'
  ].join('');

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:2147483650;' +
      'padding:10px 18px;border-radius:10px;font-size:13px;color:#fff;font-weight:700;' +
      'background:linear-gradient(135deg,#f472b6,#c084fc);box-shadow:0 10px 28px rgba(0,0,0,.4);';
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

  /* 唯一状态来源：登录 + 实名 + 邀请人数，避免同屏出现互相矛盾的「已解锁」 */
  function view() {
    var me = state.me || {};
    var login = !!me.login;
    var verified = login && !!me.verified;
    var invited = verified ? (+me.invited || 0) : 0;
    var partner = !!(login && me.is_partner);
    var reached = [], nextIdx = -1;
    for (var i = 0; i < TIERS.length; i++) {
      reached[i] = verified && (partner && TIERS[i].pay ? true : invited >= TIERS[i].num);
      if (!reached[i] && nextIdx < 0) nextIdx = i;
    }
    var qualified = partner || (verified && invited >= PARTNER_MIN);
    return {
      login: login, verified: verified, invited: invited, partner: partner,
      qualified: qualified, reached: reached, nextIdx: nextIdx,
      nickname: me.nickname || '用户', code: me.invite_code || '',
      url: me.invite_url || ''
    };
  }

  function tierHtml() {
    var v = view();
    return TIERS.map(function (t, i) {
      var cls = 'tier' + (v.reached[i] ? ' reached' : '') + (t.pay ? ' top' : '');
      var stateTxt = '', stateCls = 'state';
      if (v.verified) {
        if (v.reached[i]) { stateTxt = t.pay && v.partner ? '已加入' : '已达成'; stateCls = 'state ok'; }
        else if (i === v.nextIdx) { stateTxt = '还差 ' + (t.num - v.invited) + ' 人'; stateCls = 'state next'; }
        else { stateTxt = '未开始'; }
      }
      var perks = t.perks.map(function (p) {
        return '<span class="perk">' + (/^¥|×\d/.test(p) ? '<b>' + p + '</b>' : p) + '</span>';
      }).join('');
      return '<div class="' + cls + '">' +
        '<span class="lvl lv' + (i + 1) + '">' + t.lv + '</span>' +
        '<span class="nm">' + t.name + '<em>邀请 ' + t.num + ' 人</em></span>' +
        '<span class="' + stateCls + '">' + stateTxt + '</span>' +
        '<span class="perks">' + perks + '</span>' +
        '</div>';
    }).join('');
  }

  function progHtml() {
    var v = view();
    if (!v.verified) return '';
    var next = v.nextIdx < 0 ? null : TIERS[v.nextIdx];
    var goal = next ? next.num : TIERS[TIERS.length - 1].num;
    var pct = Math.min(100, Math.round(v.invited / goal * 100));
    var right = next ? ('还差 ' + (next.num - v.invited) + ' 人升 ' + next.lv) : (v.qualified ? '已达合伙人门槛' : '');
    return '<div class="prog"><div class="row"><span>已邀请 <b>' + v.invited + '</b> 人</span>' +
      '<span>' + right + '</span></div><div class="bar"><i data-w="' + pct + '"></i></div></div>';
  }

  function qrHtml() {
    var v = view();
    var cfg = state.cfg || {};
    var group = cfg.group_qr, pay = cfg.pay_qr;
    var price = cfg.pay_price || '999';
    var cells = '';
    if (group) {
      cells += '<div class="qrbox"><img src="' + API + group + '" alt="推广微信群二维码">' +
        '<div class="cap">扫码进推广群<br>素材 · 政策 · 兑付</div></div>';
    }
    if (v.qualified && pay) {
      cells += '<div class="qrbox"><img src="' + API + pay + '" alt="合伙人支付二维码">' +
        '<div class="cap">扫码支付 ¥' + price + '<br>加入项目合伙人</div></div>';
    }
    var html = cells ? '<div class="qrrow">' + cells + '</div>' : '';
    if (!v.qualified) {
      html += '<div class="qrline">合伙人支付通道：邀请满 <b>' + PARTNER_MIN + ' 人</b>后在此开放（当前 <b>' +
        (v.verified ? v.invited : 0) + ' / ' + PARTNER_MIN + '</b>）。推广素材与兑付问题，加站长微信 <b>' + WECHAT + '</b>。</div>';
    } else if (!pay) {
      html += '<div class="qrline">你已达成合伙人门槛：支付码由后台配置中，请加站长微信 <b>' + WECHAT + '</b> 开通。</div>';
    }
    if (!html) {
      html = '<div class="qrline">推广群与合伙人支付码由后台配置中，先加站长微信 <b>' + WECHAT + '</b> 领取素材。</div>';
    }
    return html;
  }

  function formHtml() {
    var v = view();
    if (!v.login || v.verified) return '';
    return '<div class="rform" id="ep-form"><p>你已登录（' + v.nickname + '）。完成<b class="hl-pink">实名认证</b>后，系统立即生成专属邀请码并开始累计。</p>' +
      '<input id="ep-name" placeholder="真实姓名" autocomplete="name">' +
      '<input id="ep-idcard" placeholder="身份证号（15 或 18 位）" maxlength="18" inputmode="text">' +
      '<button class="vbtn" id="ep-verify" type="button">提交实名认证</button>' +
      '<div class="rmsg" id="ep-rmsg"></div></div>';
  }

  function shareText(v) {
    return '🎁 我在用「EcoJia 数字生态」工具，2027 科技风超好用！通过我的链接注册，双方都有奖励，还能开盲盒：\n' +
      (v.url || (LOGIN_URL + '?ref=')) + (v.code ? '\n我的专属邀请码：' + v.code : '');
  }

  function ctaHtml() {
    var v = view();
    if (!v.login) {
      return '<a class="cta" href="' + LOGIN_URL + '" target="_blank" rel="noopener">登录 / 注册，领取专属邀请码</a>' +
        '<div class="ctahint">30 秒注册 · 实名认证后即可推广 · 好友须经你的链接注册才计数</div>';
    }
    if (!v.verified) {
      return '<button class="cta" id="ep-goto" type="button">完成实名认证，解锁专属邀请码</button>' +
        '<div class="ctahint">已登录：' + v.nickname + ' · 认证后立即生成邀请码</div>';
    }
    return '<div class="codeRow"><span class="lb">我的邀请码</span>' +
      '<span class="val" id="ep-code">' + v.code + '</span>' +
      '<button class="cp" id="ep-copy" type="button">复制</button></div>' +
      '<div class="shareRow">' +
      '<button type="button" data-sh="wechat">微信文案</button>' +
      '<button type="button" data-sh="qq">QQ 文案</button>' +
      '<button type="button" data-sh="link">复制链接</button>' +
      '</div>';
  }

  function bind(root, mask) {
    var v = view();
    var cp = mask.querySelector('#ep-copy');
    if (cp) cp.addEventListener('click', function () { copy(v.code, '邀请码已复制：' + v.code); });
    var sh = mask.querySelectorAll('[data-sh]');
    for (var i = 0; i < sh.length; i++) {
      sh[i].addEventListener('click', function () {
        var kind = this.getAttribute('data-sh');
        if (kind === 'link') copy(v.url || (LOGIN_URL + '?ref=' + (v.code || '')), '推广链接已复制，发给好友即可');
        else if (kind === 'wechat') copy(shareText(v), '微信分享文案已复制，粘贴给好友即可');
        else copy(shareText(v), 'QQ 分享文案已复制，粘贴给好友即可');
      });
    }
    var go = mask.querySelector('#ep-goto');
    if (go) {
      go.addEventListener('click', function () {
        var f = mask.querySelector('#ep-form');
        if (!f) return;
        if (f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
        var nm = f.querySelector('#ep-name');
        if (nm) nm.focus();
      });
    }
    var vb = mask.querySelector('#ep-verify');
    if (vb) {
      vb.addEventListener('click', function () {
        var name = mask.querySelector('#ep-name').value.trim();
        var idc = mask.querySelector('#ep-idcard').value.trim();
        var msg = mask.querySelector('#ep-rmsg');
        if (!name || !idc) { msg.style.color = '#fb7185'; msg.textContent = '请填写姓名与身份证号'; return; }
        msg.style.color = '#f9a8d4';
        msg.textContent = '提交中…';
        vb.disabled = true;
        j('/api/promo/realname', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ real_name: name, real_idcard: idc })
        }).then(function (d) {
          vb.disabled = false;
          if (d.ok) { toast(d.msg || '实名认证成功'); refresh(); }
          else { msg.style.color = '#fb7185'; msg.textContent = d.msg || '认证失败，请核对信息'; }
        });
      });
    }
  }

  function render(root) {
    var mask = root.querySelector('.mask');
    if (!mask) return;
    mask.querySelector('.dyn-tiers').innerHTML = tierHtml();
    mask.querySelector('.dyn-prog').innerHTML = progHtml();
    mask.querySelector('.dyn-qr').innerHTML = qrHtml();
    mask.querySelector('.dyn-form').innerHTML = formHtml();
    mask.querySelector('.dyn-cta').innerHTML = ctaHtml();
    // 进度条宽度不能写在 HTML 的 style 属性里（CSP style-src 无 unsafe-inline 会拦），
    // 改成渲染后用 CSSOM 赋值：进度值放在 data-w，这里一次性写回
    var bar = mask.querySelector('.dyn-prog .bar i');
    if (bar) {
      var w = parseFloat(bar.getAttribute('data-w') || '0');
      bar.style.width = (isFinite(w) ? Math.max(0, Math.min(100, w)) : 0) + '%';
    }
    bind(root, mask);
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

  /* 手机端浮动按钮避让：优先落在不与页面可点元素重叠的底部位置，实在拥挤就临时隐藏 */
  function guardFab(fab) {
    var SEL = 'a[href],button,select,input,textarea,summary,[role="button"],#ebBall',
      POS = [92, 144, 196, 248, 300, 352], rects = null, raf = null, tid = 0;
    function collect() {
      rects = [];
      var y = window.pageYOffset || document.documentElement.scrollTop;
      var nodes = document.querySelectorAll(SEL);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i], cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        var b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) continue;
        rects.push(b.left, b.right, b.top + y, b.bottom + y);
      }
    }
    function place() {
      if (window.innerWidth > 640) {
        if (fab.style.bottom) fab.style.bottom = '';
        fab.classList.remove('mob-hide');
        return;
      }
      if (!rects) collect();
      var w = fab.offsetWidth || 46, h = fab.offsetHeight || 46,
        R = window.innerWidth - 10, L = R - w, vh = window.innerHeight,
        y = window.pageYOffset || document.documentElement.scrollTop;
      for (var k = 0; k < POS.length; k++) {
        var bt = y + vh - POS[k], tt = bt - h, ok = 1;
        for (var j = 0; j < rects.length; j += 4) {
          if (rects[j + 1] <= L + 1 || rects[j] >= R - 1 || rects[j + 3] <= tt + 1 || rects[j + 2] >= bt - 1) continue;
          ok = 0; break;
        }
        if (ok) { fab.style.bottom = POS[k] + 'px'; fab.classList.remove('mob-hide'); return; }
      }
      fab.classList.add('mob-hide');
    }
    function both() { collect(); place(); }
    function onRaf() {
      if (raf) return;
      raf = window.requestAnimationFrame ? requestAnimationFrame(function () { raf = null; place(); })
        : setTimeout(function () { raf = null; place(); }, 16);
    }
    function later() { clearTimeout(tid); tid = setTimeout(both, 240); }
    window.addEventListener('scroll', onRaf, { passive: true });
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    window.addEventListener('load', later);
    document.addEventListener('load', function (e) { if (e.target && e.target.tagName === 'IMG') later(); }, true);
    if (window.MutationObserver) new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    both();
    setTimeout(both, 220);
  }

  function build() {
    /* 手机小屏的登录页优先保证表单干净，不叠加浮动推广按钮 */
    if (window.innerWidth <= 640 && /^\/login\/?$/.test(location.pathname)) return;
    var host = document.createElement('div');
    host.id = 'ecoPromoteHost';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none !important;z-index:2147483600;';
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = window.ecjStyle ? window.ecjStyle() : document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    var fab = document.createElement('button');
    fab.className = 'fab';
    fab.setAttribute('aria-label', '推广有惊喜 · 大使招募');
    fab.innerHTML = '<span class="pulse"></span><span>推广有惊喜</span>';
    root.appendChild(fab);
    guardFab(fab);
    /* 与生态智能体面板互斥：面板打开时暂时藏起推广球 */
    document.addEventListener('eco:panel', function (e) {
      fab.classList.toggle('parked', !!e.detail);
    });

    var mask = null;
    function open() {
      if (mask) return;
      mask = document.createElement('div');
      mask.className = 'mask';
      mask.innerHTML =
        '<div class="card" role="dialog" aria-modal="true" aria-label="推广有惊喜 大使招募">' +
        '<button class="x" aria-label="关闭" type="button">✕</button>' +
        '<div class="head">' +
          '<div class="kick">Ambassador Program</div>' +
          '<div class="h1">推广有惊喜 · 大使招募</div>' +
          '<div class="sub">实名认证后生成专属邀请码，好友经你的链接注册即计入，达标由后台开通权益。</div>' +
        '</div>' +
        '<div class="bodymain">' +
        '<div class="body">' +
          '<div class="sec"><span class="t">阶梯权益</span><span class="tag">LV 1 → 4 · 下滑看二维码</span></div>' +
          '<div class="dyn-tiers"></div>' +
          '<div class="dyn-prog"></div>' +
          '<div class="dyn-qr"></div>' +
          '<div class="dyn-form"></div>' +
          '<div class="rules">规则：好友必须通过你的链接或邀请码注册才计入你名下，否则视为网站自然获客；' +
          '盲盒为工具 VIP 兑换券，由后台在达标后开通；¥999 合伙人权益与结算方式详询站长微信 <b>' + WECHAT + '</b>。</div>' +
        '</div>' +
      '</div>' +
        '<div class="foot dyn-cta"></div>' +
        '</div>';
      root.appendChild(mask);
      mask.addEventListener('click', function (e) {
        if (e.target === mask || e.target.classList.contains('x')) close();
      });
      render(root);   // 先用未登录视图占位，避免打开瞬间白屏
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
