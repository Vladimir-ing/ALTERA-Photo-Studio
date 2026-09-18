/*
 * Сборка страницы из данных (js/gallery-data.js): меню, колода портретов,
 * галереи, цена, вопросы, лайтбокс и появление блоков при прокрутке.
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

  // Тексты приходят из файла данных, который правит владелец сайта, но кавычки
  // и угловые скобки в них не должны разваливать разметку.
  const esc = (v) => String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // WebP там, где он поддерживается, JPEG — запасным вариантом.
  // Выбор делает сам <picture>, проверять поддержку из JS не нужно.
  // Обе версии лежат рядом и отличаются только расширением.
  // <picture> выбирает формат сам, но предзагрузка соседних кадров идёт
  // через new Image() — там выбирать некому, поэтому один раз спрашиваем
  // у канваса, умеет ли браузер WebP.
  const supportsWebp = (function () {
    try {
      return document.createElement('canvas')
        .toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { return false; }
  })();

  const picture = (src, attrs) =>
    '<picture>' +
      '<source type="image/webp" srcset="' + src.replace(/\.jpg$/, '.webp') + '">' +
      '<img src="' + src + '" ' + attrs + '>' +
    '</picture>';

  /* ------------------------------------------------------------------ */
  /* Блокировка прокрутки                                                */
  /* ------------------------------------------------------------------ */

  /*
   * Раньше это был класс с overflow: hidden на body. Он не останавливал
   * прокрутку (скроллится html), зато делал body скролл-контейнером: ломалась
   * sticky-шапка и слетала позиция — после закрытия лайтбокса страницу
   * выбрасывало в другое место.
   * Здесь body фиксируется на текущей позиции и возвращается на неё же.
   * Счётчик нужен потому, что замок просят двое — меню и лайтбокс, — и
   * закрытие одного не должно отпускать страницу, пока открыт другой.
   */
  let lockY = 0;
  let lockCount = 0;

  function lockScroll() {
    if (lockCount++) return;
    lockY = window.scrollY;
    // компенсируем ширину исчезающего скроллбара, иначе страница дёргается
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const style = document.body.style;
    style.position = 'fixed';
    style.top = -lockY + 'px';
    style.left = '0';
    style.right = '0';
    if (gap > 0) style.paddingRight = gap + 'px';
  }

  function unlockScroll() {
    if (lockCount === 0 || --lockCount) return;
    const style = document.body.style;
    style.position = style.top = style.left = style.right = style.paddingRight = '';
    // behavior: 'instant' обязателен: у html стоит scroll-behavior: smooth,
    // и обычный scrollTo проигрывал бы возврат анимацией — страница уползала
    // на глазах у того, кто просто закрыл лайтбокс.
    window.scrollTo({ top: lockY, left: 0, behavior: 'instant' });
  }

  /* ------------------------------------------------------------------ */
  /* Меню                                                                */
  /* ------------------------------------------------------------------ */

  const nav = $('#site-nav');

  GALLERY.forEach((section) => {
    const link = document.createElement('a');
    link.className = 'nav__link';
    link.href = '#' + section.id;
    // короткое имя: полные названия не помещаются в узкое меню
    link.textContent = section.short || section.title;
    link.dataset.target = section.id;
    nav.appendChild(link);
  });

  /* ------------------------------------------------------------------ */
  /* Серия: мужская или женская фотосессия                               */
  /* ------------------------------------------------------------------ */

  /*
   * Выбор серии живёт в трёх местах по старшинству: параметр ?s= в адресе
   * (чтобы можно было дать ссылку сразу на женскую серию), память браузера
   * и, если нигде ничего нет, первая серия из SERIES.
   * Память браузера может быть недоступна (приватный режим) — тогда просто
   * ничего не запоминаем.
   */
  const SERIES_LIST = (typeof SERIES !== 'undefined' && SERIES.length)
    ? SERIES : [{ id: 'man', label: 'Мужчина' }];
  const SERIES_KEY = 'aiterra-series';
  const isSeries = (id) => SERIES_LIST.some((s) => s.id === id);

  let series = (function () {
    const fromUrl = new URLSearchParams(location.search).get('s');
    if (isSeries(fromUrl)) return fromUrl;
    try {
      const saved = localStorage.getItem(SERIES_KEY);
      if (isSeries(saved)) return saved;
    } catch (e) { /* без памяти — берём серию по умолчанию */ }
    return SERIES_LIST[0].id;
  })();

  const photosOf = (section) => (section.photos && section.photos[series]) || [];

  // Переключатель в духе iOS: две кнопки, нажатая подсвечена плашкой
  function seriesSwitch() {
    const box = document.createElement('div');
    box.className = 'series-switch';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Чья фотосессия');
    box.innerHTML = SERIES_LIST.map((s) =>
      '<button type="button" class="series-switch__btn" data-series="' + s.id + '">' + esc(s.label) + '</button>'
    ).join('');
    return box;
  }

  /* ------------------------------------------------------------------ */
  /* Хиро: колода портретов                                              */
  /* ------------------------------------------------------------------ */

  // По кадру из каждого стиля. Место карточки в колоде задают --o (смещение
  // от центра: …-2, -1, 0, 1, 2…) и --d (глубина, модуль смещения); их
  // пересчитывает placeDeck(), а таймер ниже сдвигает колоду на шаг.
  const stack = $('.hero__stack');
  const stackCards = [];
  let deckTop = 0;

  function placeDeck() {
    const n = stackCards.length;
    stackCards.forEach((card, i) => {
      const rel = (i - deckTop + n) % n;
      // половина колоды справа от центра, половина слева
      const o = rel <= n / 2 ? rel : rel - n;
      card.style.setProperty('--o', o);
      card.style.setProperty('--d', Math.abs(o));
    });
  }

  // Карточки создаются один раз, при смене серии меняются только кадры.
  // Первый кадр грузим сразу: он попадает на первый экран.
  function renderDeck() {
    stackCards.forEach((card, i) => {
      const photo = photosOf(GALLERY[i])[0];
      card.hidden = !photo;
      if (!photo) return;
      $('.hero__card-img', card).innerHTML =
        picture(photo.thumb, 'alt="" width="' + photo.w + '" height="' + photo.h + '"' +
          (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"');
    });
  }

  if (stack) {
    GALLERY.forEach((section) => {
      const card = document.createElement('div');
      card.className = 'hero__card';
      card.innerHTML =
        '<div class="hero__card-img"></div>' +
        '<span class="hero__card-name">' + esc(section.title) + '</span>';
      stack.appendChild(card);
      stackCards.push(card);
    });
    renderDeck();
    placeDeck();
  }

  // Переключатель на первом экране — сразу над колодой
  const heroSlot = $('.hero__series');
  if (heroSlot && SERIES_LIST.length > 1) heroSlot.appendChild(seriesSwitch());

  /* ------------------------------------------------------------------ */
  /* Исходник → результат                                                */
  /* ------------------------------------------------------------------ */

  // Раздела нет, пока в данных нет исходного снимка — см. COMPARE
  // в gallery-data.js. Пустой блок лучше не показывать вовсе.
  const compareOf = () => (typeof COMPARE !== 'undefined' && COMPARE && COMPARE[series]) || null;
  let compareEl = null;

  function renderCompare() {
    if (!compareEl) return;
    const c = compareOf();
    compareEl.hidden = !c;
    if (!c) return;
    $('.compare__after', compareEl).innerHTML =
      picture(c.after.src, 'alt="' + esc(c.after.alt) + '"' +
        ' width="' + c.after.w + '" height="' + c.after.h + '" decoding="async"');
    const before = $('.compare__before', compareEl);
    before.src = c.before.src;
    before.alt = c.before.alt;
    $('.compare__text .style__desc', compareEl).textContent = c.description || '';
  }

  if (compareOf()) {
    const slot = $('#compare-slot');
    const el = document.createElement('section');
    el.className = 'compare';
    el.id = 'compare';
    el.setAttribute('aria-labelledby', 'compare-title');
    el.innerHTML =
      '<div class="wrap">' +
        '<div class="compare__grid reveal">' +
          '<div>' +
            '<div class="compare__viewer" style="--pos:50%">' +
              '<div class="compare__after"></div>' +
              // Исходник — обычный <img>, а не <picture>: WebP-версии у него может
              // не быть, а <source> с несуществующим файлом не откатывается
              // на <img>, а просто ломает картинку.
              '<img class="compare__before" alt="" width="848" height="1264" decoding="async">' +
              '<div class="compare__handle" aria-hidden="true"></div>' +
              '<input class="compare__range" type="range" min="0" max="100" value="50" step="1"' +
                ' aria-label="Сдвинуть границу между исходником и результатом">' +
            '</div>' +
            '<div class="compare__tags" aria-hidden="true">' +
              '<span>Исходник</span><span>Результат</span>' +
            '</div>' +
          '</div>' +
          '<div class="compare__text">' +
            '<p class="eyebrow">' + esc(COMPARE.tagline || 'Исходник и результат') + '</p>' +
            '<h2 class="style__title" id="compare-title">' + esc(COMPARE.title || 'Из обычного снимка') + '</h2>' +
            '<p class="style__desc"></p>' +
          '</div>' +
        '</div>' +
      '</div>';
    slot.appendChild(el);
    compareEl = el;
    renderCompare();

    const viewer = $('.compare__viewer', el);
    const range = $('.compare__range', el);
    const move = () => viewer.style.setProperty('--pos', range.value + '%');
    range.addEventListener('input', move);
    move();

    // Если исходника ещё нет в assets/img/source/, раздел прячется сам.
    // Так данные можно заполнить заранее, а файл дослать позже: до этого
    // на странице просто нет блока, а не битая картинка во весь экран.
    const before = $('.compare__before', el);
    before.addEventListener('error', () => { el.hidden = true; });
    before.addEventListener('load', () => { el.hidden = false; });
  }

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

  // Переключатель над разделами прилипает под шапкой, пока открыты галереи:
  // листая женскую серию, не нужно возвращаться наверх, чтобы сменить её.
  if (SERIES_LIST.length > 1) {
    const bar = document.createElement('div');
    bar.className = 'series-bar';
    bar.appendChild(seriesSwitch());
    work.appendChild(bar);
  }

  // Сетка раздела под текущую серию: плитки, счётчик кадров, раскладка
  function renderGrid(section, el) {
    const photos = photosOf(section);
    const count = photos.length;
    const grid = $('.grid', el);

    grid.className = 'grid' + (count <= FEATURE_LIMIT ? ' grid--feature' : '');
    // --cols нужен обеим раскладкам: он не даёт ряду растянуться шире,
    // чем требует фактическое число кадров
    grid.style.setProperty('--cols', count);
    grid.innerHTML = photos.map((photo, i) =>
      '<li class="tile">' +
        '<button class="tile__btn" type="button" data-section="' + section.id + '" data-index="' + i + '"' +
          ' aria-label="Открыть фото ' + (i + 1) + ' из ' + count + ', стиль «' + esc(section.title) + '»">' +
          picture(photo.thumb, 'alt="' + esc(photo.alt) + '" width="' + photo.w + '" height="' + photo.h + '"' +
            ' loading="lazy" decoding="async"') +
          '<span class="tile__idx">' + String(i + 1).padStart(2, '0') + '</span>' +
        '</button>' +
      '</li>'
    ).join('');
    $('.style__count', el).textContent = count + ' ' + plural(count, 'кадр', 'кадра', 'кадров');
    // раздел без кадров в этой серии не показываем вовсе
    el.hidden = count === 0;
  }

  const styleEls = GALLERY.map((section) => {
    const el = document.createElement('section');
    el.className = 'style';
    el.id = section.id;
    el.setAttribute('aria-labelledby', section.id + '-title');

    el.innerHTML =
      '<div class="wrap">' +
        '<header class="style__head reveal">' +
          '<div>' +
            '<span class="style__num" aria-hidden="true">' + section.num + '</span>' +
            '<h2 class="style__title" id="' + section.id + '-title">' + esc(section.title) + '</h2>' +
            '<p class="style__tagline">' + esc(section.tagline) + '</p>' +
          '</div>' +
          '<div>' +
            '<p class="style__desc">' + esc(section.description) + '</p>' +
            '<p class="style__count"></p>' +
          '</div>' +
        '</header>' +
        '<ul class="grid"></ul>' +
      '</div>';

    renderGrid(section, el);
    work.appendChild(el);
    return el;
  });

  /* ------------------------------------------------------------------ */
  /* Ещё образы                                                          */
  /* ------------------------------------------------------------------ */

  // Лента карточек дополнительных стилей. Стиль без кадров в текущей серии
  // пропускается, блок без единой карточки прячется целиком.
  const extraSlot = $('#extra-slot');
  let extraEl = null;

  function renderExtra() {
    if (!extraEl) return;
    const cards = EXTRA_STYLES
      .map((st) => ({ st: st, photo: photosOf(st)[0] }))
      .filter((c) => c.photo);

    extraEl.hidden = cards.length === 0;
    $('.extra__track', extraEl).innerHTML = cards.map((c) =>
      '<li class="extra-card">' +
        '<div class="extra-card__img">' +
          picture(c.photo.thumb, 'alt="' + esc(c.photo.alt) + '" width="' + c.photo.w + '" height="' + c.photo.h + '"' +
            ' loading="lazy" decoding="async"') +
        '</div>' +
        '<div class="extra-card__body">' +
          '<p class="extra-card__tagline">' + esc(c.st.tagline || '') + '</p>' +
          '<h3 class="extra-card__title">' + esc(c.st.title) + '</h3>' +
          '<p class="extra-card__desc">' + esc(c.st.description || '') + '</p>' +
          '<a class="link-more" href="' + esc(messengerUrl('telegram', CONTACT.greetingForExtra(c.st.title))) + '"' +
            ' target="_blank" rel="noopener noreferrer">Добавить к заказу</a>' +
        '</div>' +
      '</li>'
    ).join('');
  }

  if (extraSlot && typeof EXTRA_STYLES !== 'undefined' && EXTRA_STYLES.length &&
      typeof CONTACT !== 'undefined' && CONTACT.greetingForExtra) {
    const el = document.createElement('section');
    el.className = 'extra';
    el.id = 'extra';
    el.setAttribute('aria-labelledby', 'extra-title');
    el.innerHTML =
      '<div class="wrap">' +
        '<div class="section-head reveal">' +
          '<p class="eyebrow">Ещё образы</p>' +
          '<h2 class="section-title" id="extra-title">Больше стилей. <span class="dim">' +
            // неразрывные пробелы: сумма не должна рваться на «+1» и «000 ₽»
            esc((PRICING.extra ? PRICING.extra.price : '+1 000 ₽').replace(/ /g, ' ')) +
            ' за каждый.</span></h2>' +
          '<p class="section-lead">Добавь к фотосессии любой из этих образов — сверх пяти основных направлений.</p>' +
        '</div>' +
      '</div>' +
      '<ul class="extra__track"></ul>';
    extraSlot.appendChild(el);
    extraEl = el;
    renderExtra();
  }

  /* ------------------------------------------------------------------ */
  /* Смена серии                                                         */
  /* ------------------------------------------------------------------ */

  function markSwitches() {
    document.querySelectorAll('.series-switch__btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.series === series));
    });
  }

  // Высоты разделов после смены серии могут измениться, и подсветке меню
  // нужны свежие замеры. Сама функция замера объявлена ниже — сюда её
  // подставляет блок подсветки меню.
  let afterSeriesChange = () => {};

  function applySeries() {
    renderDeck();
    renderCompare();
    GALLERY.forEach((section, i) => renderGrid(section, styleEls[i]));
    renderExtra();
    markSwitches();
    afterSeriesChange();
  }

  function setSeries(id) {
    if (!isSeries(id) || id === series) return;
    series = id;
    try { localStorage.setItem(SERIES_KEY, id); } catch (e) { /* без памяти */ }

    // Адрес отражает выбор — ссылку можно переслать как есть
    try {
      const url = new URL(location.href);
      if (id === SERIES_LIST[0].id) url.searchParams.delete('s'); else url.searchParams.set('s', id);
      history.replaceState(history.state, '', url);
    } catch (e) { /* при открытии с диска адрес может не меняться — не страшно */ }

    // Кадры гаснут, меняются и проявляются снова: без этого подмена
    // выглядит как мигание
    if (prefersReducedMotion) { applySeries(); return; }
    const root = document.documentElement;
    root.classList.add('series-fading');
    setTimeout(() => {
      applySeries();
      requestAnimationFrame(() => root.classList.remove('series-fading'));
    }, 220);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.series-switch__btn');
    if (btn) setSeries(btn.dataset.series);
  });

  markSwitches();

  /* ------------------------------------------------------------------ */
  /* Цена                                                                */
  /* ------------------------------------------------------------------ */

  // Ссылка в мессенджер с заготовленным первым сообщением: владельцу сразу
  // видно, о каком пакете речь, а человеку не надо придумывать, с чего начать.
  function messengerUrl(kind, text) {
    const c = CONTACT[kind];
    return c.url + '?text=' + encodeURIComponent(text);
  }

  const priceSlot = $('.packages__slot');

  if (priceSlot && typeof PRICING !== 'undefined' && PRICING) {
    const href = CONTACT.channel ? CONTACT.channel.url : messengerUrl('telegram', CONTACT.greeting);

    priceSlot.innerHTML =
      '<div class="price reveal">' +
        '<div class="price__main">' +
          '<p class="price__value">' + esc(PRICING.price) + '</p>' +
          (PRICING.priceNote ? '<p class="price__note">' + esc(PRICING.priceNote) + '</p>' : '') +
          '<p class="price__unit">' + esc(PRICING.unit) + '</p>' +
          // Доплата необязательна: нет PRICING.extra — второй строки нет
          (PRICING.extra
            ? '<div class="price__extra">' +
                '<p class="price__extra-sum">' + esc(PRICING.extra.price) + '</p>' +
                '<p class="price__extra-unit">' + esc(PRICING.extra.unit) + '</p>' +
                (PRICING.extra.note
                  ? '<p class="price__extra-note">' + esc(PRICING.extra.note) + '</p>'
                  : '') +
              '</div>'
            : '') +
          '<p class="price__meta">' +
            'Срок: ' + esc(PRICING.lead) + '<br>' + esc(PRICING.shots) +
          '</p>' +
          '<a class="btn btn--solid btn--lg" href="' + href + '" target="_blank" rel="noopener noreferrer">' +
            'Обсудить фотосессию</a>' +
        '</div>' +
        '<ul class="price__items">' +
          PRICING.items.map((i) => '<li>' + esc(i) + '</li>').join('') +
        '</ul>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Вопросы                                                             */
  /* ------------------------------------------------------------------ */

  // Сами вопросы лежат в index.html — так они видны поисковику и работают
  // без JS. Отсюда только разметка FAQPage: собираем её из тех же элементов,
  // поэтому текст в выдаче и текст на странице разойтись не могут.
  const faqItems = Array.from(document.querySelectorAll('.faq__item'));

  if (faqItems.length) {
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.querySelector('.faq__q').textContent.trim(),
        acceptedAnswer: { '@type': 'Answer', text: item.querySelector('.faq__a').textContent.trim() }
      }))
    });
    document.head.appendChild(ld);
  }

  /* ------------------------------------------------------------------ */
  /* Контакты и липкая кнопка                                            */
  /* ------------------------------------------------------------------ */

  if (typeof CONTACT !== 'undefined') {
    document.querySelectorAll('[data-contact]').forEach((link) => {
      const kind = link.dataset.contact;
      if (!CONTACT[kind]) return;
      // В канал сообщение не отправить — параметр ?text= там только мусор
      link.href = kind === 'channel'
        ? CONTACT.channel.url
        : messengerUrl(kind, CONTACT.greeting);
    });

    // Кнопки призыва к действию ведут в канал. Адрес живёт в одном месте —
    // в CONTACT, — поэтому проставляется отсюда, а не зашит в разметку.
    // В разметке они остаются якорями на #contact: если JS не выполнится,
    // человек попадёт в блок контактов и всё равно сможет написать.
    if (CONTACT.channel) {
      [$('#cta-header'), $('#cta-dock')].forEach((btn) => {
        if (!btn) return;
        btn.href = CONTACT.channel.url;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
      });
    }
  }

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
  /* Активный пункт меню и липкая кнопка                                 */
  /* ------------------------------------------------------------------ */

  const header = $('.site-header');
  const dock = $('#cta-dock');
  const hero = $('.hero');
  const navLinks = Array.from(nav.querySelectorAll('.nav__link'));

  // Кроме галерейных разделов считаем и те, что идут после них: иначе,
  // докрутив до «Как это работает», пользователь видел подсвеченным
  // последний стиль, будто он всё ещё в нём.
  const sections = GALLERY.map((s) => document.getElementById(s.id))
    .concat(['how', 'packages', 'faq', 'contact'].map((id) => document.getElementById(id)));

  const packagesEl = document.getElementById('packages');

  let sectionTops = [];
  let headerHeight = 0;
  let heroBottom = 0;
  let packagesRange = [Infinity, Infinity];

  // Все замеры делаются заранее, чтобы update() на скролле был чистой
  // арифметикой: тогда его можно звать напрямую, без throttle через
  // requestAnimationFrame. Такой throttle умеет залипать — если кадр не
  // отрисовался (вкладка ушла в фон), флаг остаётся взведённым навсегда
  // и подсветка с прогрессом замирают до перезагрузки.
  function measure() {
    headerHeight = header.offsetHeight;
    sectionTops = sections.map((el) => (el ? el.getBoundingClientRect().top + window.scrollY : Infinity));
    heroBottom = hero ? hero.getBoundingClientRect().bottom + window.scrollY : 0;
    if (packagesEl) {
      const r = packagesEl.getBoundingClientRect();
      packagesRange = [r.top + window.scrollY, r.bottom + window.scrollY];
    }
    update();
  }

  function update() {
    const y = window.scrollY;
    // Активен тот раздел, чей верх последним ушёл выше линии под шапкой
    const line = y + headerHeight + 40;
    let activeIndex = -1;
    for (let i = 0; i < sectionTops.length; i++) {
      if (sectionTops[i] <= line) activeIndex = i;
    }

    navLinks.forEach((link, i) => link.classList.toggle('is-active', i === activeIndex));

    // Кнопка появляется, когда хиро уехало, и прячется над футером,
    // чтобы не закрывать контакты — они там и так крупные.
    if (dock) {
      const footerTop = sectionTops[sectionTops.length - 1];
      const bottom = y + window.innerHeight;
      // В пакетах кнопка молчит: у каждой карточки своя, и плавающая
      // накрывала бы её собой.
      const overPackages = bottom > packagesRange[0] + 200 && y < packagesRange[1];
      dock.classList.toggle('is-shown',
        y > heroBottom && bottom < footerTop + 120 && !overPackages);
    }
  }

  afterSeriesChange = measure;

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
    if (open === nav.classList.contains('is-open')) return;
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    if (open) lockScroll(); else unlockScroll();
  }

  burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  navLinks.forEach((link) => link.addEventListener('click', () => setMenu(false)));

  /* ------------------------------------------------------------------ */
  /* Лайтбокс                                                            */
  /* ------------------------------------------------------------------ */

  const lightbox = $('#lightbox');
  const lbImg = $('.lightbox__img', lightbox);
  const lbSource = $('.lightbox__source', lightbox);
  const lbStyle = $('.lightbox__style', lightbox);
  const lbCounter = $('.lightbox__counter', lightbox);
  const lbClose = $('.lightbox__close', lightbox);
  const lbPrev = $('.lightbox__nav--prev', lightbox);
  const lbNext = $('.lightbox__nav--next', lightbox);

  let currentSection = null;
  let currentIndex = 0;
  let lastFocused = null;

  function show(index) {
    const photos = photosOf(currentSection);
    // листаем по кругу в пределах одного раздела
    currentIndex = (index + photos.length) % photos.length;
    const photo = photos[currentIndex];

    if (lbSource) lbSource.srcset = photo.full.replace(/\.jpg$/, '.webp');
    lbImg.src = photo.full;
    lbImg.alt = photo.alt;
    lbImg.width = photo.w;
    lbImg.height = photo.h;
    lbStyle.textContent = currentSection.title;
    lbCounter.textContent = (currentIndex + 1) + ' / ' + photos.length;

    // соседние кадры подгружаются заранее — листание идёт без задержки
    [currentIndex - 1, currentIndex + 1].forEach((i) => {
      const neighbour = photos[(i + photos.length) % photos.length];
      if (neighbour && neighbour !== photo) {
        const pre = new Image();
        pre.src = supportsWebp ? neighbour.full.replace(/\.jpg$/, '.webp') : neighbour.full;
      }
    });

    const single = photos.length < 2;
    lbPrev.hidden = single;
    lbNext.hidden = single;
  }

  function openLightbox(sectionId, index, trigger) {
    currentSection = GALLERY.find((s) => s.id === sectionId);
    if (!currentSection || !photosOf(currentSection).length) return;

    lastFocused = trigger || null;
    show(index);

    lightbox.hidden = false;
    lockScroll();
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.removeAttribute('src');
    if (lbSource) lbSource.removeAttribute('srcset');
    unlockScroll();
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
  /* Движение: колода портретов                                          */
  /* ------------------------------------------------------------------ */

  // Колода сдвигается на шаг влево. Крутим только пока хиро на экране —
  // фоновая анимация впустую греет батарею.
  if (!prefersReducedMotion && stackCards.length > 1) {
    let timer = null;

    const rotate = () => {
      deckTop = (deckTop + 1) % stackCards.length;
      placeDeck();
    };

    const startDeck = () => { if (!timer) timer = setInterval(rotate, 3600); };
    const stopDeck = () => { clearInterval(timer); timer = null; };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries[0].isIntersecting ? startDeck() : stopDeck();
      }, { threshold: .15 }).observe(stack);
    } else {
      startDeck();
    }

    document.addEventListener('visibilitychange', () => {
      document.hidden ? stopDeck() : startDeck();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Прямая ссылка с якорем                                              */
  /* ------------------------------------------------------------------ */

  /*
   * Разделы галереи собираются этим скриптом, а браузер обрабатывает #якорь
   * ещё во время разбора страницы — прыгать тогда некуда, секции ещё нет.
   * Поэтому по ссылке вида ...#cinematic человек попадал на верх страницы
   * и видел пустой первый экран вместо нужной серии. Доводим прокрутку сами.
   *
   * Обычные клики по меню сюда не попадают: к тому моменту секции на месте,
   * и браузер справляется штатно, вместе со scroll-margin-top из CSS.
   */

  function sectionFromHash() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
    if (!raw) return null;
    // старые адреса исчезнувших разделов ведут на их преемников
    const id = (typeof ALIASES !== 'undefined' && ALIASES[raw]) || raw;
    return document.getElementById(id);
  }

  function jumpToHash() {
    const el = sectionFromHash();
    if (!el) return false;

    // Кадры нужного раздела грузим сразу. Ленивая загрузка рассчитана на
    // прокрутку сверху вниз: при прыжке вглубь страницы плитки иначе
    // остаются пустыми ровно там, куда человек и пришёл смотреть.
    el.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });

    // 'instant' обязателен: у html стоит scroll-behavior: smooth, и открытие
    // прямой ссылки превращалось бы в долгую прокрутку через всю страницу.
    el.scrollIntoView({ behavior: 'instant', block: 'start' });
    return true;
  }

  if (location.hash) {
    // Человек тронул страницу сам — больше никуда её не двигаем
    let touched = false;
    const markTouched = () => { touched = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) =>
      window.addEventListener(ev, markTouched, { passive: true, once: true })
    );

    jumpToHash();

    /*
     * Повторный заход после загрузки картинок и шрифтов: они меняют высоту
     * блоков выше цели, и первый прыжок уезжает на десятки пикселей.
     * Позиции разделов пересчитываем перед этим — measure() их кеширует.
     */
    const settle = () => {
      if (touched) return;
      measure();
      jumpToHash();
    };
    window.addEventListener('load', settle, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
  }

  // Переход по якорю внутри страницы (в том числе назад-вперёд в браузере)
  window.addEventListener('hashchange', () => {
    const el = sectionFromHash();
    if (el) el.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  });

  /* ------------------------------------------------------------------ */
  /* Мелочи                                                              */
  /* ------------------------------------------------------------------ */

  $('#year').textContent = String(new Date().getFullYear());
})();
