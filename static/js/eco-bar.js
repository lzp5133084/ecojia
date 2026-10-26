/* ============================================================
   生态栏 eco-bar.js · 数字生态家园统一注入组件 V1.0
   作者：军哥懂保（微信：xunijiayuan）
   能力：返回首页 + 登录状态 + AI智能体「小鸽子」悬浮球/浮窗对话
   用法：<script src="/eco-bar.js" defer></script>
   ============================================================ */
(function () {
  "use strict";
  window.__ecoBarVer = "20261026b";
  if (window.__ecoBarLoaded) return; window.__ecoBarLoaded = true;
  // iframe 内不渲染（避免外壳页+内嵌页出现两套组件）
  if (window.self !== window.top) return;

  var HOST = location.hostname;
  // 生态域名内 → 统一调门户API；本地/其他环境 → 同源调用（门户自己挂的eco-bar）
  var PORTAL = /(^|\.)ecojia\.cn$/.test(HOST)
    ? (HOST === "ecojia.cn" || HOST === "www.ecojia.cn" ? location.origin : "https://ecojia.cn")
    : location.origin;
  var SID_KEY = "eco_agent_sid", HIST_KEY = "eco_agent_cache";
  var isMobile = function () { return window.innerWidth <= 720; };

  function getSid() {
    var s = localStorage.getItem(SID_KEY);
    if (!s) { s = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(SID_KEY, s); }
    return s;
  }

  /* ---------- 样式：2027 黑金星霓风 ---------- */
  var css = `
#ecoBarWrap,#ecoBarWrap *{box-sizing:border-box;margin:0;padding:0;font-family:"HarmonyOS Sans SC","MiSans","PingFang SC","Microsoft YaHei",sans-serif}
#ecoBarWrap{position:relative;z-index:2147483000}
/* —— 面板内快捷入口条（返回首页 + 登录/注册） —— */
.eb-quick{display:flex;gap:9px;padding:10px 14px;border-bottom:1px solid rgba(240,199,94,.16);
 background:linear-gradient(90deg,rgba(240,199,94,.06),transparent 70%)}
.eb-qbtn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:36px;border-radius:11px;
 font-size:12.5px;color:#f0dfae;text-decoration:none;letter-spacing:.5px;cursor:pointer;
 background:rgba(240,199,94,.08);border:1px solid rgba(240,199,94,.3);transition:.2s}
.eb-qbtn:hover{background:rgba(240,199,94,.18);border-color:rgba(240,199,94,.6);transform:translateY(-1px)}
.eb-qbtn svg{width:14px;height:14px;stroke:#f0c75e;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.eb-qbtn .eb-dot{width:8px;height:8px;border-radius:50%;background:#7ee2a8;box-shadow:0 0 8px #7ee2a8;flex-shrink:0;animation:ebDotPulse 2s ease-in-out infinite}
.eb-qbtn.off .eb-dot{background:#8a8577;box-shadow:none;animation:none}
@keyframes ebDotPulse{0%,100%{box-shadow:0 0 6px #7ee2a8}50%{box-shadow:0 0 14px #7ee2a8}}
.eb-qbtn .eb-role{font-size:10px;color:#f0c75e;background:rgba(240,199,94,.15);padding:1px 7px;border-radius:999px}
/* —— 悬浮球 —— */
.eb-ball{position:fixed;right:22px;bottom:24px;width:62px;height:62px;border-radius:50%;cursor:grab;z-index:2147483002;
 display:flex;align-items:center;justify-content:center;flex-direction:column;
 background:radial-gradient(circle at 32% 28%,#3a2f16,#14100a 70%);
 border:1.5px solid rgba(240,199,94,.65);box-shadow:0 6px 24px rgba(0,0,0,.5),0 0 22px rgba(240,199,94,.28);
 transition:box-shadow .28s,opacity .28s;animation:ebBreath 3.2s ease-in-out infinite;
 touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.eb-ball:hover{transform:scale(1.09)}
.eb-ball.dragging{cursor:grabbing;animation:none;transform:scale(1.12);box-shadow:0 10px 36px rgba(0,0,0,.6),0 0 36px rgba(240,199,94,.5)}
.eb-ball.snap-x{transition:left .35s cubic-bezier(.34,1.4,.64,1),right .35s cubic-bezier(.34,1.4,.64,1),top .2s,bottom .2s}
.eb-ball.snap-y{transition:top .35s cubic-bezier(.34,1.4,.64,1),bottom .35s cubic-bezier(.34,1.4,.64,1),left .2s,right .2s}
.eb-ball .eb-ai{font-size:17px;font-weight:800;letter-spacing:1px;
 background:linear-gradient(135deg,#f0c75e,#fff3c4,#d4a437);-webkit-background-clip:text;background-clip:text;color:transparent}
.eb-ball .eb-sub{font-size:8.5px;color:#b8a66a;letter-spacing:2px;margin-top:1px}
@keyframes ebBreath{0%,100%{box-shadow:0 6px 24px rgba(0,0,0,.5),0 0 16px rgba(240,199,94,.22)}50%{box-shadow:0 6px 28px rgba(0,0,0,.5),0 0 34px rgba(240,199,94,.5)}}
.eb-ball.hide{transform:scale(0);opacity:0;pointer-events:none}
/* —— 对话浮窗 —— */
.eb-panel{position:fixed;right:22px;bottom:24px;width:420px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 60px);
 border-radius:20px;overflow:hidden;display:flex;flex-direction:column;z-index:2147483002;
 background:linear-gradient(175deg,rgba(26,21,12,.96),rgba(14,11,7,.97));
 border:1px solid rgba(240,199,94,.4);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
 box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 40px rgba(240,199,94,.12);
 transform-origin:bottom right;transition:transform .3s cubic-bezier(.34,1.4,.64,1),opacity .25s}
.eb-panel.hide{transform:scale(.12) translateY(46%);opacity:0;pointer-events:none}
.eb-head{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid rgba(240,199,94,.2);
 background:linear-gradient(90deg,rgba(240,199,94,.1),transparent 60%)}
.eb-logo{width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;
 background:linear-gradient(135deg,#f0c75e,#d4a437);color:#241c08;font-weight:800;font-size:15px;
 box-shadow:0 0 16px rgba(240,199,94,.45)}
.eb-title{flex:1;min-width:0}
.eb-title b{display:block;font-size:14.5px;color:#f5e9c8;letter-spacing:1px}
.eb-title span{font-size:10.5px;color:#a8955f;letter-spacing:.5px}
.eb-hbtn{width:30px;height:30px;border-radius:9px;border:1px solid rgba(240,199,94,.3);background:rgba(240,199,94,.07);
 color:#e8d59a;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s}
.eb-hbtn:hover{background:rgba(240,199,94,.2)}
.eb-msgs{flex:1;overflow-y:auto;padding:16px 14px 10px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}
.eb-msgs::-webkit-scrollbar{width:5px}
.eb-msgs::-webkit-scrollbar-thumb{background:rgba(240,199,94,.3);border-radius:4px}
.eb-msg{max-width:86%;padding:11px 14px;border-radius:15px;font-size:13.5px;line-height:1.75;word-break:break-word;white-space:pre-wrap}
.eb-msg.user{align-self:flex-end;color:#241c08;border-bottom-right-radius:5px;
 background:linear-gradient(135deg,#f0c75e,#e0b34a);box-shadow:0 4px 14px rgba(240,199,94,.3)}
.eb-msg.ai{align-self:flex-start;color:#efe8d5;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.85);
 border-left:3px solid #f0c75e;border-bottom-left-radius:5px;box-shadow:0 3px 12px rgba(0,0,0,.35)}
.eb-msg.ai a{color:#f0c75e;text-decoration:underline;text-underline-offset:2px}
.eb-msg.ai b{color:#ffe9ad}
.eb-cards{display:flex;flex-direction:column;gap:8px;align-self:stretch}
.eb-card{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:13px;text-decoration:none;
 background:rgba(240,199,94,.07);border:1px solid rgba(240,199,94,.25);transition:.2s}
.eb-card:hover{background:rgba(240,199,94,.15);border-color:rgba(240,199,94,.55)}
.eb-card .n{font-size:10px;color:#a8955f;letter-spacing:1px}
.eb-card .t{flex:1;font-size:13px;color:#f5e9c8}
.eb-card .s{font-size:10px;color:#7ee2a8}
.eb-typing{align-self:flex-start;display:flex;gap:5px;padding:12px 16px}
.eb-typing i{width:7px;height:7px;border-radius:50%;background:#f0c75e;animation:ebTp 1.1s infinite}
.eb-typing i:nth-child(2){animation-delay:.18s}.eb-typing i:nth-child(3){animation-delay:.36s}
@keyframes ebTp{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
.eb-chips{display:flex;gap:7px;flex-wrap:wrap;padding:8px 14px 10px;max-height:100px;overflow-y:auto;scroll-behavior:smooth}
.eb-chips::-webkit-scrollbar{width:4px}
.eb-chips::-webkit-scrollbar-thumb{background:rgba(240,199,94,.3);border-radius:4px}
.eb-chip{padding:6px 12px;border-radius:999px;font-size:11.5px;color:#e8d59a;cursor:pointer;
 background:rgba(240,199,94,.08);border:1px solid rgba(240,199,94,.28);transition:.2s}
.eb-chip:hover{background:rgba(240,199,94,.2)}
.eb-more{color:#f0c75e;border-color:rgba(240,199,94,.5);background:rgba(240,199,94,.12);
 font-weight:600;letter-spacing:1px;display:inline-flex;gap:4px;align-items:center}
.eb-more .eb-more-arrow{font-size:9px;line-height:1}
.eb-input{display:flex;gap:9px;padding:12px 14px;border-top:1px solid rgba(240,199,94,.16)}
.eb-input input{flex:1;height:42px;border-radius:13px;border:1px solid rgba(240,199,94,.3);outline:none;
 background:rgba(255,255,255,.06);color:#f5e9c8;font-size:13.5px;padding:0 15px;transition:.2s}
.eb-input input:focus{border-color:rgba(240,199,94,.65);box-shadow:0 0 0 3px rgba(240,199,94,.12)}
.eb-input input::placeholder{color:#8a7c54}
.eb-send{width:42px;height:42px;border-radius:13px;border:0;cursor:pointer;flex-shrink:0;
 background:linear-gradient(135deg,#f0c75e,#d4a437);display:flex;align-items:center;justify-content:center;
 box-shadow:0 4px 14px rgba(240,199,94,.35);transition:.2s}
.eb-send:hover{transform:translateY(-2px)}
.eb-send svg{width:17px;height:17px;stroke:#241c08;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.eb-foot{padding:7px 14px 10px;font-size:10px;color:#8a7c54;text-align:center;letter-spacing:.5px}
/* —— 名词解析弹层 —— */
.eb-dict{position:absolute;top:112px;right:12px;width:250px;padding:14px 16px;border-radius:14px;display:none;z-index:9;
 background:rgba(20,16,9,.97);border:1px solid rgba(240,199,94,.4);box-shadow:0 14px 40px rgba(0,0,0,.55)}
.eb-dict.show{display:block}
.eb-dict h4{font-size:12.5px;color:#f0c75e;margin-bottom:8px;letter-spacing:1px}
.eb-dict p{font-size:11.5px;color:#c9bd9a;line-height:1.7;margin-bottom:7px}
.eb-dict p b{color:#efe0ae}
/* —— 首次引导气泡 —— */
.eb-tip{position:fixed;right:94px;bottom:36px;max-width:230px;padding:12px 16px;border-radius:15px;z-index:2147483001;
 font-size:12.5px;line-height:1.7;color:#241c08;background:linear-gradient(135deg,#f0c75e,#e8c35a);
 border-bottom-right-radius:4px;box-shadow:0 10px 30px rgba(240,199,94,.35);cursor:pointer;
 animation:ebTipIn .5s cubic-bezier(.34,1.56,.64,1)}
@keyframes ebTipIn{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
.eb-tip b{display:block;margin-bottom:2px;font-size:13px}
/* —— 移动端适配 —— */
@media (max-width:720px){
 .eb-ball{right:14px;bottom:16px;width:54px;height:54px}
 .eb-panel{right:0;left:0;bottom:0;width:100%;max-width:100%;height:78vh;border-radius:20px 20px 0 0;transform-origin:bottom center}
 .eb-tip{right:78px;bottom:22px;max-width:190px}
}
/* —— 浅色页面自适应：白金主题（与深色黑金同源高级感） —— */
#ecoBarWrap.eb-light .eb-quick{border-bottom-color:rgba(180,140,40,.18);background:linear-gradient(90deg,rgba(212,175,55,.08),transparent 70%)}
#ecoBarWrap.eb-light .eb-qbtn{color:#6b5a26;background:rgba(212,175,55,.1);border-color:rgba(180,140,40,.35)}
#ecoBarWrap.eb-light .eb-qbtn:hover{background:rgba(212,175,55,.22);border-color:rgba(180,140,40,.6)}
#ecoBarWrap.eb-light .eb-qbtn svg{stroke:#a8842c}
#ecoBarWrap.eb-light .eb-ball{background:radial-gradient(circle at 32% 28%,#fffdf6,#f6ecd4 72%);
 border-color:rgba(180,140,40,.6);box-shadow:0 6px 22px rgba(120,90,20,.22),0 0 20px rgba(212,175,55,.3)}
#ecoBarWrap.eb-light .eb-ball .eb-ai{background:linear-gradient(135deg,#a8842c,#d4af37,#8a6d1f);-webkit-background-clip:text;background-clip:text;color:transparent}
#ecoBarWrap.eb-light .eb-ball .eb-sub{color:#a08840}
#ecoBarWrap.eb-light .eb-panel{background:linear-gradient(175deg,rgba(255,253,248,.97),rgba(250,244,232,.98));
 border-color:rgba(180,140,40,.4);box-shadow:0 24px 70px rgba(120,90,20,.28),0 0 40px rgba(212,175,55,.14)}
#ecoBarWrap.eb-light .eb-head{border-bottom-color:rgba(180,140,40,.22);background:linear-gradient(90deg,rgba(212,175,55,.14),transparent 60%)}
#ecoBarWrap.eb-light .eb-title b{color:#4a3a10}
#ecoBarWrap.eb-light .eb-title span{color:#9c8a52}
#ecoBarWrap.eb-light .eb-hbtn{border-color:rgba(180,140,40,.35);background:rgba(212,175,55,.1);color:#8a6d1f}
#ecoBarWrap.eb-light .eb-hbtn:hover{background:rgba(212,175,55,.25)}
#ecoBarWrap.eb-light .eb-msg.user{color:#3a2e08;box-shadow:0 4px 14px rgba(212,175,55,.35)}
#ecoBarWrap.eb-light .eb-msg.ai{color:#4d4433;background:rgba(255,255,255,.75);border-color:rgba(180,140,40,.35);border-left:3px solid #c9a227;box-shadow:0 3px 10px rgba(120,90,20,.1)}
#ecoBarWrap.eb-light .eb-msg.ai a{color:#a8842c}
#ecoBarWrap.eb-light .eb-msg.ai b{color:#7a5f16}
#ecoBarWrap.eb-light .eb-card{background:rgba(212,175,55,.08);border-color:rgba(180,140,40,.3)}
#ecoBarWrap.eb-light .eb-card:hover{background:rgba(212,175,55,.18)}
#ecoBarWrap.eb-light .eb-card .t{color:#4a3a10}
#ecoBarWrap.eb-light .eb-card .n{color:#9c8a52}
#ecoBarWrap.eb-light .eb-card .s{color:#3d9b6d}
#ecoBarWrap.eb-light .eb-chip{color:#7a6220;background:rgba(212,175,55,.1);border-color:rgba(180,140,40,.35)}
#ecoBarWrap.eb-light .eb-chip:hover{background:rgba(212,175,55,.25)}
#ecoBarWrap.eb-light .eb-input{border-top-color:rgba(180,140,40,.18)}
#ecoBarWrap.eb-light .eb-input input{background:rgba(255,255,255,.8);border-color:rgba(180,140,40,.35);color:#4a3a10}
#ecoBarWrap.eb-light .eb-input input::placeholder{color:#b0a070}
#ecoBarWrap.eb-light .eb-foot{color:#a89a6c}
#ecoBarWrap.eb-light .eb-dict{background:rgba(255,253,248,.98);border-color:rgba(180,140,40,.45);box-shadow:0 14px 40px rgba(120,90,20,.2)}
#ecoBarWrap.eb-light .eb-dict h4{color:#a8842c}
#ecoBarWrap.eb-light .eb-dict p{color:#6b5d3a}
#ecoBarWrap.eb-light .eb-dict p b{color:#8a6d1f}
#ecoBarWrap.eb-light .eb-typing i{background:#c9a227}
`;
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var wrap = document.createElement("div"); wrap.id = "ecoBarWrap";
  // 所有页面统一：只渲染悬浮球 + 浮窗（返回首页/登录入口已植入浮窗内）
  wrap.innerHTML = `
<div class="eb-ball" id="ebBall" title="生态智能体·小鸽子">
 <span class="eb-ai">AI</span><span class="eb-sub">小鸽子</span></div>
<div class="eb-panel hide" id="ebPanel">
 <div class="eb-head">
  <div class="eb-logo">鸽</div>
  <div class="eb-title"><b>生态智能体 · 小鸽子</b><span>找工具 · 查故障 · 答疑问</span></div>
  <button class="eb-hbtn" id="ebDict" title="名词解析（大白话）">?</button>
  <button class="eb-hbtn" id="ebClear" title="清空本会话记录">🗑</button>
  <button class="eb-hbtn" id="ebFold" title="收起为悬浮球">—</button>
 </div>
 <div class="eb-quick">
  <a class="eb-qbtn" id="ebHome" href="${PORTAL}" title="返回数字生态家园门户首页">
   <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>
   <span>返回首页</span></a>
  <a class="eb-qbtn off" id="ebAuth" href="${PORTAL}/login" title="登录生态统一账号">
   <i class="eb-dot"></i><span id="ebAuthTxt">登录 / 注册</span></a>
 </div>
 <div class="eb-dict" id="ebDictBox">
  <h4>📖 名词解析（大白话）</h4>
  <p><b>悬浮球</b>：右下角这个金色小球，点一下就能跟我说话。</p>
  <p><b>浮窗</b>：就是现在这个对话窗口，不用跳转页面。</p>
  <p><b>生态</b>：军哥做的所有网站和工具的统称。</p>
  <p><b>健康检查</b>：我从服务器上真实访问一次那个工具，看它是好是坏。</p>
  <p><b>许愿墙</b>：给军哥提需求的地方，被采纳就会开发。</p>
 </div>
 <div class="eb-msgs" id="ebMsgs"></div>
 <div class="eb-chips" id="ebChips"></div>
 <div class="eb-input">
  <input id="ebInput" placeholder="问点什么…如：视频转PPT在哪？" maxlength="500" />
  <button class="eb-send" id="ebSend" title="发送">
   <svg viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
 </div>
 <div class="eb-foot">军哥懂保 · 微信 xunijiayuan · ecojia.cn</div>
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
      if (!p) return;
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
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
  }
  function snapToEdge() {
    var r = ball.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // 限制在视口内
    var nx = Math.max(8, Math.min(vw - r.width - 8, r.left));
    var ny = Math.max(8, Math.min(vh - r.height - 8, r.top));
    ball.style.left = nx + "px"; ball.style.top = ny + "px";
    // 横向吸附到最近边缘
    ball.classList.add("snap-x");
    if (cx < vw / 2) ball.style.left = "8px"; else ball.style.left = (vw - r.width - 8) + "px";
    setTimeout(function () { ball.classList.remove("snap-x"); saveBallPos(); }, 360);
  }
  function positionPanel() {
    // 浮窗跟随悬浮球位置（带边缘约束）
    var r = ball.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var pw = Math.min(420, vw - 24);
    var ph = Math.min(600, vh - 60);
    if (isMobile()) { pw = vw; ph = vh * 0.78; }
    panel.style.width = pw + "px"; panel.style.height = ph + "px";
    panel.style.left = ""; panel.style.right = ""; panel.style.top = ""; panel.style.bottom = "";
    var px, py;
    if (r.left + r.width / 2 < vw / 2) { px = r.left + r.width + 8; }
    else { px = r.left - pw - 8; }
    py = r.top + r.height / 2 - ph / 2;
    px = Math.max(8, Math.min(vw - pw - 8, px));
    py = Math.max(8, Math.min(vh - ph - 8, py));
    if (isMobile()) { px = 0; py = vh - ph; }
    panel.style.left = px + "px"; panel.style.top = py + "px";
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
    else { openPanel(); }
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
    if (dragMoved) { snapToEdge(); saveBallPos(); }
    else { openPanel(); }
  });
  // 点击（非拖拽）打开面板
  ball.onclick = function (e) {
    if (dragMoved) { if (e.preventDefault) e.preventDefault(); return false; }
    openPanel();
  };

  // 恢复上次拖拽位置
  restoreBallPos();
  // 窗口尺寸变化时，确保球在视口内
  window.addEventListener("resize", function () {
    var r = ball.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (r.right > vw) ball.style.left = (vw - r.width - 8) + "px";
    if (r.bottom > vh) ball.style.top = (vh - r.height - 8) + "px";
    if (r.left < 0) ball.style.left = "8px";
    if (r.top < 0) ball.style.top = "8px";
    saveBallPos();
  });

  function openPanel() {
    positionPanel();
    ball.classList.add("hide");
    panel.classList.remove("hide");
    input.focus();
    loadHistory();
    hideTip();
  }

  /* ---------- 悬浮球 ⇄ 浮窗 切换 ---------- */
  document.getElementById("ebFold").onclick = function () { panel.classList.add("hide"); ball.classList.remove("hide"); };
  document.getElementById("ebDict").onclick = function (e) { e.stopPropagation(); dictBox.classList.toggle("show"); };
  panel.addEventListener("click", function (e) { if (!dictBox.contains(e.target) && e.target.id !== "ebDict") dictBox.classList.remove("show"); });
  document.getElementById("ebClear").onclick = function () {
    fetch(PORTAL + "/api/agent/history", { method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: getSid() }) });
    localStorage.removeItem(HIST_KEY); msgs.innerHTML = ""; greet(); toastInline("记录已清空");
  };

  /* ---------- 首次引导气泡 ---------- */
  function hideTip() { var t = document.querySelector(".eb-tip"); if (t) t.remove(); localStorage.setItem("eco_tip_seen", "1"); }
  if (!localStorage.getItem("eco_tip_seen")) {
    setTimeout(function () {
      var tip = document.createElement("div"); tip.className = "eb-tip";
      tip.innerHTML = "<b>👋 我是小鸽子</b>找不到工具？页面打不开？点我直接问～";
      tip.onclick = function () { hideTip(); ball.click(); };
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
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
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

  /* ---------- 对话记忆 ---------- */
  function cachePush(role, text) {
    try {
      var arr = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
      arr.push([role, text]); if (arr.length > 40) arr = arr.slice(-40);
      localStorage.setItem(HIST_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  var historyLoaded = false;
  function loadHistory() {
    if (historyLoaded) return; historyLoaded = true;
    var local = [];
    try { local = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (e) {}
    if (local.length) { local.forEach(function (m) { addMsg(m[0], m[1]); }); return; }
    fetch(PORTAL + "/api/agent/history?session_id=" + getSid(), { credentials: "include" })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok && d.messages && d.messages.length) d.messages.forEach(function (m) { addMsg(m.role, m.content); });
        else greet();
      }).catch(greet);
  }
  function greet() {
    addMsg("ai", "您好呀！我是生态智能体「小鸽子」🕊️\n找不到工具、页面打不开、不会用……都可以问我。我会先去服务器上检查，再回答您。");
    setChips(["视频转PPT工具在哪？", "灵犀互传怎么用？", "怎么凸显图片里某个物品？", "上传资料安全吗？",
              "咱们网站有什么？", "怎么联系创办人？", "如何批量重命名文件？", "客户管理系统有哪些功能？",
              "霓虹边框工具在哪？", "理赔资料助手怎么用？", "如何修复网络？", "黑金二维码工坊能做什么？",
              "九页问卷怎么创建？", "AI资产速查Hub有哪些内容？", "直播嘉宾看板能用在什么场景？",
              "灵魂拷问题库有多少？", "资料百事通积分怎么赚？", "火星身份证是什么？",
              "有接单赚钱的平台吗？", "怎么注册账号？登录入口在哪？"]);
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
      more.onclick = function () {
        var isOpen = chips.dataset.open === "1";
        chips.innerHTML = "";
        (isOpen ? list.slice(0, 4) : list).forEach(function (q) {
          var c = document.createElement("span"); c.className = "eb-chip"; c.textContent = q;
          c.onclick = function () { input.value = q; send(); }; chips.appendChild(c);
        });
        chips.dataset.open = isOpen ? "" : "1";
        more = document.createElement("span"); more.className = "eb-chip eb-more";
        more.innerHTML = '<span class="eb-more-label">' + (isOpen ? "更多" : "收起") + '</span><span class="eb-more-arrow">' + (isOpen ? "▾" : "▴") + '</span>';
        more.onclick = arguments.callee;
        chips.appendChild(more);
        chips.scrollTop = chips.scrollHeight;
      };
      chips.appendChild(more);
      chips.dataset.open = "";
    }
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
