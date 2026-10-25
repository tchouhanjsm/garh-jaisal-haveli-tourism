(() => {
  'use strict';
  const header = document.querySelector('[data-header]');
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-navigation');
  const toast = document.createElement('div');
  toast.className = 'notice-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
  }

  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 20);
  }
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!expanded));
      menuToggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
      nav.classList.toggle('is-open', !expanded);
      document.body.classList.toggle('menu-open', !expanded);
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation');
      nav.classList.remove('is-open');
      document.body.classList.remove('menu-open');
    }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
        nav.classList.remove('is-open');
      }
    });
  }

  document.querySelectorAll('[data-current-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

  document.querySelectorAll('[data-booking-form]').forEach(form => {
    const arrival = form.elements.namedItem('arrival');
    const departure = form.elements.namedItem('departure');
    const note = form.querySelector('[data-booking-note]');
    const today = new Date();
    const todayLocal = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    arrival.min = todayLocal;
    departure.min = todayLocal;
    arrival.addEventListener('change', () => {
      departure.min = arrival.value || todayLocal;
      if (departure.value && arrival.value && departure.value <= arrival.value) departure.value = '';
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (departure.value <= arrival.value) {
        showToast('Departure must be at least one day after arrival.');
        departure.focus();
        return;
      }
      const guestLabel = form.elements.namedItem('guests').selectedOptions[0].textContent;
      const message = `Namaste Garh Jaisal Haveli! I would like to check availability. Arrival: ${arrival.value}. Departure: ${departure.value}. Guests: ${guestLabel}. Please share suitable room options and the current total rate.`;
      const link = `https://wa.me/917727047567?text=${encodeURIComponent(message)}`;
      if (note) note.textContent = 'Opening WhatsApp with your travel details…';
      // Navigate in the same tab to avoid popup blockers and preserve the user's gesture.
      window.location.href = link;
    });
  });

  document.querySelectorAll('[data-accordion]').forEach(group => {
    // Native details/summary provides accessible keyboard support without extra JavaScript.
    group.querySelectorAll('details').forEach(detail => {
      detail.addEventListener('toggle', () => {
        if (!detail.open) return;
        group.querySelectorAll('details[open]').forEach(other => { if (other !== detail) other.open = false; });
      });
    });
  });

  // Reveal only explicitly opted-in content; the default layout remains visible without JS.
  const revealItems = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach(item => observer.observe(item));
  } else revealItems.forEach(item => item.classList.add('is-revealed'));
})();
