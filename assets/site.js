(() => {
  'use strict';
  const header = document.querySelector('[data-header]');
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-navigation');
  const contactStatus = document.querySelector('#contact-status');
  const enquiryLinks = Array.from(document.querySelectorAll('[data-enquiry-link]'));
  const phoneLinks = Array.from(document.querySelectorAll('[data-contact-phone]'));
  const bookingForms = Array.from(document.querySelectorAll('[data-booking-form]'));
  let activeWhatsAppBaseUrl = '';

  function disableContactLink(link) {
    link.setAttribute('href', '#contact-status');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('aria-describedby', 'contact-status');
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }

  async function configureContactChannels() {
    if (!enquiryLinks.length && !phoneLinks.length && !bookingForms.length) return;
    try {
      if (typeof fetch !== 'function') throw new Error('Fetch is unavailable');
      const scriptUrl = document.currentScript && document.currentScript.src;
      const configUrl = new URL('../content/site-config.json', scriptUrl || window.location.href);
      const response = await fetch(configUrl.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Contact configuration could not be loaded');
      const config = await response.json();
      const contact = config && config.contact ? config.contact : {};
      const ownerVerified = config && config.verificationStatus === 'owner-verified' && contact.status === 'verified';
      let whatsappBaseUrl = '';
      if (ownerVerified) {
        try {
          const url = new URL(contact.whatsappBaseUrl);
          if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'wa.me' && url.port === ''
              && /^\/\d{8,15}\/?$/.test(url.pathname)
              && !url.username && !url.password && !url.search && !url.hash) {
            whatsappBaseUrl = url.origin + url.pathname.replace(/\/$/, '');
          }
        } catch (_) {
          // Invalid or incomplete owner configuration keeps every WhatsApp action disabled.
        }
      }
      activeWhatsAppBaseUrl = whatsappBaseUrl;

      const phoneE164 = ownerVerified && typeof contact.primaryPhoneE164 === 'string'
        && /^\+[1-9]\d{7,14}$/.test(contact.primaryPhoneE164) ? contact.primaryPhoneE164 : '';
      const phoneDisplay = ownerVerified && typeof contact.primaryPhoneDisplay === 'string'
        && contact.primaryPhoneDisplay.trim() && !/[<>\r\n]/.test(contact.primaryPhoneDisplay)
        ? contact.primaryPhoneDisplay.trim() : '';

      enquiryLinks.forEach(link => {
        if (!whatsappBaseUrl) {
          disableContactLink(link);
          return;
        }
        const message = link.getAttribute('data-enquiry-message')
          || 'Namaste Garh Jaisal Haveli, I would like to make an enquiry. Please share the current details.';
        link.setAttribute('href', whatsappBaseUrl + '?text=' + encodeURIComponent(message));
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener');
        link.removeAttribute('aria-disabled');
        link.removeAttribute('aria-describedby');
      });

      phoneLinks.forEach(link => {
        if (!phoneE164 || !phoneDisplay) {
          disableContactLink(link);
          link.textContent = 'Phone contact pending verification';
          return;
        }
        const prefix = link.getAttribute('data-contact-prefix') || '';
        link.setAttribute('href', 'tel:' + phoneE164);
        link.textContent = (prefix ? prefix + ' ' : '') + phoneDisplay;
        link.removeAttribute('aria-disabled');
        link.removeAttribute('aria-describedby');
      });

      bookingForms.forEach(form => {
        const submit = form.querySelector('[data-booking-submit]');
        const note = form.querySelector('[data-booking-note]');
        if (submit) submit.disabled = !whatsappBaseUrl;
        if (note) note.textContent = whatsappBaseUrl
          ? 'Opens WhatsApp to ask about availability. This is an enquiry, not a reservation; no payment is taken here.'
          : 'Direct enquiry is temporarily unavailable while contact details are being verified. Your travel details will not be sent.';
      });

      const hasUnavailableChannel = (enquiryLinks.length > 0 && !whatsappBaseUrl)
        || (phoneLinks.length > 0 && (!phoneE164 || !phoneDisplay))
        || (bookingForms.length > 0 && !whatsappBaseUrl);
      if (contactStatus) contactStatus.hidden = !hasUnavailableChannel;
    } catch (_) {
      // Fail closed: keep the static fallback links pointed at the explanation, never an unverified endpoint.
      if (contactStatus) contactStatus.hidden = false;
      bookingForms.forEach(form => {
        const submit = form.querySelector('[data-booking-submit]');
        const note = form.querySelector('[data-booking-note]');
        if (submit) submit.disabled = true;
        if (note) note.textContent = 'Direct enquiry is unavailable because verified contact details could not be loaded. Your travel details have not been sent.';
      });
    }
  }

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
      if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
        nav.classList.remove('is-open');
        document.body.classList.remove('menu-open');
        menuToggle.focus();
      }
    });
  }

  document.querySelectorAll('[data-current-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

  bookingForms.forEach(form => {
    const arrival = form.elements.namedItem('arrival');
    const departure = form.elements.namedItem('departure');
    const note = form.querySelector('[data-booking-note]');
    const submitButton = form.querySelector('[data-booking-submit]');
    if (submitButton) submitButton.disabled = true;
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
      if (!activeWhatsAppBaseUrl) {
        if (note) note.textContent = 'Direct enquiry is unavailable until the hotel verifies its WhatsApp contact channel. Your travel details have not been sent.';
        showToast('Direct enquiry is temporarily unavailable while contact details are being verified.');
        return;
      }
      if (!form.reportValidity()) return;
      if (departure.value <= arrival.value) {
        showToast('Departure must be at least one day after arrival.');
        departure.focus();
        return;
      }
      const guestSelect = form.elements.namedItem('guests');
      const guestLabel = guestSelect && guestSelect.selectedOptions && guestSelect.selectedOptions[0]
        ? guestSelect.selectedOptions[0].textContent : guestSelect.value;
      const message = `Namaste Garh Jaisal Haveli! I would like to check availability. Arrival: ${arrival.value}. Departure: ${departure.value}. Guests: ${guestLabel}. Please share suitable room options and the current total rate.`;
      const link = `${activeWhatsAppBaseUrl}?text=${encodeURIComponent(message)}`;
      if (note) note.textContent = 'Opening WhatsApp with your travel details…';
      // Navigate in the same tab to avoid popup blockers and preserve the user's gesture.
      window.location.href = link;
    });
  });

  configureContactChannels();

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
