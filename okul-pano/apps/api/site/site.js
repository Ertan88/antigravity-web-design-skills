// Okul Yayın tanıtım sitesi: menü, ürün turu slaytları ve iletişim formu (satır içi betik yok: CSP 'self')
(function () {
  'use strict';

  /* Üst menü: kaydırınca ince çizgi, dar ekranda aç / kapat */
  var top = document.querySelector('.top');
  if (top) {
    var onScroll = function () { top.classList.toggle('scrolled', window.scrollY > 4); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    var menuBtn = top.querySelector('.menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        var open = top.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      top.querySelectorAll('.nav-links a').forEach(function (a) {
        a.addEventListener('click', function () {
          top.classList.remove('open');
          menuBtn.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /* Ürün turu: 6 saniyede bir sonraki slayt; durdurulabilir, sekme gizliyken ve "az hareket" tercihinde kendiliğinden geçmez */
  var tour = document.querySelector('[data-tour]');
  if (tour) {
    var slides = tour.querySelectorAll('.tour-slide');
    var segs = tour.querySelectorAll('.tour-bar .seg');
    var num = tour.querySelector('.tour-cap .n');
    var title = tour.querySelector('.tour-cap .t');
    var pauseBtn = tour.querySelector('.tour-pause');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var index = 0;
    var paused = reduce;
    var timer = null;
    var show = function (i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        s.classList.toggle('on', k === index);
        s.setAttribute('aria-hidden', k === index ? 'false' : 'true');
      });
      segs.forEach(function (s, k) {
        s.classList.toggle('on', k === index);
        s.setAttribute('aria-current', k === index ? 'true' : 'false');
      });
      var cur = slides[index];
      if (num) num.textContent = index + 1 + ' / ' + slides.length + ' · ' + cur.getAttribute('data-kicker');
      if (title) title.textContent = cur.getAttribute('data-title');
    };
    var schedule = function () {
      clearTimeout(timer);
      if (!paused && !document.hidden) timer = setTimeout(function () { show(index + 1); schedule(); }, 6000);
    };
    var setPaused = function (p) {
      paused = p;
      if (pauseBtn) pauseBtn.textContent = p ? '▶ Oynat' : '❚❚ Durdur';
      schedule();
    };
    tour.querySelector('.tour-arrow.prev').addEventListener('click', function () { show(index - 1); schedule(); });
    tour.querySelector('.tour-arrow.next').addEventListener('click', function () { show(index + 1); schedule(); });
    segs.forEach(function (s, k) { s.addEventListener('click', function () { show(k); schedule(); }); });
    if (pauseBtn) pauseBtn.addEventListener('click', function () { setPaused(!paused); });
    document.addEventListener('visibilitychange', schedule);
    show(0);
    setPaused(paused);
  }

  /* İletişim formu */
  var form = document.querySelector('form[data-contact]');
  if (form) {
    var msg = form.querySelector('.form-msg');
    var submit = form.querySelector('button[type=submit]');
    // Bağlantıdan gelen konu (?konu=teklif) önceden seçilir
    var preset = new URLSearchParams(location.search).get('konu');
    if (preset) {
      var radio = form.querySelector('input[name=topic][value="' + preset.replace(/[^a-z]/g, '') + '"]');
      if (radio) radio.checked = true;
    }
    var say = function (text, ok) {
      msg.hidden = false;
      msg.className = 'form-msg ' + (ok ? 'ok' : 'bad');
      msg.textContent = text;
      msg.focus();
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var body = {
        topic: data.get('topic'),
        name: data.get('name'),
        role: data.get('role'),
        school: data.get('school'),
        city: data.get('city'),
        email: data.get('email'),
        phone: data.get('phone') || null,
        time: data.get('time') || null,
        message: data.get('message'),
        consent: data.get('consent') === 'on',
        website: data.get('website') || '',
      };
      submit.disabled = true;
      fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
        })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            say('Teşekkürler, mesajınız bize ulaştı. Okul günlerinde en geç bir iş günü içinde dönüyoruz.', true);
          } else {
            say(res.j.message || 'Mesaj gönderilemedi. Biraz sonra yeniden deneyin.', false);
          }
        })
        .catch(function () { say('Bağlantı kurulamadı. İnternetinizi kontrol edip yeniden deneyin.', false); })
        .then(function () { submit.disabled = false; });
    });
  }
})();
