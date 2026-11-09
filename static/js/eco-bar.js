/* ============================================================
   生态栏 eco-bar.js · 数字生态家园统一注入组件 V2.0
   作者：军哥懂保（微信：xunijiayuan）
   能力：返回首页 + 登录状态 + AI智能体「小鸽子」悬浮球/浮窗对话
   V2.0（商业级改版）：
    1. 正文 13.5→14px、行高 1.85，中文小字不再发虚；
    2. 「助手能做什么」与「产品是什么」分开：默认只展示能力入口，产品介绍收进「关于」浮层；
    3. 输入框上方常驻常用问题 chips，并加「试试这样问」标签；
    4. 发送键改为紫金渐变圆形，与站内星空紫金统一；
    5. 浮窗改为半透明模糊 + 双层阴影，与页面星空拉开层次；
    6. 浮窗避让顶部导航（顶边 ≥ 76px），手机端改为底部抽屉，可关闭、可滚动。
   用法：<script src="/eco-bar.js" defer></script>
   ============================================================ */
(function () {
  "use strict";
  window.__ecoBarVer = "20261108c";
  if (window.__ecoBarLoaded) return; window.__ecoBarLoaded = true;
  // iframe 内不渲染（避免外壳页+内嵌页出现两套组件）
  if (window.self !== window.top) return;

  var HOST = location.hostname;
  // 生态域名内 → 统一调门户API；本地/其他环境 → 同源调用（门户自己挂的eco-bar）
  var PORTAL = /(^|\.)ecojia\.cn$/.test(HOST)
    ? (HOST === "ecojia.cn" || HOST === "www.ecojia.cn" ? location.origin : "https://ecojia.cn")
    : location.origin;
  var SID_KEY = "eco_agent_sid", HIST_KEY = "eco_agent_cache";
  var isMobile = function () { return window.innerWidth <= 900; };
  var TOP_SAFE = 76; // 顶部导航 64px + 余量，浮窗不再压住导航

  function getSid() {
    var s = localStorage.getItem(SID_KEY);
    if (!s) { s = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(SID_KEY, s); }
    return s;
  }

  /* ---------- 样式：星空紫金（对齐 ecojia.cn 主题变量） ---------- */
  var css = `
#ecoBarWrap,#ecoBarWrap *{box-sizing:border-box;margin:0;padding:0;font-family:"HarmonyOS Sans SC","MiSans","PingFang SC","Microsoft YaHei",sans-serif}
#ecoBarWrap{position:relative;z-index:990}
/* —— 面板内快捷入口条（返回首页 + 登录/注册） —— */
.eb-quick{display:flex;gap:9px;padding:10px 14px;border-bottom:1px solid rgba(192,132,252,.16);
 background:linear-gradient(90deg,rgba(192,132,252,.08),transparent 70%)}
.eb-qbtn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:36px;border-radius:11px;
 font-size:12.5px;color:#e6d9f7;text-decoration:none;letter-spacing:.4px;cursor:pointer;
 background:rgba(255,255,255,.05);border:1px solid rgba(192,132,252,.26);transition:.2s}
.eb-qbtn:hover{background:rgba(192,132,252,.16);border-color:rgba(244,114,182,.5);transform:translateY(-1px)}
.eb-qbtn svg{width:14px;height:14px;stroke:#f9a8d4;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.eb-qbtn .eb-dot{width:8px;height:8px;border-radius:50%;background:#6ee7b7;box-shadow:0 0 8px #6ee7b7;flex-shrink:0;animation:ebDotPulse 2s ease-in-out infinite}
.eb-qbtn.off .eb-dot{background:#8a819c;box-shadow:none;animation:none}
@keyframes ebDotPulse{0%,100%{box-shadow:0 0 6px #6ee7b7}50%{box-shadow:0 0 14px #6ee7b7}}
.eb-qbtn .eb-role{font-size:10px;color:#f9a8d4;background:rgba(244,114,182,.14);padding:1px 7px;border-radius:999px}
/* —— 悬浮球 —— */
.eb-ball{position:fixed;right:22px;bottom:calc(24px + env(safe-area-inset-bottom,0px));width:62px;height:62px;border-radius:50%;cursor:grab;z-index:9991;
 display:flex;align-items:center;justify-content:center;flex-direction:column;
 background:radial-gradient(circle at 32% 28%,#3c2550,#1a1025 72%);
 border:1.5px solid rgba(192,132,252,.7);box-shadow:0 8px 26px rgba(0,0,0,.5),0 0 24px rgba(192,132,252,.32);
 transition:box-shadow .28s,opacity .28s,transform .28s;animation:ebBreath 3.2s ease-in-out infinite;
 touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.eb-ball:hover{transform:scale(1.08)}
.eb-ball.dragging{cursor:grabbing;animation:none;transform:scale(1.12);box-shadow:0 12px 38px rgba(0,0,0,.6),0 0 38px rgba(244,114,182,.55)}
.eb-ball.snap-x{transition:left .35s cubic-bezier(.34,1.4,.64,1),right .35s cubic-bezier(.34,1.4,.64,1),top .2s,bottom .2s}
.eb-ball.snap-y{transition:top .35s cubic-bezier(.34,1.4,.64,1),bottom .35s cubic-bezier(.34,1.4,.64,1),left .2s,right .2s}
.eb-ball .eb-ai{font-size:17px;font-weight:800;letter-spacing:1px;
 background:linear-gradient(135deg,#f9a8d4,#c084fc,#fbbf24);-webkit-background-clip:text;background-clip:text;color:transparent}
.eb-ball .eb-sub{font-size:9px;color:#c3b0dd;letter-spacing:1.2px;margin-top:1px}
@keyframes ebBreath{0%,100%{box-shadow:0 8px 26px rgba(0,0,0,.5),0 0 16px rgba(192,132,252,.24)}50%{box-shadow:0 8px 30px rgba(0,0,0,.5),0 0 36px rgba(244,114,182,.5)}}
.eb-ball.hide{transform:scale(0);opacity:0;pointer-events:none}
.eb-ball.wake{animation:ebWake .5s ease-in-out 2}
@keyframes ebWake{0%,100%{transform:scale(1)}50%{transform:scale(1.16)}}
/* —— 对话浮窗：半透明模糊 + 双层阴影 —— */
.eb-panel{position:fixed;right:22px;bottom:calc(24px + env(safe-area-inset-bottom,0px));width:400px;max-width:calc(100vw - 24px);
 height:min(548px,calc(100vh - 96px));max-height:calc(100vh - 96px);
 border-radius:20px;overflow:hidden;display:flex;flex-direction:column;z-index:9995;
 background:linear-gradient(168deg,rgba(34,19,51,.97),rgba(12,7,20,.985));
 border:1px solid rgba(192,132,252,.34);backdrop-filter:blur(30px) saturate(140%);-webkit-backdrop-filter:blur(30px) saturate(140%);
 box-shadow:0 32px 80px rgba(5,2,12,.72),0 0 0 1px rgba(255,255,255,.05) inset,0 0 60px rgba(192,132,252,.16);
 transform-origin:bottom right;transition:transform .3s cubic-bezier(.34,1.4,.64,1),opacity .22s}
.eb-panel.hide{transform:scale(.14) translateY(40%);opacity:0;pointer-events:none}
/* 面板打开 → 主内容让位：给 #main 加单侧内边距，产品卡不再被面板压住 */
body.eb-push #main{transition:padding-left .3s cubic-bezier(.22,.61,.36,1),padding-right .3s cubic-bezier(.22,.61,.36,1)}
.eb-head{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid rgba(192,132,252,.18);
 background:linear-gradient(90deg,rgba(192,132,252,.12),transparent 62%)}
.eb-logo{width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;
 background:linear-gradient(135deg,#f472b6,#c084fc);color:#fff;font-weight:800;font-size:15px;
 box-shadow:0 6px 18px rgba(244,114,182,.36)}
.eb-title{flex:1;min-width:0}
.eb-title b{display:block;font-size:15px;color:#f7edff;letter-spacing:.6px;line-height:1.4}
.eb-title span{font-size:11px;color:#a99bc0;letter-spacing:.3px}
.eb-hbtn{width:32px;height:32px;border-radius:9px;border:1px solid rgba(192,132,252,.34);background:rgba(255,255,255,.07);
 color:#efe6ff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;flex:none}
.eb-hbtn:hover{background:rgba(192,132,252,.2);border-color:rgba(244,114,182,.45)}
.eb-hbtn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.eb-msgs{flex:1 1 auto;min-height:0;overflow-y:auto;padding:15px 14px 8px;display:flex;flex-direction:column;gap:11px;scroll-behavior:smooth}
.eb-msgs::-webkit-scrollbar{width:5px}
.eb-msgs::-webkit-scrollbar-thumb{background:rgba(192,132,252,.3);border-radius:4px}
.eb-msg{max-width:88%;padding:11px 14px;border-radius:15px;font-size:14px;line-height:1.85;word-break:break-word;white-space:pre-wrap}
.eb-msg.user{align-self:flex-end;color:#fff;border-bottom-right-radius:5px;
 background:linear-gradient(135deg,#f472b6,#c084fc);box-shadow:0 6px 18px rgba(244,114,182,.26)}
.eb-msg.ai{align-self:flex-start;color:#ece3f7;background:rgba(255,255,255,.06);border:1px solid rgba(192,132,252,.2);
 border-left:3px solid rgba(192,132,252,.75);border-bottom-left-radius:5px;box-shadow:0 4px 14px rgba(0,0,0,.32)}
.eb-msg.ai a{color:#f9a8d4;text-decoration:underline;text-underline-offset:2px}
.eb-msg.ai b{color:#ffd8ef}
/* —— 能力入口（默认展示，替代大段产品介绍） —— */
.eb-welcome{align-self:stretch;display:flex;flex-direction:column;gap:9px;padding:2px 0 2px}
.eb-wt{font-size:13.5px;font-weight:700;color:#f7edff;letter-spacing:.3px}
.eb-ws{font-size:11.5px;color:#a99bc0;line-height:1.75}
.eb-caps{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:1px}
.eb-cap{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:11px;cursor:pointer;text-align:left;
 font-family:inherit;background:rgba(255,255,255,.05);border:1px solid rgba(192,132,252,.22);transition:.18s}
.eb-cap:hover{background:rgba(192,132,252,.15);border-color:rgba(244,114,182,.5);transform:translateY(-1px)}
.eb-cap .ic{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;
 background:linear-gradient(135deg,rgba(244,114,182,.26),rgba(192,132,252,.26));flex:none}
.eb-cap .tx b{display:block;font-size:12px;color:#f3edfa;font-weight:700;line-height:1.5}
.eb-cap .tx span{display:block;font-size:10.5px;color:#a99bc0;line-height:1.45;margin-top:1px}
.eb-cards{display:flex;flex-direction:column;gap:8px;align-self:stretch}
.eb-card{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:13px;text-decoration:none;
 background:rgba(255,255,255,.05);border:1px solid rgba(192,132,252,.24);transition:.2s}
.eb-card:hover{background:rgba(192,132,252,.16);border-color:rgba(244,114,182,.55)}
.eb-card .n{font-size:10px;color:#a99bc0;letter-spacing:1px}
.eb-card .t{flex:1;font-size:13px;color:#f7edff}
.eb-card .s{font-size:10.5px;color:#6ee7b7}
.eb-typing{align-self:flex-start;display:flex;gap:5px;padding:12px 16px}
.eb-typing i{width:7px;height:7px;border-radius:50%;background:#c084fc;animation:ebTp 1.1s infinite}
.eb-typing i:nth-child(2){animation-delay:.18s}.eb-typing i:nth-child(3){animation-delay:.36s}
@keyframes ebTp{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
/* —— 快捷问题 chips：常驻输入框上方 —— */
.eb-chips-wrap{flex:none;padding:6px 14px 8px;border-top:1px solid rgba(192,132,252,.1)}
.eb-chips-lb{display:flex;align-items:center;gap:6px;font-size:10px;color:#8f83a8;letter-spacing:.6px;margin-bottom:6px}
.eb-chips-lb::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(192,132,252,.25),transparent)}
.eb-chips{display:flex;gap:7px;flex-wrap:wrap;max-height:96px;overflow-y:auto;scroll-behavior:smooth}
.eb-chips::-webkit-scrollbar{width:4px}
.eb-chips::-webkit-scrollbar-thumb{background:rgba(192,132,252,.3);border-radius:4px}
.eb-chip{padding:6px 11px;border-radius:999px;font-size:12px;line-height:1.5;color:#e6d9f7;cursor:pointer;
 background:rgba(255,255,255,.055);border:1px solid rgba(192,132,252,.26);transition:.18s;white-space:nowrap}
.eb-chip:hover{background:rgba(192,132,252,.2);border-color:rgba(244,114,182,.45);color:#fff}
.eb-more{color:#f9a8d4;border-color:rgba(244,114,182,.45);background:rgba(244,114,182,.1);
 font-weight:600;display:inline-flex;gap:4px;align-items:center}
.eb-more .eb-more-arrow{font-size:9px;line-height:1}
/* —— 输入区 —— */
.eb-input{flex:none;display:flex;gap:9px;padding:11px 14px;border-top:1px solid rgba(192,132,252,.14)}
.eb-input input{flex:1;min-width:0;height:44px;border-radius:13px;border:1px solid rgba(192,132,252,.28);outline:none;
 background:rgba(255,255,255,.06);color:#f7edff;font-size:14px;padding:0 15px;transition:.2s}
.eb-input input:focus{border-color:rgba(244,114,182,.65);box-shadow:0 0 0 3px rgba(244,114,182,.12)}
.eb-input input::placeholder{color:#8f83a8}
.eb-send{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);cursor:pointer;flex-shrink:0;
 background:linear-gradient(135deg,#f472b6,#c084fc);display:flex;align-items:center;justify-content:center;
 box-shadow:0 8px 22px rgba(244,114,182,.34);transition:transform .2s,box-shadow .2s}
.eb-send:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(244,114,182,.46)}
.eb-send:active{transform:scale(.95)}
.eb-send svg{width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
.eb-foot{flex:none;padding:6px 14px 10px;font-size:10px;color:#7f7398;text-align:center;letter-spacing:.3px}
.eb-foot .eb-moreinfo{color:#a99bc0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.eb-foot .eb-moreinfo:hover{color:#f9a8d4}
/* —— 名词解析 / 关于浮层 —— */
.eb-dict{position:absolute;top:112px;right:12px;width:268px;max-height:70%;overflow-y:auto;padding:14px 16px;border-radius:14px;display:none;z-index:9;
 background:rgba(24,14,36,.97);border:1px solid rgba(192,132,252,.36);box-shadow:0 18px 46px rgba(0,0,0,.6)}
.eb-dict.show{display:block}
.eb-dict h4{font-size:12.5px;color:#f9a8d4;margin-bottom:7px;letter-spacing:.6px}
.eb-dict h5{font-size:11.5px;color:#c084fc;margin:10px 0 5px;letter-spacing:.4px}
.eb-dict p{font-size:11.5px;color:#c3b7d4;line-height:1.75;margin-bottom:6px}
.eb-dict p b{color:#f7edff}
/* —— 首次引导气泡 —— */
.eb-tip{position:fixed;right:94px;bottom:36px;max-width:236px;padding:12px 16px;border-radius:15px;z-index:2147483001;
 font-size:12.5px;line-height:1.7;color:#fff;background:linear-gradient(135deg,#f472b6,#c084fc);
 border-bottom-right-radius:4px;box-shadow:0 12px 34px rgba(244,114,182,.34);cursor:pointer;
 animation:ebTipIn .5s cubic-bezier(.34,1.56,.64,1)}
@keyframes ebTipIn{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
.eb-tip b{display:block;margin-bottom:2px;font-size:13px}
/* —— 移动端：底部抽屉，可关闭、可滚动、不遮死内容 —— */
@media (max-width:900px){
 .eb-ball{right:14px;bottom:calc(84px + env(safe-area-inset-bottom,0px));width:56px;height:56px}
 .eb-panel{right:0;left:0;bottom:0;width:100%;max-width:100%;
  height:auto;max-height:calc(100vh - 12px);border-radius:18px 18px 0 0;transform-origin:bottom center}
 .eb-head{padding:12px 13px}
 .eb-hbtn{width:36px;height:36px}
 .eb-msgs{padding:13px 12px 6px}
 .eb-cap{padding:8px 9px}
 .eb-tip{right:76px;bottom:calc(92px + env(safe-area-inset-bottom,0px));max-width:196px}
 .eb-input{padding-bottom:calc(11px + env(safe-area-inset-bottom,0px))}
}
/* 平板/窄桌面：推广球在这一档停靠得更低，把智能体球抬高让开，避免互相压住 */
@media (min-width:641px) and (max-width:900px){
 .eb-ball{bottom:calc(142px + env(safe-area-inset-bottom,0px))}
 .eb-tip{bottom:calc(150px + env(safe-area-inset-bottom,0px))}
}
/* —— 浅色页面自适应：白金主题（与深色紫金同源高级感） —— */
#ecoBarWrap.eb-light .eb-quick{border-bottom-color:rgba(180,140,40,.18);background:linear-gradient(90deg,rgba(212,175,55,.08),transparent 70%)}
#ecoBarWrap.eb-light .eb-qbtn{color:#6b5a26;background:rgba(212,175,55,.1);border-color:rgba(180,140,40,.35)}
#ecoBarWrap.eb-light .eb-qbtn:hover{background:rgba(212,175,55,.22);border-color:rgba(180,140,40,.6)}
#ecoBarWrap.eb-light .eb-qbtn svg{stroke:#a8842c}
#ecoBarWrap.eb-light .eb-ball{background:radial-gradient(circle at 32% 28%,#fffdf6,#f6ecd4 72%);
 border-color:rgba(180,140,40,.6);box-shadow:0 6px 22px rgba(120,90,20,.22),0 0 20px rgba(212,175,55,.3)}
#ecoBarWrap.eb-light .eb-ball .eb-ai{background:linear-gradient(135deg,#a8842c,#d4af37,#8a6d1f);-webkit-background-clip:text;background-clip:text;color:transparent}
#ecoBarWrap.eb-light .eb-ball .eb-sub{color:#a08840}
#ecoBarWrap.eb-light .eb-panel{background:linear-gradient(168deg,rgba(255,253,248,.95),rgba(248,242,230,.97));
 border-color:rgba(180,140,40,.4);box-shadow:0 32px 80px rgba(120,90,20,.3),0 0 0 1px rgba(255,255,255,.6) inset,0 0 46px rgba(212,175,55,.16)}
#ecoBarWrap.eb-light .eb-head{border-bottom-color:rgba(180,140,40,.22);background:linear-gradient(90deg,rgba(212,175,55,.14),transparent 62%)}
#ecoBarWrap.eb-light .eb-title b{color:#3d2f0c}
#ecoBarWrap.eb-light .eb-title span{color:#9c8a52}
#ecoBarWrap.eb-light .eb-hbtn{border-color:rgba(180,140,40,.35);background:rgba(212,175,55,.1);color:#8a6d1f}
#ecoBarWrap.eb-light .eb-hbtn:hover{background:rgba(212,175,55,.25)}
#ecoBarWrap.eb-light .eb-msg.user{color:#3a2e08;box-shadow:0 4px 14px rgba(212,175,55,.35)}
#ecoBarWrap.eb-light .eb-msg.ai{color:#4d4433;background:rgba(255,255,255,.78);border-color:rgba(180,140,40,.35);border-left:3px solid #c9a227;box-shadow:0 3px 10px rgba(120,90,20,.1)}
#ecoBarWrap.eb-light .eb-msg.ai a{color:#a8842c}
#ecoBarWrap.eb-light .eb-msg.ai b{color:#7a5f16}
#ecoBarWrap.eb-light .eb-wt{color:#3d2f0c}
#ecoBarWrap.eb-light .eb-ws{color:#8b7d58}
#ecoBarWrap.eb-light .eb-cap{background:rgba(212,175,55,.09);border-color:rgba(180,140,40,.3)}
#ecoBarWrap.eb-light .eb-cap:hover{background:rgba(212,175,55,.2);border-color:rgba(180,140,40,.6)}
#ecoBarWrap.eb-light .eb-cap .tx b{color:#3d2f0c}
#ecoBarWrap.eb-light .eb-cap .tx span{color:#8b7d58}
#ecoBarWrap.eb-light .eb-card{background:rgba(212,175,55,.08);border-color:rgba(180,140,40,.3)}
#ecoBarWrap.eb-light .eb-card:hover{background:rgba(212,175,55,.18)}
#ecoBarWrap.eb-light .eb-card .t{color:#3d2f0c}
#ecoBarWrap.eb-light .eb-card .n{color:#9c8a52}
#ecoBarWrap.eb-light .eb-card .s{color:#3d9b6d}
#ecoBarWrap.eb-light .eb-chips-lb{color:#9c8a52}
#ecoBarWrap.eb-light .eb-chips-lb::after{background:linear-gradient(90deg,rgba(180,140,40,.3),transparent)}
#ecoBarWrap.eb-light .eb-chip{color:#6b5a26;background:rgba(255,255,255,.7);border-color:rgba(180,140,40,.35)}
#ecoBarWrap.eb-light .eb-chip:hover{background:rgba(212,175,55,.25);color:#3d2f0c}
#ecoBarWrap.eb-light .eb-input{border-top-color:rgba(180,140,40,.18)}
#ecoBarWrap.eb-light .eb-input input{background:rgba(255,255,255,.85);border-color:rgba(180,140,40,.35);color:#3d2f0c}
#ecoBarWrap.eb-light .eb-input input::placeholder{color:#b0a070}
#ecoBarWrap.eb-light .eb-foot{color:#a89a6c}
#ecoBarWrap.eb-light .eb-foot .eb-moreinfo{color:#8b7d58}
#ecoBarWrap.eb-light .eb-dict{background:rgba(255,253,248,.98);border-color:rgba(180,140,40,.45);box-shadow:0 18px 46px rgba(120,90,20,.22)}
#ecoBarWrap.eb-light .eb-dict h4{color:#a8842c}
#ecoBarWrap.eb-light .eb-dict h5{color:#b8860b}
#ecoBarWrap.eb-light .eb-dict p{color:#6b5d3a}
#ecoBarWrap.eb-light .eb-dict p b{color:#3d2f0c}
#ecoBarWrap.eb-light .eb-typing i{background:#c9a227}
`;
  var st = window.ecjStyle ? window.ecjStyle() : document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var wrap = document.createElement("div"); wrap.id = "ecoBarWrap";
  wrap.innerHTML = `
<div class="eb-ball" id="ebBall" title="生态智能体·小鸽子" role="button" aria-label="打开生态智能体小鸽子">
 <span class="eb-ai">AI</span><span class="eb-sub">小鸽子</span></div>
<div class="eb-panel hide" id="ebPanel" role="dialog" aria-label="生态智能体小鸽子对话面板">
 <div class="eb-head">
  <div class="eb-logo">鸽</div>
  <div class="eb-title"><b>生态智能体 · 小鸽子</b><span>找工具 · 查故障 · 答疑问</span></div>
  <button class="eb-hbtn" id="ebDict" title="名词解析与关于（大白话）" aria-label="名词解析">?</button>
  <button class="eb-hbtn" id="ebClear" title="清空本会话记录" aria-label="清空记录">
   <svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg></button>
  <button class="eb-hbtn" id="ebFold" title="收起为悬浮球" aria-label="收起">
   <svg viewBox="0 0 24 24"><path d="M6 15l6 6 6-6"/><path d="M6 6l6 6 6-6" opacity=".35"/></svg></button>
 </div>
 <div class="eb-quick">
  <a class="eb-qbtn" id="ebHome" href="${PORTAL}" title="返回数字生态家园门户首页">
   <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>
   <span>返回首页</span></a>
  <a class="eb-qbtn off" id="ebAuth" href="${PORTAL}/login" title="登录生态统一账号">
   <i class="eb-dot"></i><span id="ebAuthTxt">登录 / 注册</span></a>
 </div>
 <div class="eb-dict" id="ebDictBox">
  <h4>关于 · 大白话</h4>
  <p><b>小鸽子是什么</b>：站长的 AI 助手，只做三件事——帮你找工具、查页面打不开的原因、回答使用问题。</p>
  <p><b>它不是产品介绍</b>：生态里的产品（火星平面等）请到「产品矩阵」页看，这里只给入口和用法。</p>
  <h5>名词解析</h5>
  <p><b>悬浮球</b>：右下角这个紫金色小球，点一下就能跟我说话。</p>
  <p><b>浮窗</b>：就是现在这个对话窗口，不用跳转页面。</p>
  <p><b>生态</b>：军哥做的所有网站和工具的统称。</p>
  <p><b>健康检查</b>：我从服务器上真实访问一次那个工具，看它是好是坏。</p>
  <p><b>许愿墙</b>：给军哥提需求的地方，被采纳就会开发。</p>
 </div>
 <div class="eb-msgs" id="ebMsgs"></div>
 <div class="eb-chips-wrap">
  <div class="eb-chips-lb">试试这样问</div>
  <div class="eb-chips" id="ebChips"></div>
 </div>
 <div class="eb-input">
  <input id="ebInput" placeholder="问点什么…如：视频转PPT在哪？" maxlength="500" aria-label="输入问题" />
  <button class="eb-send" id="ebSend" title="发送" aria-label="发送">
   <svg viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
 </div>
 <div class="eb-foot">军哥懂保 · 微信 xunijiayuan · <span class="eb-moreinfo" id="ebAbout">关于小鸽子</span></div>
</div>`;
  document.body.appendChild(wrap);

  /* ---------- 主题自适应：检测页面背景明暗，浅色页切换白金主题 ---------- */
  (function () {
    function lum(rgb) {
      var m = rgb.match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return null;
      return (m[1] * 299 + m[2] * 587 + m[3] * 114) / 1000;
    }
    var el = document.body, bg = "", deep = 0;
    while (el && deep < 4) {
      var c = getComputedStyle(el).backgroundColor;
      if (c && c !== "transparent" && !/rgba\([^)]*,\s*0\s*\)/.test(c)) { bg = c; break; }
      el = el.parentElement; deep++;
    }
    if (!bg) { var ch = getComputedStyle(document.documentElement).backgroundColor; if (ch) bg = ch; }
    var L = bg ? lum(bg) : null;
    if (L !== null && L > 140) wrap.classList.add("eb-light");   // 浅色页面 → 白金
    else if (L === null && matchMedia("(prefers-color-scheme: light)").matches) wrap.classList.add("eb-light");
  })();

  var ball = document.getElementById("ebBall"), panel = document.getElementById("ebPanel"),
      msgs = document.getElementById("ebMsgs"), input = document.getElementById("ebInput"),
      chips = document.getElementById("ebChips"), dictBox = document.getElementById("ebDictBox");

  /* ---------- 悬浮球拖拽（三端：鼠标/触摸/触控笔，Pointer Events） ---------- */
  var POS_KEY = "eco_ball_pos";
  function restoreBallPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      // 0/0 是球隐藏（display:none）时量出来的脏值，不能当作「用户位置」恢复
      if (!p || !isFinite(p.x) || !isFinite(p.y) || (p.x === 0 && p.y === 0)) return;
      var vw = window.innerWidth, vh = window.innerHeight;
      var bw = ball.offsetWidth || 54, bh = ball.offsetHeight || 54;
      // 确保恢复的位置在视口内
      var x = Math.max(4, Math.min(vw - bw - 4, p.x));
      var y = Math.max(4, Math.min(vh - bh - 4, p.y));
      ball.style.right = "auto"; ball.style.bottom = "auto";
      ball.style.left = x + "px"; ball.style.top = y + "px";
    } catch (e) {}
  }
  function saveBallPos() {
    var r = ball.getBoundingClientRect();
    // 球被避让层隐藏 / 尚未布局时 rect 全 0，写进去会变成「用户把它拖到左上角」的脏记录
    if (r.width < 10 || r.height < 10 || (r.left === 0 && r.top === 0)) return;
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
  }
  function snapToEdge() {
    var r = ball.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var cx = r.left + r.width / 2;
    // 限制在视口内
    var nx = Math.max(8, Math.min(vw - r.width - 8, r.left));
    var ny = Math.max(8, Math.min(vh - r.height - 8, r.top));
    ball.style.left = nx + "px"; ball.style.top = ny + "px";
    // 横向吸附到最近边缘
    ball.classList.add("snap-x");
    if (cx < vw / 2) ball.style.left = "12px"; else ball.style.left = (vw - r.width - 12) + "px";
    setTimeout(function () {
      ball.classList.remove("snap-x");
      // 先交给避让层做纵向微调（贴边后也不压可点元素与正文），再记录最终位置
      if (window.ecoBallPlace) window.ecoBallPlace();
      saveBallPos();
    }, 360);
  }
  // 双击（含双击触摸）回默认位置：清掉记忆 → 交回避让层重新找位
  var tapTimer = null;
  function resetBallPos() {
    try { localStorage.removeItem(POS_KEY); } catch (e) {}
    ball.classList.remove("snap-x");
    ball.classList.remove("dragging");
    ball.style.left = ""; ball.style.top = "";
    ball.style.right = ""; ball.style.bottom = "";
    if (window.ecoBallPlace) window.ecoBallPlace();
  }
  // 单击开面板 / 双击复位：单击延后 240ms 再开，留出第二击的判定窗口
  // （不能第一击就开面板：面板打开会把球隐藏，第二击必然打空，双击永远判不出来）
  function tapOnce() {
    if (tapTimer) {
      clearTimeout(tapTimer); tapTimer = null;
      resetBallPos();
      return;
    }
    tapTimer = setTimeout(function () { tapTimer = null; openPanel(); }, 240);
  }
  /* 面板定位 + 内容让位（2026-11-08 修订）
     · 手机与竖屏平板（≤900px）：底部抽屉，可关闭可滚动，不改回浮层
     · 桌面：贴悬浮球浮出，同时给 #main 加单侧内边距把内容推开，
       产品页左列 / 首页卡片不再被面板整块压住
     · 打开、缩放窗口、加载完成都会重算，不只在初次加载算一次 */
  var mainBox = document.getElementById("main");
  function clearPush() {
    if (mainBox) { mainBox.style.paddingLeft = ""; mainBox.style.paddingRight = ""; }
    document.body.classList.remove("eb-push");
  }
  function applyPush(px, pw) {
    if (!mainBox) return;
    var gap = 14, vw = window.innerWidth;
    var r = mainBox.getBoundingClientRect();
    mainBox.style.paddingLeft = ""; mainBox.style.paddingRight = "";
    if (px + pw / 2 > vw / 2) {
      // 面板在右半屏 → 内容右侧让位
      var need = r.right - (px - gap);
      if (need > 0) mainBox.style.paddingRight = Math.ceil(need) + "px";
    } else {
      // 悬浮球被拖到左半屏 → 内容左侧让位
      var need2 = (px + pw + gap) - r.left;
      if (need2 > 0) mainBox.style.paddingLeft = Math.ceil(need2) + "px";
    }
    document.body.classList.add("eb-push");
  }

  function positionPanel() {
    // 浮窗跟随悬浮球位置（带边缘约束）；始终避开顶部导航
    var r = ball.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    // 桌面偏窄时同步收窄面板，避免把内容挤得太薄
    var pw = vw >= 1180 ? 400 : Math.min(360, Math.max(300, Math.round(vw * 0.34)));
    var ph = Math.min(548, vh - TOP_SAFE - 20);
    panel.style.maxHeight = "";
    if (isMobile()) {
      clearPush();
      // 手机端：底部抽屉高度随内容自适应（最多 72vh），内容多时抽屉内滚动
      panel.style.width = "100%"; panel.style.height = "auto";
      panel.style.maxHeight = Math.min(vh * 0.72, 600) + "px";
      panel.style.left = "0px"; panel.style.right = ""; panel.style.top = "auto"; panel.style.bottom = "0px";
      return;
    }
    panel.style.width = pw + "px"; panel.style.height = ph + "px";
    panel.style.left = ""; panel.style.right = ""; panel.style.top = ""; panel.style.bottom = "";
    var px, py;
    if (r.left + r.width / 2 < vw / 2) { px = r.left + r.width + 8; }
    else { px = r.left - pw - 8; }
    py = r.top + r.height / 2 - ph / 2;
    px = Math.max(8, Math.min(vw - pw - 8, px));
    py = Math.max(TOP_SAFE, Math.min(vh - ph - 12, py));
    panel.style.left = px + "px"; panel.style.top = py + "px";
    applyPush(px, pw);
  }

  // 拖拽状态变量
  var dragging = false, dragMoved = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

  // 经典拖拽模式：直接属性赋值，兼容性最好
  ball.onmousedown = function (e) {
    e = e || window.event;
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true; dragMoved = false;
    startX = e.clientX; startY = e.clientY;
    var rect = ball.getBoundingClientRect();
    origLeft = rect.left; origTop = rect.top;
    ball.style.right = "auto"; ball.style.bottom = "auto";
    ball.style.left = origLeft + "px"; ball.style.top = origTop + "px";
    ball.classList.add("dragging");
    if (e.preventDefault) e.preventDefault();
    return false;
  };
  // 用 addEventListener 避免覆盖页面自身的 document.onmousemove/onmouseup
  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragMoved = true;
    if (!dragMoved) return;
    var nx = origLeft + dx, ny = origTop + dy;
    var vw = window.innerWidth, vh = window.innerHeight;
    var bw = ball.offsetWidth, bh = ball.offsetHeight;
    nx = Math.max(4, Math.min(vw - bw - 4, nx));
    ny = Math.max(4, Math.min(vh - bh - 4, ny));
    ball.style.left = nx + "px"; ball.style.top = ny + "px";
    if (e.preventDefault) e.preventDefault();
  }, { passive: false });
  document.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    ball.classList.remove("dragging");
    if (dragMoved) { snapToEdge(); saveBallPos(); }
    else { tapOnce(); }
  });
  // 移动端触摸拖拽
  ball.ontouchstart = function (e) {
    e = e || window.event;
    var t = e.touches[0];
    dragging = true; dragMoved = false;
    startX = t.clientX; startY = t.clientY;
    var rect = ball.getBoundingClientRect();
    origLeft = rect.left; origTop = rect.top;
    ball.style.right = "auto"; ball.style.bottom = "auto";
    ball.style.left = origLeft + "px"; ball.style.top = origTop + "px";
    ball.classList.add("dragging");
    if (e.preventDefault) e.preventDefault();
    return false;
  };
  document.addEventListener("touchmove", function (e) {
    if (!dragging) return;
    var t = e.touches[0];
    var dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragMoved = true;
    if (!dragMoved) return;
    var nx = origLeft + dx, ny = origTop + dy;
    var vw = window.innerWidth, vh = window.innerHeight;
    var bw = ball.offsetWidth, bh = ball.offsetHeight;
    nx = Math.max(4, Math.min(vw - bw - 4, nx));
    ny = Math.max(4, Math.min(vh - bh - 4, ny));
    ball.style.left = nx + "px"; ball.style.top = ny + "px";
    if (e.preventDefault) e.preventDefault();
  }, { passive: false });
  document.addEventListener("touchend", function () {
    if (!dragging) return;
    dragging = false;
    ball.classList.remove("dragging");
    lastTouchAt = Date.now();
    if (dragMoved) { snapToEdge(); saveBallPos(); }
    else { tapOnce(); }
  });
  // 点击（非拖拽）：只做触摸合成点击的屏蔽，开面板/复位统一走 mouseup / touchend 的 tapOnce
  var lastTouchAt = 0;
  ball.onclick = function (e) {
    if (dragMoved) { if (e.preventDefault) e.preventDefault(); return false; }
    // 触摸后浏览器还会补发一次 click；双击复位时也不该再开面板
    if (Date.now() - lastTouchAt < 700) return false;
    return false;
  };

  // 恢复上次拖拽位置
  restoreBallPos();
  // 窗口尺寸变化时：球收回视口内；面板若开着，连同内容让位一起重算（拖动 / 缩放窗口都生效）
  var rzRaf = 0;
  function onViewportChange() {
    var r = ball.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (r.right > vw) ball.style.left = (vw - r.width - 8) + "px";
    if (r.bottom > vh) ball.style.top = (vh - r.height - 8) + "px";
    if (r.left < 0) ball.style.left = "8px";
    if (r.top < 0) ball.style.top = "8px";
    saveBallPos();
    if (!panel.classList.contains("hide")) positionPanel();
  }
  window.addEventListener("resize", function () {
    if (rzRaf) return;
    rzRaf = requestAnimationFrame(function () { rzRaf = 0; onViewportChange(); });
  });
  // 图片 / 字体加载完布局可能变化，面板开着再校正一次
  window.addEventListener("load", function () {
    if (!panel.classList.contains("hide")) positionPanel();
  });

  function notifyPanel(open) {
    try { document.dispatchEvent(new CustomEvent("eco:panel", { detail: open })); } catch (e) {}
  }
  function openPanel() {
    positionPanel();
    ball.classList.add("hide");
    panel.classList.remove("hide");
    ball.setAttribute("aria-expanded", "true");
    notifyPanel(true);
    input.focus();
    loadHistory();
    hideTip();
    // 展开动画后按真实布局再校正一次（含内容让位）
    requestAnimationFrame(function () {
      if (!panel.classList.contains("hide")) positionPanel();
    });
  }

  /* ---------- 悬浮球 ⇄ 浮窗 切换 ---------- */
  document.getElementById("ebFold").onclick = function () {
    panel.classList.add("hide");
    ball.classList.remove("hide");
    ball.setAttribute("aria-expanded", "false");
    notifyPanel(false);
    clearPush();
    // 收起后轻轻跳两下，提示入口还在
    ball.classList.remove("wake");
    void ball.offsetWidth;
    ball.classList.add("wake");
    setTimeout(function () { ball.classList.remove("wake"); }, 1100);
  };
  document.getElementById("ebDict").onclick = function (e) { e.stopPropagation(); dictBox.classList.toggle("show"); };
  document.getElementById("ebAbout").onclick = function (e) { e.stopPropagation(); dictBox.classList.add("show"); };
  panel.addEventListener("click", function (e) { if (!dictBox.contains(e.target) && e.target.id !== "ebDict" && e.target.id !== "ebAbout") dictBox.classList.remove("show"); });
  document.getElementById("ebClear").onclick = function () {
    fetch(PORTAL + "/api/agent/history", { method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: getSid() }) });
    localStorage.removeItem(HIST_KEY); msgs.innerHTML = ""; greet(); toastInline("记录已清空");
  };

  /* ---------- 首次引导气泡 ---------- */
  function hideTip() { var t = document.querySelector(".eb-tip"); if (t) t.remove(); localStorage.setItem("eco_tip_seen", "1"); }
  if (!localStorage.getItem("eco_tip_seen") && !/^\/login\/?$/.test(location.pathname)) {
    setTimeout(function () {
      if (!panel.classList.contains("hide")) return;   // 面板已打开就不再冒泡提示
      var tip = document.createElement("div"); tip.className = "eb-tip";
      tip.innerHTML = "<b>👋 我是小鸽子</b>找不到工具？页面打不开？点我直接问～";
      tip.onclick = function () { hideTip(); openPanel(); };
      document.body.appendChild(tip);
      setTimeout(hideTip, 12000);
    }, 2600);
  }

  /* ---------- 登录状态 ---------- */
  (function () {
    var el = document.getElementById("ebAuth");
    if (!el) return;
    fetch(PORTAL + "/api/auth/status", { credentials: "include" }).then(function (r) { return r.json(); }).then(function (d) {
      var txt = document.getElementById("ebAuthTxt");
      if (d.ok && d.login) {
        el.classList.remove("off");
        var name = (d.nickname || "用户").slice(0, 8);
        txt.textContent = name;
        if (d.role === "admin") txt.insertAdjacentHTML("afterend", '<span class="eb-role">管理</span>');
        el.href = PORTAL; el.title = "已登录：" + name + "，点击回门户";
      }
    }).catch(function () {});
  })();

  /* ---------- 消息渲染（简版 markdown） ---------- */
  function md(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|\n)[-*]\s+/g, "$1• ")
      .replace(/\n/g, "<br>");
  }
  function addMsg(role, text, cards) {
    var m = document.createElement("div"); m.className = "eb-msg " + role; m.innerHTML = md(text);
    msgs.appendChild(m);
    if (cards && cards.length) {
      var box = document.createElement("div"); box.className = "eb-cards";
      cards.forEach(function (c) {
        if (!c.url) return;
        var a = document.createElement("a"); a.className = "eb-card"; a.href = c.url; a.target = "_blank";
        a.innerHTML = '<span class="n">' + (c.no || "") + '</span><span class="t">' + c.name + '</span><span class="s">打开 →</span>';
        box.appendChild(a);
      });
      msgs.appendChild(box);
    }
    msgs.scrollTop = msgs.scrollHeight;
  }
  function toastInline(t) { addMsg("ai", "💡 " + t); }

  /* ---------- 能力入口：默认展示「能做什么」，产品介绍收进「关于」 ---------- */
  var CAPS = [
    { ic: "🧭", t: "找工具", s: "按用途帮你定位入口", q: "站里的工具都在哪里？怎么快速找到我要用的那个？" },
    { ic: "🛠", t: "查故障", s: "页面打不开、白屏、很慢", q: "页面打不开 / 一直转圈，帮我查一下原因" },
    { ic: "📘", t: "问用法", s: "某个工具怎么操作", q: "灵犀互传怎么用？" },
    { ic: "🪄", t: "提需求 / 许愿", s: "想要新功能直接说", q: "我想给站点提一个需求，许愿墙在哪？" }
  ];
  function greet() {
    var box = document.createElement("div"); box.className = "eb-welcome";
    box.innerHTML = '<div class="eb-wt">你好，我是小鸽子</div>' +
      '<div class="eb-ws">找不到工具、页面打不开、不会用，直接问我。我会先去服务器上真实检查，再回答你。</div>' +
      '<div class="eb-caps">' + CAPS.map(function (c) {
        return '<button class="eb-cap" type="button" data-q="' + c.q.replace(/"/g, "&quot;") + '">' +
          '<span class="ic">' + c.ic + '</span><span class="tx"><b>' + c.t + '</b><span>' + c.s + '</span></span></button>';
      }).join("") + '</div>';
    msgs.appendChild(box);
    var btns = box.querySelectorAll(".eb-cap");
    for (var j = 0; j < btns.length; j++) {
      btns[j].onclick = function () { input.value = this.getAttribute("data-q"); send(); };
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ---------- 对话记忆 ---------- */
  function cachePush(role, text) {
    try {
      var arr = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
      arr.push([role, text]); if (arr.length > 40) arr = arr.slice(-40);
      localStorage.setItem(HIST_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  var INITIAL_SUGGESTIONS = [
    "视频转PPT工具在哪？", "灵犀互传怎么用？", "页面打不开怎么排查？", "上传资料安全吗？",
    "火星身份是什么？", "怎么注册账号？登录入口在哪？", "怎么联系创办人？", "客户管理系统有哪些功能？",
    "九页问卷怎么创建？", "资料百事通积分怎么赚？", "有接单赚钱的平台吗？", "如何批量重命名文件？",
    "黑金二维码工坊能做什么？", "AI资产速查Hub有哪些内容？", "直播嘉宾看板能用在什么场景？", "灵魂拷问题库有多少题？"
  ];
  var historyLoaded = false;
  function loadHistory() {
    if (historyLoaded) return; historyLoaded = true;
    setChips(INITIAL_SUGGESTIONS);  // chips 无论是否有历史都先初始化
    var local = [];
    try { local = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (e) {}
    if (local.length) { local.forEach(function (m) { addMsg(m[0], m[1]); }); return; }
    fetch(PORTAL + "/api/agent/history?session_id=" + getSid(), { credentials: "include" })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok && d.messages && d.messages.length) d.messages.forEach(function (m) { addMsg(m.role, m.content); });
        else greet();
      }).catch(greet);
  }
  function setChips(list) {
    chips.innerHTML = "";
    var visible = list.slice(0, 4);
    visible.forEach(function (q) {
      var c = document.createElement("span"); c.className = "eb-chip"; c.textContent = q;
      c.onclick = function () { input.value = q; send(); }; chips.appendChild(c);
    });
    if (list.length > 4) {
      var more = document.createElement("span"); more.className = "eb-chip eb-more";
      more.innerHTML = '<span class="eb-more-label">更多</span><span class="eb-more-arrow">▾</span>';
      more.onclick = function () { toggleChips(more, list); };
      chips.appendChild(more);
      chips.dataset.open = "";
    }
  }
  function toggleChips(more, list) {
    var isOpen = chips.dataset.open === "1";
    chips.innerHTML = "";
    (isOpen ? list.slice(0, 4) : list).forEach(function (q) {
      var c = document.createElement("span"); c.className = "eb-chip"; c.textContent = q;
      c.onclick = function () { input.value = q; send(); }; chips.appendChild(c);
    });
    chips.dataset.open = isOpen ? "" : "1";
    var more2 = document.createElement("span"); more2.className = "eb-chip eb-more";
    more2.innerHTML = '<span class="eb-more-label">' + (isOpen ? "更多" : "收起") + '</span><span class="eb-more-arrow">' + (isOpen ? "▾" : "▴") + '</span>';
    more2.onclick = function () { toggleChips(more2, list); };
    chips.appendChild(more2);
    chips.scrollTop = chips.scrollHeight;
  }

  /* ---------- 发送 ---------- */
  var sending = false;
  function send() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true; input.value = "";
    addMsg("user", text); cachePush("user", text);
    var tp = document.createElement("div"); tp.className = "eb-typing"; tp.innerHTML = "<i></i><i></i><i></i>";
    msgs.appendChild(tp); msgs.scrollTop = msgs.scrollHeight;
    if (/打不开|进不去|用不了|白屏|报错|很慢|加载不出/.test(text)) {
      setTimeout(function () { if (tp.parentNode) tp.dataset.hint = "1"; }, 100);
    }
    fetch(PORTAL + "/api/agent/chat", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, page_url: location.href, session_id: getSid() })
    }).then(function (r) { return r.json(); }).then(function (d) {
      tp.remove(); sending = false;
      if (d.ok) {
        addMsg("ai", d.reply, d.cards); cachePush("assistant", d.reply);
        if (d.suggestions) setChips(d.suggestions);
      } else { addMsg("ai", "😥 出了点小状况：" + (d.msg || "请稍后再试")); }
    }).catch(function () {
      tp.remove(); sending = false;
      addMsg("ai", "😥 网络不太顺，没联系上小鸽子。请检查网络后再试，或稍等片刻。");
    });
  }
  document.getElementById("ebSend").onclick = send;
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
})();
