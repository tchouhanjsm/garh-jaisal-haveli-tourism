(() => {
  'use strict';
  const header = document.querySelector('[data-header]');
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-navigation');
  const contactStatus = document.querySelector('#contact-status');
  const enquiryLinks = Array.from(document.querySelectorAll('[data-enquiry-link]'));
  const phoneLinks = Array.from(document.querySelectorAll('[data-contact-phone]'));
  const alternatePhoneLinks = Array.from(document.querySelectorAll('[data-contact-alt-phone]'));
  const emailLinks = Array.from(document.querySelectorAll('[data-contact-email]'));
  const bookingLinks = Array.from(document.querySelectorAll('[data-booking-link]'));
  const bookingForms = Array.from(document.querySelectorAll('[data-booking-form]'));
  let activeWhatsAppBaseUrl = '';

  function disableContactLink(link, fallbackText) {
    link.setAttribute('href', '#contact-status');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('aria-describedby', 'contact-status');
    link.removeAttribute('target');
    link.removeAttribute('rel');
    if (fallbackText) link.textContent = fallbackText;
  }

  function channelIsAuthorized(config, channel) {
    if (!config || !channel) return false;
    return (config.verificationStatus === 'owner-verified' && channel.status === 'verified')
      || (config.verificationStatus === 'owner-authorized-source' && channel.status === 'source-authorized');
  }

  function enableLink(link, href, options = {}) {
    link.setAttribute('href', href);
    if (options.targetBlank) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
    link.removeAttribute('aria-disabled');
    link.removeAttribute('aria-describedby');
    if (options.text) link.textContent = options.text;
  }

  async function configureContactChannels() {
    if (!enquiryLinks.length && !phoneLinks.length && !alternatePhoneLinks.length
        && !emailLinks.length && !bookingLinks.length && !bookingForms.length) return;
    try {
      if (typeof fetch !== 'function') throw new Error('Fetch is unavailable');
      const scriptUrl = document.currentScript && document.currentScript.src;
      const configUrl = new URL('../content/site-config.json', scriptUrl || window.location.href);
      const response = await fetch(configUrl.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Contact configuration could not be loaded');
      const config = await response.json();
      const contact = config && config.contact ? config.contact : {};
      const booking = config && config.booking ? config.booking : {};
      const contactAuthorized = channelIsAuthorized(config, contact);
      const bookingAuthorized = channelIsAuthorized(config, booking);

      let whatsappBaseUrl = '';
      if (contactAuthorized) {
        try {
          const url = new URL(contact.whatsappBaseUrl);
          if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'wa.me'
              && url.port === '' && /^\\/\\d{8,15}\\/?$/.test(url.pathname)
              && !url.username && !url.password && !url.search && !url.hash) {
            whatsappBaseUrl = url.origin + url.pathname.replace(/\\/$/, '');
          }
        } catch (_) {
          // Invalid configuration keeps every WhatsApp action disabled.
        }
      }
      activeWhatsAppBaseUrl = whatsappBaseUrl;

      const phoneE164 = contactAuthorized && typeof contact.primaryPhoneE164 === 'string'
        && /^\\+[1-9]\\d{7,14}$/.test(contact.primaryPhoneE164) ? contact.primaryPhoneE164 : '';
      const phoneDisplay = contactAuthorized && typeof contact.primaryPhoneDisplay === 'string'
        && contact.primaryPhoneDisplay.trim() && !/[<>\\r\\n]/.test(contact.primaryPhoneDisplay)
        ? contact.primaryPhoneDisplay.trim() : '';
      const alternatePhoneE164 = contactAuthorized && typeof contact.alternatePhoneE164 === 'string'
        && /^\\+[1-9]\\d{7,14}$/.test(contact.alternatePhoneE164) ? contact.alternatePhoneE164 : '';
      const alternatePhoneDisplay = contactAuthorized && typeof contact.alternatePhoneDisplay === 'string'
        && contact.alternatePhoneDisplay.trim() && !/[<>\\r\\n]/.test(contact.alternatePhoneDisplay)
        ? contact.alternatePhoneDisplay.trim() : '';
      const email = contactAuthorized && typeof contact.email === 'string'
        && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(contact.email) ? contact.email.trim() : '';

      let bookingUrl = '';
      if (bookingAuthorized && typeof booking.legacyBookingEngineUrl === 'string') {
        try {
          const url = new URL(booking.legacyBookingEngineUrl);
          if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'asiatech.in'
              && url.port === '' && url.pathname === '/booking_engine/index3'
              && url.searchParams.has('token') && !url.username && !url.password && !url.hash) {
            bookingUrl = url.toString();
          }
        } catch (_) {
          // A malformed or unexpected booking host stays disabled.
        }
      }

      enquiryLinks.forEach(link => {
        if (!whatsappBaseUrl) {
          disableContactLink(link, 'WhatsApp unavailable');
          return;
        }
        const message = link.getAttribute('data-enquiry-message')
          || 'Namaste Garh Jaisal Haveli, I would like to make an enquiry. Please share the current details.';
        enableLink(link, whatsappBaseUrl + '?text=' + encodeURIComponent(message), { targetBlank: true });
      });

      phoneLinks.forEach(link => {
        if (!phoneE164 || !phoneDisplay) {
          disableContactLink(link, 'Phone unavailable');
          return;
        }
        const prefix = link.getAttribute('data-contact-prefix') || 'Call';
        enableLink(link, 'tel:' + phoneE164, { text: (prefix ? prefix + ' ' : '') + phoneDisplay });
      });

      alternatePhoneLinks.forEach(link => {
        if (!alternatePhoneE164 || !alternatePhoneDisplay) {
          disableContactLink(link, 'Landline unavailable');
          return;
        }
        const prefix = link.getAttribute('data-contact-prefix') || 'Landline';
        enableLink(link, 'tel:' + alternatePhoneE164, { text: (prefix ? prefix + ' ' : '') + alternatePhoneDisplay });
      });

      emailLinks.forEach(link => {
        if (!email) {
          disableContactLink(link, 'Email unavailable');
          return;
        }
        const prefix = link.getAttribute('data-contact-prefix') || 'Email';
        enableLink(link, 'mailto:' + email, { text: (prefix ? prefix + ' ' : '') + email });
      });

      bookingLinks.forEach(link => {
        if (!bookingUrl) {
          disableContactLink(link, 'Booking link unavailable');
          return;
        }
        enableLink(link, bookingUrl, { targetBlank: true });
      });

      bookingForms.forEach(form => {
        const submit = form.querySelector('[data-booking-submit]');
        const note = form.querySelector('[data-booking-note]');
        if (submit) submit.disabled = !whatsappBaseUrl;
        if (note) note.textContent = whatsappBaseUrl
          ? 'Opens WhatsApp to ask about availability. This is an enquiry, not a reservation; no payment is taken here.'
          : 'WhatsApp enquiry is unavailable. Your travel details will not be sent.';
      });

      const hasUnavailableChannel = (enquiryLinks.length > 0 && !whatsappBaseUrl)
        || (phoneLinks.length > 0 && (!phoneE164 || !phoneDisplay))
        || (alternatePhoneLinks.length > 0 && (!alternatePhoneE164 || !alternatePhoneDisplay))
        || (emailLinks.length > 0 && !email)
        || (bookingLinks.length > 0 && !bookingUrl)
        || (bookingForms.length > 0 && !whatsappBaseUrl);
      if (contactStatus) contactStatus.hidden = !hasUnavailableChannel;
    } catch (_) {
      if (contactStatus) contactStatus.hidden = false;
      enquiryLinks.forEach(link => disableContactLink(link, 'WhatsApp unavailable'));
      phoneLinks.forEach(link => disableContactLink(link, 'Phone unavailable'));
      alternatePhoneLinks.forEach(link => disableContactLink(link, 'Landline unavailable'));
      emailLinks.forEach(link => disableContactLink(link, 'Email unavailable'));
      bookingLinks.forEach(link => disableContactLink(link, 'Booking link unavailable'));
      bookingForms.forEach(form => {
        const submit = form.querySelector('[data-booking-submit]');
        const note = form.querySelector('[data-booking-note]');
        if (submit) submit.disabled = true;
        if (note) note.textContent = 'Contact details could not be loaded. No travel details have been sent.';
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
