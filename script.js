(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const preloader = $('[data-preloader]');
  const progress = $('[data-progress]');
  const heroMedia = $('.hero__media');
  const musicButton = $('[data-music]');
  const calendar = $('[data-calendar]');
  const rsvpForm = $('[data-rsvp]');
  const rsvpStatus = $('[data-rsvp-status]');

  const hidePreloader = () => {
    window.setTimeout(() => preloader?.classList.add('is-hidden'), 520);
  };

  const fillCalendar = () => {
    if (!calendar) return;
    const daysInMay = 31;
    const firstWeekday = 4; // 1 May 2026 is Friday. Grid starts from Monday, therefore four empty cells.
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < firstWeekday; i += 1) {
      const empty = document.createElement('span');
      empty.className = 'calendar__day is-muted';
      empty.setAttribute('aria-hidden', 'true');
      fragment.appendChild(empty);
    }

    for (let day = 1; day <= daysInMay; day += 1) {
      const cell = document.createElement('time');
      cell.className = `calendar__day${day === 26 ? ' is-wedding' : ''}`;
      cell.dateTime = `2026-05-${String(day).padStart(2, '0')}`;
      cell.textContent = String(day);
      if (day === 26) cell.setAttribute('aria-label', '26 мая 2026, дата свадьбы');
      fragment.appendChild(cell);
    }

    calendar.replaceChildren(fragment);
  };

  const initReveal = () => {
    const targets = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((node) => node.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    targets.forEach((node) => observer.observe(node));
  };

  const initScrollEffects = () => {
    const update = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = Math.min(1, Math.max(0, scrollTop / max));
      progress?.style.setProperty('transform', `translateX(-50%) scaleX(${ratio})`);

      if (heroMedia) {
        const drift = Math.min(70, scrollTop * 0.08);
        heroMedia.style.transform = `translateY(${drift}px) scale(1.04)`;
      }
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  };

  const initMusicButton = () => {
    if (!musicButton) return;
    musicButton.addEventListener('click', () => {
      const active = !musicButton.classList.contains('is-active');
      musicButton.classList.toggle('is-active', active);
      musicButton.setAttribute('aria-pressed', String(active));
      $('.music-button__text', musicButton).textContent = active ? 'музыка включена' : 'включить музыку';
    });
  };

  const initRsvp = () => {
    if (!rsvpForm) return;
    rsvpForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(rsvpForm);
      const payload = Object.fromEntries(formData.entries());

      if (!payload.name?.trim() || !payload.count || !payload.attendance) {
        rsvpStatus.textContent = 'Заполните обязательные поля анкеты.';
        return;
      }

      try {
        const current = localStorage.getItem('artur-alisa-rsvp');
        const responses = current ? JSON.parse(current) : [];
        responses.push({ ...payload, createdAt: new Date().toISOString() });
        localStorage.setItem('artur-alisa-rsvp', JSON.stringify(responses));
        rsvpForm.reset();
        rsvpStatus.textContent = 'Спасибо! Ваш ответ сохранён в этой демо-копии.';
      } catch (error) {
        console.error('RSVP local save failed:', error);
        rsvpStatus.textContent = 'Ответ заполнен, но браузер не разрешил локальное сохранение.';
      }
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    fillCalendar();
    initReveal();
    initScrollEffects();
    initMusicButton();
    initRsvp();
    hidePreloader();
  });
})();
