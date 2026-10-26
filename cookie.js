/*
 * Баннер cookie. Аналитика и реклама (скрипты с data-consent="analytics"
 * и type="text/plain") не запускаются, пока человек не нажал «Принять».
 * «Отклонить» такое же по виду. Выбор запоминается в этом браузере.
 * Выбор серии и заставка этим файлом не отключаются.
 */
(function () {
  var box = document.getElementById('cookie-banner');
  if (!box) return;
  var key = box.getAttribute('data-key') || 'cookie-choice';

  function read() {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function enableOptional() {
    var nodes = document.querySelectorAll('script[data-consent="analytics"]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.getAttribute('data-loaded') === '1') return;
      if ((node.getAttribute('type') || '') !== 'text/plain') return;
      var next = document.createElement('script');
      var src = node.getAttribute('data-src');
      if (src) next.src = src;
      else next.text = node.text || node.textContent || '';
      node.setAttribute('data-loaded', '1');
      document.head.appendChild(next);
    });
  }
  function hide() { box.hidden = true; }

  var saved = read();
  if (saved === 'accepted') { hide(); enableOptional(); return; }
  if (saved === 'rejected') { hide(); return; }

  box.hidden = false;
  box.querySelector('[data-cookie="accept"]').addEventListener('click', function () {
    write('accepted');
    hide();
    enableOptional();
  });
  box.querySelector('[data-cookie="reject"]').addEventListener('click', function () {
    write('rejected');
    hide();
  });
})();
