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
  const propertyMapLinks = Array.from(document.querySelectorAll('[data-property-map-link]'));
  const bookingForms = Array.from(document.querySelectorAll('[data-booking-form]'));
  const guestEnquiryForms = Array.from(document.querySelectorAll('[data-guest-enquiry-form]'));
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


  function configureGuestEnquiryForms(config) {
    guestEnquiryForms.forEach(form => {
      const submit = form.querySelector('[data-guest-enquiry-submit]');
      const status = form.querySelector('[data-guest-enquiry-status]');
      const experienceField = form.querySelector('[name="experience"]');
      const arrivalField = form.querySelector('[name="arrival"]');
      const departureField = form.querySelector('[name="departure"]');
      const contact = config && config.contact ? config.contact : {};
      const authorized = channelIsAuthorized(config, contact);
      let whatsappBase = '';
      if (authorized && typeof contact.whatsappBaseUrl === 'string') {
        try {
          const url = new URL(contact.whatsappBaseUrl);
          if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'wa.me'
              && url.port === '' && /^\/\d{8,15}\/?$/.test(url.pathname)
              && !url.username && !url.password && !url.search && !url.hash) {
            whatsappBase = url.origin + url.pathname.replace(/\/$/, '');
          }
        } catch (_) {
          whatsappBase = '';
        }
      }
      if (!submit || !status || !experienceField || !arrivalField || !departureField || !whatsappBase) {
        if (submit) submit.disabled = true;
        if (status) {
          status.dataset.state = 'error';
          status.textContent = 'The enquiry form is unavailable because an authorized WhatsApp destination could not be loaded. No message has been sent. Refresh this page and try again, or use contact details supplied directly by the hotel.';
        }
        return;
      }

      const selectedExperienceRequiresDeparture = () => {
        const selected = experienceField.selectedOptions && experienceField.selectedOptions[0];
        return Boolean(selected && selected.getAttribute('data-requires-departure') === 'true');
      };

      const localDateString = date => {
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
      };
      const updateDateConstraints = () => {
        // Recompute today on every edit and submit so a tab left open across
        // local midnight cannot keep accepting yesterday as an arrival date.
        const today = localDateString(new Date());
        const arrival = String(arrivalField.value || '');
        const departure = String(departureField.value || '');
        arrivalField.min = today;
        departureField.required = selectedExperienceRequiresDeparture();
        // Never allow a departure date before today, even while an invalid
        // past arrival is being corrected. When supplied, departure must be
        // later than the requested date even for an otherwise day-only enquiry.
        departureField.min = arrival > today ? arrival : today;
        departureField.setCustomValidity(
          arrival && departure && departure <= arrival
            ? 'Departure must be after arrival.'
            : ''
        );
      };
      ['input', 'change'].forEach(type => {
        arrivalField.addEventListener(type, updateDateConstraints);
        departureField.addEventListener(type, updateDateConstraints);
      });
      experienceField.addEventListener('change', updateDateConstraints);
      updateDateConstraints();

      submit.disabled = false;
      status.dataset.state = 'ready';
      status.textContent = 'Ready. Review the details, then prepare a WhatsApp draft. Nothing is sent automatically.';
      form.addEventListener('submit', event => {
        event.preventDefault();
        updateDateConstraints();
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const experience = String(data.get('experience') || '').trim();
        const arrival = String(data.get('arrival') || '');
        const departure = String(data.get('departure') || '');
        const departureRequired = selectedExperienceRequiresDeparture();
        if (!experience || !arrival || (departureRequired && !departure) || (departure && departure <= arrival)) return;
        const lines = [
          'Namaste Garh Jaisal Haveli, I would like to enquire about a stay or experience.',
          'Interest: ' + experience,
          'Requested date / arrival: ' + arrival,
          ...(departure ? ['Departure: ' + departure] : []),
          'Guests: ' + String(data.get('guests') || 'Not specified')
        ];
        const notes = String(data.get('notes') || '').trim();
        if (notes) lines.push('Additional details: ' + notes.slice(0, 500));
        lines.push('Please confirm current availability, arrangements, inclusions and total price. I understand this enquiry does not confirm a booking.');
        const target = whatsappBase + '?text=' + encodeURIComponent(lines.join('\n'));
        window.open(target, '_blank', 'noopener,noreferrer');
        status.dataset.state = 'ready';
        status.textContent = 'Your WhatsApp draft is ready to review in the new tab. If it did not open, check your browser’s pop-up settings. No reservation is confirmed by this website.';
      });
    });
  }

  async function configureContactChannels() {
    if (!enquiryLinks.length && !phoneLinks.length && !alternatePhoneLinks.length
        && !emailLinks.length && !bookingLinks.length && !propertyMapLinks.length
        && !bookingForms.length && !guestEnquiryForms.length) return;
    try {
      if (typeof fetch !== 'function') throw new Error('Fetch is unavailable');
      const scriptUrl = document.currentScript && document.currentScript.src;
      const configUrl = new URL('../content/site-config.json', scriptUrl || window.location.href);
      const response = await fetch(configUrl.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Contact configuration could not be loaded');
      const config = await response.json();
      const contact = config && config.contact ? config.contact : {};
      const booking = config && config.booking ? config.booking : {};
      const propertyNavigation = config && config.propertyNavigation ? config.propertyNavigation : {};
      configureGuestEnquiryForms(config);
      const contactAuthorized = channelIsAuthorized(config, contact);
      const bookingAuthorized = channelIsAuthorized(config, booking);
      const propertyNavigationAuthorized = channelIsAuthorized(config, propertyNavigation);

      let whatsappBaseUrl = '';
      if (contactAuthorized) {
        try {
          const url = new URL(contact.whatsappBaseUrl);
          if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'wa.me'
              && url.port === '' && /^\/\d{8,15}\/?$/.test(url.pathname)
              && !url.username && !url.password && !url.search && !url.hash) {
            whatsappBaseUrl = url.origin + url.pathname.replace(/\/$/, '');
          }
        } catch (_) {
          // Invalid configuration keeps every WhatsApp action disabled.
        }
      }
      activeWhatsAppBaseUrl = whatsappBaseUrl;

      const phoneE164 = contactAuthorized && typeof contact.primaryPhoneE164 === 'string'
        && /^\+[1-9]\d{7,14}$/.test(contact.primaryPhoneE164) ? contact.primaryPhoneE164 : '';
      const phoneDisplay = contactAuthorized && typeof contact.primaryPhoneDisplay === 'string'
        && contact.primaryPhoneDisplay.trim() && !/[<>\r\n]/.test(contact.primaryPhoneDisplay)
        ? contact.primaryPhoneDisplay.trim() : '';
      const alternatePhoneE164 = contactAuthorized && typeof contact.alternatePhoneE164 === 'string'
        && /^\+[1-9]\d{7,14}$/.test(contact.alternatePhoneE164) ? contact.alternatePhoneE164 : '';
      const alternatePhoneDisplay = contactAuthorized && typeof contact.alternatePhoneDisplay === 'string'
        && contact.alternatePhoneDisplay.trim() && !/[<>\r\n]/.test(contact.alternatePhoneDisplay)
        ? contact.alternatePhoneDisplay.trim() : '';
      const email = contactAuthorized && typeof contact.email === 'string'
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ? contact.email.trim() : '';

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

      let hotelMapUrl = '';
      if (propertyNavigationAuthorized && typeof propertyNavigation.hotelMapUrl === 'string') {
        try {
          const url = new URL(propertyNavigation.hotelMapUrl);
          if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'maps.app.goo.gl'
              && url.port === '' && /^\/[A-Za-z0-9_-]{6,}$/.test(url.pathname)
              && !url.username && !url.password && !url.search && !url.hash) {
            hotelMapUrl = url.origin + url.pathname;
          }
        } catch (_) {
          // An invalid or unexpected map destination remains disabled.
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
      propertyMapLinks.forEach(link => {
        if (!hotelMapUrl) {
          disableContactLink(link, 'Map link unavailable');
          return;
        }
        enableLink(link, hotelMapUrl, { targetBlank: true });
      });

      bookingForms.forEach(form => {
        const submit = form.querySelector('[data-booking-submit]');
        const note = form.querySelector('[data-booking-note]');
        if (submit) submit.disabled = !whatsappBaseUrl;
        if (note) note.textContent = whatsappBaseUrl
          ? 'Opens WhatsApp to ask about availability. This is an enquiry, not a reservation; no payment is taken here.'
          : 'The enquiry form cannot open an authorized WhatsApp destination right now. Your travel details have not been sent. Refresh the page and try again, or use contact details supplied directly by the hotel.';
      });

      const hasUnavailableChannel = (enquiryLinks.length > 0 && !whatsappBaseUrl)
        || (phoneLinks.length > 0 && (!phoneE164 || !phoneDisplay))
        || (alternatePhoneLinks.length > 0 && (!alternatePhoneE164 || !alternatePhoneDisplay))
        || (emailLinks.length > 0 && !email)
        || (bookingLinks.length > 0 && !bookingUrl)
        || (propertyMapLinks.length > 0 && !hotelMapUrl)
        || (bookingForms.length > 0 && !whatsappBaseUrl);
      if (contactStatus) contactStatus.hidden = !hasUnavailableChannel;
    } catch (_) {
      if (contactStatus) contactStatus.hidden = false;
      enquiryLinks.forEach(link => disableContactLink(link, 'WhatsApp unavailable'));
      phoneLinks.forEach(link => disableContactLink(link, 'Phone unavailable'));
      alternatePhoneLinks.forEach(link => disableContactLink(link, 'Landline unavailable'));
      emailLinks.forEach(link => disableContactLink(link, 'Email unavailable'));
      bookingLinks.forEach(link => disableContactLink(link, 'Booking link unavailable'));
      propertyMapLinks.forEach(link => disableContactLink(link, 'Map link unavailable'));
      bookingForms.forEach(form => {
        const submit = form.querySelector('[data-booking-submit]');
        const note = form.querySelector('[data-booking-note]');
        if (submit) submit.disabled = true;
        if (note) note.textContent = 'The enquiry form could not load the contact configuration. Your travel details have not been sent. Refresh the page and try again, or use contact details supplied directly by the hotel.';
      });
      guestEnquiryForms.forEach(form => {
        const submit = form.querySelector('[data-guest-enquiry-submit]');
        const status = form.querySelector('[data-guest-enquiry-status]');
        if (submit) submit.disabled = true;
        if (status) {
          status.dataset.state = 'error';
          status.textContent = 'The enquiry form is unavailable because the contact configuration could not be loaded. No message has been sent. Refresh this page and try again, or use contact details supplied directly by the hotel.';
        }
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
        if (note) note.textContent = 'The enquiry form cannot open an authorized WhatsApp destination right now. Your travel details have not been sent. Refresh the page and try again, or use contact details supplied directly by the hotel.';
        showToast('WhatsApp enquiry is unavailable right now; no details were sent.');
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
