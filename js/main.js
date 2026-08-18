/*
 * Сборка страницы из GALLERY (js/gallery-data.js), меню, лайтбокс и скролл-эффекты.
 * Без зависимостей — файл подключается обычным <script> и работает как с сервера,
 * так и при открытии index.html с диска.
 */
(function () {
  'use strict';

  if (typeof GALLERY === 'undefined' || !Array.isArray(GALLERY)) {
    console.error('gallery-data.js не загружен — галерею собрать не из чего');
    return;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ */
  /* Меню                                                                */
  /* ------------------------------------------------------------------ */

  const nav = $('#site-nav');

  GALLERY.forEach((section) => {
    const link = document.createElement('a');
    link.className = 'nav__link';
    link.href = '#' + section.id;
    link.textContent = section.title;
    link.style.setProperty('--nav-accent', section.accent);
    link.dataset.target = section.id;
    nav.appendChild(link);
  });

  /* ------------------------------------------------------------------ */
  /* Хиро: полоса превью по одному кадру на стиль                        */
  /* ------------------------------------------------------------------ */

  const flowOut = $('.flow__out');

  GALLERY.forEach((section) => {
    const photo = section.photos[0];
    if (!photo) return;

    const li = document.createElement('li');
    li.innerHTML =
      '<a class="flow__chip" href="#' + section.id + '" style="--accent:' + section.accent + '">' +
        '<img src="' + photo.thumb + '" alt="" width="' + photo.w + '" height="' + photo.h + '" loading="lazy" decoding="async">' +
        '<span class="flow__chip-name">' + section.title + '</span>' +
      '</a>';
    flowOut.appendChild(li);
  });

  /* ------------------------------------------------------------------ */
  /* Бегущая строка                                                      */
  /* ------------------------------------------------------------------ */

  const marqueeTrack = $('.marquee__track');
  const marqueeHtml = GALLERY.map((s) =>
    '<span class="marquee__item" style="--accent:' + s.accent + '">' + s.title + '</span>'
  ).join('');
  // Содержимое дублируется: трек уезжает ровно на половину и склейки не видно
  marqueeTrack.innerHTML = marqueeHtml + marqueeHtml;

  /* ------------------------------------------------------------------ */
  /* Разделы-галереи                                                     */
  /* ------------------------------------------------------------------ */

  const work = $('#work');
  // Разделы с 2-3 кадрами получают крупную раскладку, иначе выглядят пусто
  const FEATURE_LIMIT = 3;

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  GALLERY.forEach((section) => {
    const isFeature = section.photos.length <= FEATURE_LIMIT;
    const count = section.photos.length;

    const el = document.createElement('section');
    el.className = 'style';
    el.id = section.id;
    el.style.setProperty('--accent', section.accent);
    el.setAttribute('aria-labelledby', section.id + '-title');

    const tiles = section.photos.map((photo, i) =>
      '<li class="tile">' +
        '<button class="tile__btn" type="button" data-section="' + section.id + '" data-index="' + i + '"' +
          ' aria-label="Открыть фото ' + (i + 1) + ' из ' + count + ', стиль «' + section.title + '»">' +
          '<img src="' + photo.thumb + '" alt="' + photo.alt + '" width="' + photo.w + '" height="' + photo.h + '"' +
            ' loading="lazy" decoding="async">' +
          '<span class="tile__idx">' + String(i + 1).padStart(2, '0') + '</span>' +
        '</button>' +
      '</li>'
    ).join('');

    el.innerHTML =
      '<div class="wrap">' +
        '<header class="style__head reveal">' +
          '<span class="style__num" aria-hidden="true">' + section.num + '</span>' +
          '<div>' +
            '<h2 class="style__title" id="' + section.id + '-title">' + section.title + '</h2>' +
            '<p class="style__tagline">' + section.tagline + '</p>' +
          '</div>' +
          '<p class="style__desc">' + section.description + '</p>' +
          '<p class="style__count">' + count + ' ' + plural(count, 'кадр', 'кадра', 'кадров') + '</p>' +
        '</header>' +
        '<ul class="grid' + (isFeature ? ' grid--feature" style="--cols:' + count + '"' : '"') + '>' + tiles + '</ul>' +
      '</div>';

    work.appendChild(el);
  });

  /* ------------------------------------------------------------------ */
  /* Появление блоков при скролле                                        */
  /* ------------------------------------------------------------------ */

  // Плитки проявляются каскадом внутри своей сетки
  document.querySelectorAll('.grid').forEach((grid) => {
    grid.querySelectorAll('.tile').forEach((tile, i) => {
      tile.classList.add('reveal');
      tile.style.setProperty('--delay', Math.min(i, 8) * 45 + 'ms');
    });
  });

  const revealables = Array.from(document.querySelectorAll('.reveal'));
  const showAllReveals = () => revealables.forEach((el) => el.classList.add('is-in'));

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    showAllReveals();
  } else {
    // Класс на <html> включает стартовое скрытие. Ставим его только здесь:
    // до этой строки страница видна целиком, поэтому упавший JS её не гасит.
    document.documentElement.classList.add('js-reveal');

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });

    revealables.forEach((el) => revealObserver.observe(el));

    // Страховка: первый экран обязан проявиться сразу. Если через 2 секунды
    // не показалось ничего — наблюдатель не работает, показываем всё разом.
    setTimeout(() => {
      if (!revealables.some((el) => el.classList.contains('is-in'))) showAllReveals();
    }, 2000);
  }

  /* ------------------------------------------------------------------ */
  /* Прогресс скролла и активный пункт меню                              */
  /* ------------------------------------------------------------------ */

  const header = $('.site-header');
  const progress = $('.site-header__progress');
  const navLinks = Array.from(nav.querySelectorAll('.nav__link'));
  const sections = GALLERY.map((s) => document.getElementById(s.id));

  let sectionTops = [];
  let maxScroll = 1;
  let headerHeight = 0;

  // Все замеры делаются заранее, чтобы update() на скролле был чистой
  // арифметикой: тогда его можно звать напрямую, без throttle через
  // requestAnimationFrame. Такой throttle умеет залипать — если кадр не
  // отрисовался (вкладка ушла в фон), флаг остаётся взведённым навсегда
  // и подсветка с прогрессом замирают до перезагрузки.
  function measure() {
    headerHeight = header.offsetHeight;
    sectionTops = sections.map((el) => (el ? el.getBoundingClientRect().top + window.scrollY : Infinity));
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    update();
  }

  function update() {
    const y = window.scrollY;
    progress.style.setProperty('--progress', Math.min(100, (y / maxScroll) * 100).toFixed(2) + '%');

    // Активен тот раздел, чей верх последним ушёл выше линии под шапкой
    const line = y + headerHeight + 40;
    let activeIndex = -1;
    for (let i = 0; i < sectionTops.length; i++) {
      if (sectionTops[i] <= line) activeIndex = i;
    }

    navLinks.forEach((link, i) => link.classList.toggle('is-active', i === activeIndex));
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('load', measure);
  // шрифты подгружаются позже и сдвигают раскладку — пересчитываем
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();

  /* ------------------------------------------------------------------ */
  /* Бургер-меню                                                         */
  /* ------------------------------------------------------------------ */

  const burger = $('.burger');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);
  }

  burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  navLinks.forEach((link) => link.addEventListener('click', () => setMenu(false)));

  /* ------------------------------------------------------------------ */
  /* Лайтбокс                                                            */
  /* ------------------------------------------------------------------ */

  const lightbox = $('#lightbox');
  const lbImg = $('.lightbox__img', lightbox);
  const lbStyle = $('.lightbox__style', lightbox);
  const lbCounter = $('.lightbox__counter', lightbox);
  const lbClose = $('.lightbox__close', lightbox);
  const lbPrev = $('.lightbox__nav--prev', lightbox);
  const lbNext = $('.lightbox__nav--next', lightbox);

  let currentSection = null;
  let currentIndex = 0;
  let lastFocused = null;

  function show(index) {
    const photos = currentSection.photos;
    // листаем по кругу в пределах одного раздела
    currentIndex = (index + photos.length) % photos.length;
    const photo = photos[currentIndex];

    lbImg.src = photo.full;
    lbImg.alt = photo.alt;
    lbImg.width = photo.w;
    lbImg.height = photo.h;
    lbStyle.textContent = currentSection.title;
    lbCounter.textContent = (currentIndex + 1) + ' / ' + photos.length;

    // соседние кадры подгружаются заранее — листание идёт без задержки
    [currentIndex - 1, currentIndex + 1].forEach((i) => {
      const neighbour = photos[(i + photos.length) % photos.length];
      if (neighbour && neighbour !== photo) new Image().src = neighbour.full;
    });

    const single = photos.length < 2;
    lbPrev.hidden = single;
    lbNext.hidden = single;
  }

  function openLightbox(sectionId, index, trigger) {
    currentSection = GALLERY.find((s) => s.id === sectionId);
    if (!currentSection) return;

    lastFocused = trigger || null;
    lightbox.style.setProperty('--accent', currentSection.accent);
    show(index);

    lightbox.hidden = false;
    // компенсируем ширину исчезающего скроллбара, иначе страница дёргается
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = gap + 'px';
    document.body.classList.add('is-locked');
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.removeAttribute('src');
    document.body.classList.remove('is-locked');
    document.body.style.paddingRight = '';
    if (lastFocused) lastFocused.focus();
    lastFocused = null;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tile__btn');
    if (!btn) return;
    openLightbox(btn.dataset.section, Number(btn.dataset.index), btn);
  });

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', () => show(currentIndex - 1));
  lbNext.addEventListener('click', () => show(currentIndex + 1));

  // клик по фону закрывает, клик по самому фото — нет
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox__figure')) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) setMenu(false);
      return;
    }

    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'ArrowLeft') { show(currentIndex - 1); return; }
    if (e.key === 'ArrowRight') { show(currentIndex + 1); return; }

    if (e.key === 'Tab') {
      // держим фокус внутри диалога
      const focusable = [lbClose, lbPrev, lbNext].filter((el) => !el.hidden);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // свайп по фото на мобильных
  let touchX = 0;
  let touchY = 0;

  lightbox.addEventListener('touchstart', (e) => {
    touchX = e.changedTouches[0].clientX;
    touchY = e.changedTouches[0].clientY;
  }, { passive: true });

  lightbox.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      show(dx < 0 ? currentIndex + 1 : currentIndex - 1);
    }
  }, { passive: true });

  /* ------------------------------------------------------------------ */
  /* Мелочи                                                              */
  /* ------------------------------------------------------------------ */

  $('#year').textContent = String(new Date().getFullYear());
})();
