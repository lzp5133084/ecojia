/* ══════════════════════════════════════════════════════════
   csp-bind.js · CSP 严格模式事件委托绑定器
   作者：军哥懂保（微信：xunijiayuan）
   作用：CSP 启用后浏览器会拦截 onclick/onsubmit 等内联事件属性，
        本文件把「data-act / data-act-change / data-act-input /
        data-act-submit / data-fallback」统一委托到 document，
        由 window 上的同名函数执行，模板里不再出现内联 JS。
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function resolve(name) {
    if (!name) return null;
    var path = name.indexOf('window.') === 0 ? name.slice(7) : name;
    var cur = window;
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return typeof cur === 'function' ? cur : null;
  }

  function buildArgs(el, extra) {
    var a = [];
    var raw = el.getAttribute('data-arg');
    if (raw) {
      try { a = JSON.parse(raw); } catch (e) { a = []; }
      if (!Array.isArray(a)) a = [a];
    }
    var key = el.getAttribute('data-arg-this');
    if (key) a = a.concat([key === '@self' ? el : el[key]]);
    if (extra) a = a.concat([extra]);
    return a;
  }

  function call(el, name, extra) {
    var fn = resolve(name);
    if (!fn) return false;
    fn.apply(el, buildArgs(el, extra));
    return true;
  }

  function confirmed(el) {
    var c = el.getAttribute('data-confirm');
    return !c || window.confirm(c);
  }

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    if (el.tagName === 'A' || el.getAttribute('href') === '#') e.preventDefault();
    if (!confirmed(el)) return;
    call(el, el.getAttribute('data-act'));
  }, false);

  document.addEventListener('change', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act-change]') : null;
    if (!el) return;
    call(el, el.getAttribute('data-act-change'), e);
  }, false);

  document.addEventListener('input', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act-input]') : null;
    if (!el) return;
    call(el, el.getAttribute('data-act-input'), e);
  }, false);

  document.addEventListener('submit', function (e) {
    var f = e.target && e.target.closest ? e.target.closest('[data-act-submit]') : null;
    if (!f) return;
    e.preventDefault();
    call(f, f.getAttribute('data-act-submit'), e);
  }, false);

  /* img 的 error 事件不冒泡，必须用捕获阶段 */
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    var text = img.getAttribute('data-fallback');
    if (text === null) return;
    var box = document.createElement('div');
    box.className = img.getAttribute('data-fallback-class') || 'qr-empty';
    box.textContent = text;
    if (img.parentNode) img.parentNode.replaceChild(box, img);
  }, true);

  /* 内置动作：返回上一页（替代 javascript:history.back()） */
  window.ecjBack = function () { window.history.back(); };
  window.ecjPrint = function () { window.print(); };
  /* 动态创建 <style> 时补 nonce，否则 CSP 会拦截（eco-bar / promote 用到） */
  window.ecjStyle = function () {
    var s = document.createElement('style');
    var m = document.querySelector('meta[name="csp-nonce"]');
    if (m && m.content) s.setAttribute('nonce', m.content);
    return s;
  };
  /* 复制火星身份标识（原内联表达式改到这里，便于 CSP 下调用） */
  window.hxCopyDid = function (did) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(did).then(function () {
      if (typeof window.toast === 'function') window.toast('已复制身份标识');
    });
  };
})();
