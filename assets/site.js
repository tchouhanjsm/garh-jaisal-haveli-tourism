(() => {
  'use strict';
  const header = document.querySelector('[data-header]');
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-navigation');
  const contactStatus = document.querySelector('#contact-status');
  const directEnquiryDock = document.querySelector('[data-direct-enquiry-dock]');
  const mobileBookingBar = document.querySelector('.mobile-booking-bar');
  const arrivalQuickCard = document.querySelector('[data-arrival-quick-card]');
  const directEnquiryDismiss = directEnquiryDock ? directEnquiryDock.querySelector('[data-direct-enquiry-dismiss]') : null;
  const enquiryLinks = Array.from(document.querySelectorAll('[data-enquiry-link]'));
  const phoneLinks = Array.from(document.querySelectorAll('[data-contact-phone]'));
  const alternatePhoneLinks = Array.from(document.querySelectorAll('[data-contact-alt-phone]'));
  const emailLinks = Array.from(document.querySelectorAll('[data-contact-email]'));
  const bookingLinks = Array.from(document.querySelectorAll('[data-booking-link]'));
  const propertyMapLinks = Array.from(document.querySelectorAll('[data-property-map-link]'));
  const bookingForms = Array.from(document.querySelectorAll('[data-booking-form]'));
  const guestEnquiryForms = Array.from(document.querySelectorAll('[data-guest-enquiry-form]'));
  const arrivalPlanningForms = Array.from(document.querySelectorAll('[data-arrival-planning-form]'));
  const roomCompareEnquiryButtons = Array.from(document.querySelectorAll('[data-room-compare-enquiry]'));
  let activeWhatsAppBaseUrl = '';

  function focusArrivalPlannerFromFragment() {
    if (!window.location || window.location.hash !== '#arrival-planning') return;
    const target = document.getElementById('arrival-planning');
    if (!target) return;

    window.requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }

  window.addEventListener('hashchange', focusArrivalPlannerFromFragment);
  focusArrivalPlannerFromFragment();

  // Keep the Directions section rail oriented to the heading nearest its reading line.
  // Native fragment links remain usable when this enhancement is unavailable.
  function initArrivalSectionNavigation() {
    const sectionNav = document.querySelector('.arrival-section-nav');
    if (!sectionNav) return;

    const links = Array.from(sectionNav.querySelectorAll('a[href^="#"]'));
    const items = links.map(link => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      return target ? { link, target } : null;
    });

    // Do not advertise a partial scrollspy if any navigation target is missing.
    if (!links.length || items.some(item => !item)) return;

    let framePending = false;
    let activeItem = null;
    const revealCurrentLink = link => {
      if (sectionNav.scrollWidth <= sectionNav.clientWidth) return;
      const navRect = sectionNav.getBoundingClientRect();
      const contentLeft = navRect.left + sectionNav.clientLeft;
      const contentRight = contentLeft + sectionNav.clientWidth;
      const linkRect = link.getBoundingClientRect();
      const inset = 12;
      let nextLeft = sectionNav.scrollLeft;
      if (linkRect.left < contentLeft + inset) {
        nextLeft += linkRect.left - contentLeft - inset;
      } else if (linkRect.right > contentRight - inset) {
        nextLeft += linkRect.right - contentRight + inset;
      }
      const maxLeft = Math.max(0, sectionNav.scrollWidth - sectionNav.clientWidth);
      nextLeft = Math.max(0, Math.min(maxLeft, nextLeft));
      if (Math.abs(nextLeft - sectionNav.scrollLeft) < 1) return;
      const reduceMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof sectionNav.scrollTo === 'function') {
        sectionNav.scrollTo({ left: nextLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
      } else {
        sectionNav.scrollLeft = nextLeft;
      }
    };
    const setCurrent = currentItem => {
      const changed = activeItem !== currentItem;
      activeItem = currentItem;
      items.forEach(item => {
        if (item === currentItem) item.link.setAttribute('aria-current', 'location');
        else item.link.removeAttribute('aria-current');
      });
      if (changed) revealCurrentLink(currentItem.link);
    };

    const updateCurrent = () => {
      framePending = false;
      // Keep the reading line below the sticky header and sticky section rail; global scroll padding plus route-specific margin places targets around 162px.
      const activationLine = Math.max(168, sectionNav.getBoundingClientRect().bottom + 32);
      let currentItem = items[0];
      let currentTop = Number.NEGATIVE_INFINITY;
      // Navigation order is editorial, not necessarily document order. Select
      // the closest target above the reading line by geometry instead of array order.
      items.forEach(item => {
        const targetTop = item.target.getBoundingClientRect().top;
        if (targetTop <= activationLine && targetTop > currentTop) {
          currentItem = item;
          currentTop = targetTop;
        }
      });
      setCurrent(currentItem);
    };

    const scheduleUpdate = () => {
      if (framePending) return;
      framePending = true;
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(updateCurrent);
      } else {
        updateCurrent();
      }
    };

    sectionNav.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      const item = items.find(candidate => candidate.link === link);
      if (item) setCurrent(item);
    });
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', () => {
      scheduleUpdate();
      if (activeItem) revealCurrentLink(activeItem.link);
    }, { passive: true });
    // Re-evaluate after deep-link changes and browser scroll restoration.
    window.addEventListener('hashchange', scheduleUpdate);
    window.addEventListener('pageshow', scheduleUpdate);
    updateCurrent();
  }

  initArrivalSectionNavigation();

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
      const departureHint = form.querySelector('[data-departure-hint]');
      const departureRequirementLabel = form.querySelector('[data-departure-requirement-label]');
      const recovery = form.querySelector('[data-guest-enquiry-recovery]');
      const draftField = form.querySelector('[data-guest-enquiry-draft]');
      const copyButton = form.querySelector('[data-guest-enquiry-copy]');
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
      if (!submit || !status || !experienceField || !arrivalField || !departureField
          || !departureHint || !departureRequirementLabel || !recovery || !draftField || !copyButton || !whatsappBase) {
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
        const departureRequired = selectedExperienceRequiresDeparture();
        arrivalField.min = today;
        departureField.required = departureRequired;
        departureRequirementLabel.textContent = departureRequired ? '(required for this enquiry)' : '(optional)';
        departureHint.textContent = departureRequired
          ? 'A departure date is required for overnight stays and room-availability enquiries. It must be after arrival.'
          : 'Departure is optional for day experiences or planning questions. Leave this blank for a single-date enquiry; if supplied, it must be after the requested date.';
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

      recovery.hidden = true;
      draftField.value = '';
      copyButton.disabled = true;
      submit.disabled = false;
      status.dataset.state = 'ready';
      status.textContent = 'Ready. Review the details, then prepare a WhatsApp draft. Nothing is sent automatically.';

      copyButton.addEventListener('click', async () => {
        const text = String(draftField.value || '');
        if (!text) return;
        try {
          if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            status.dataset.state = 'ready';
            status.textContent = 'Enquiry text copied. Open the hotel WhatsApp chat and paste it. Nothing was sent by this website.';
            return;
          }
        } catch (_) {
          // Clipboard access may be unavailable or permission may be denied.
        }
        try {
          draftField.focus();
          draftField.select();
        } catch (_) {
          // Keep the message available even if selection is unsupported.
        }
        let copied = false;
        try {
          copied = typeof document.execCommand === 'function' && document.execCommand('copy');
        } catch (_) {
          // Manual selection remains available below.
        }
        status.dataset.state = copied ? 'ready' : 'error';
        status.textContent = copied
          ? 'Enquiry text copied. Open the hotel WhatsApp chat and paste it. Nothing was sent by this website.'
          : 'The prepared message is selected below. Use your device’s Copy command, then paste it into the hotel WhatsApp chat. Nothing was sent.';
      });

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
        const draftText = lines.join('\n');
        const target = whatsappBase + '?text=' + encodeURIComponent(draftText);
        window.open(target, '_blank', 'noopener,noreferrer');
        draftField.value = draftText;
        recovery.hidden = false;
        copyButton.disabled = false;
        status.dataset.state = 'ready';
        status.textContent = 'Your draft is ready to review in WhatsApp. If the tab did not open, copy the prepared text below and paste it into the hotel chat. Nothing was sent automatically.';
      });
    });
  }

  function configureRoomCompareEnquiry(whatsappBaseUrl) {
    roomCompareEnquiryButtons.forEach(button => {
      const panel = button.closest('[data-room-compare-panel]');
      const status = panel && panel.querySelector('[data-room-compare-status]');
      const recovery = panel && panel.querySelector('[data-room-compare-recovery]');
      const draftField = panel && panel.querySelector('[data-room-compare-draft]');
      const copyButton = panel && panel.querySelector('[data-room-compare-copy]');
      if (!panel || !status || !recovery || !draftField || !copyButton || !whatsappBaseUrl) {
        button.dataset.roomCompareContactState = 'unavailable';
        button.disabled = true;
        button.setAttribute('aria-describedby', 'contact-status');
        return;
      }

      button.dataset.roomCompareContactState = 'ready';
      button.disabled = document.querySelectorAll('#room-card-grid [data-room-compare-toggle][aria-pressed="true"]').length === 0;
      button.removeAttribute('aria-describedby');
      recovery.hidden = true;
      copyButton.disabled = true;
      button.addEventListener('click', () => {
        const names = Array.from(document.querySelectorAll('#room-card-grid [data-room-compare-toggle][aria-pressed="true"]'))
          .map(toggle => {
            const card = document.getElementById(toggle.dataset.roomCompareToggle);
            const heading = card && card.querySelector('h3');
            return heading ? heading.textContent.trim() : '';
          })
          .filter(Boolean)
          .slice(0, 3);
        if (!names.length) {
          status.textContent = 'Choose at least one room before preparing an enquiry.';
          return;
        }
        const message = [
          'Namaste Garh Jaisal Haveli, I would like to enquire about these room options:',
          ...names.map(name => '- ' + name),
          'Please confirm current availability, exact room assignment, inclusions, total rate including taxes, and applicable terms for my dates.',
          'I understand this is an enquiry only and does not confirm a booking. Please ask me for any details needed to check availability.'
        ].join('\n');
        window.open(whatsappBaseUrl + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
        draftField.value = message;
        recovery.hidden = false;
        copyButton.disabled = false;
        status.textContent = 'Your room enquiry draft is ready to review. If WhatsApp did not open, copy the prepared message below. Nothing was sent automatically and no room is reserved.';
      });

      copyButton.addEventListener('click', async () => {
        const text = String(draftField.value || '');
        if (!text) return;
        try {
          if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            status.textContent = 'Room enquiry text copied. Paste it into the hotel WhatsApp chat when ready. Nothing was sent.';
            return;
          }
        } catch (_) {
          // Fall through to selection-based copying when clipboard access is denied.
        }
        try {
          draftField.focus();
          draftField.select();
        } catch (_) {
          // Keep the message visible if selection is unsupported.
        }
        let copied = false;
        try {
          copied = typeof document.execCommand === 'function' && document.execCommand('copy');
        } catch (_) {
          // Manual selection remains available.
        }
        status.textContent = copied
          ? 'Room enquiry text copied. Paste it into the hotel WhatsApp chat when ready. Nothing was sent.'
          : 'The room enquiry is selected below. Use your device’s Copy command, then paste it into the hotel WhatsApp chat. Nothing was sent.';
      });
    });
  }

  function configureArrivalPlanningForms(whatsappBaseUrl) {
    arrivalPlanningForms.forEach(form => {
      const submit = form.querySelector('[data-arrival-enquiry-submit]');
      const status = form.querySelector('[data-arrival-enquiry-status]');
      const travelDate = form.querySelector('[name="arrival-date"]');
      const arrivalWindow = form.querySelector('[name="arrival-window"]');
      const arrivalMode = form.querySelector('[name="arrival-mode"]');
      const luggageHelp = form.querySelector('[name="arrival-luggage"]');
      const accessInfo = form.querySelector('[name="arrival-access"]');
      const recovery = form.querySelector('[data-arrival-enquiry-recovery]');
      const draftField = form.querySelector('[data-arrival-enquiry-draft]');
      const copyButton = form.querySelector('[data-arrival-enquiry-copy]');
      const fallback = form.parentElement
        ? form.parentElement.querySelector('[data-arrival-enquiry-fallback]')
        : null;

      if (!submit || !status || !travelDate || !arrivalWindow || !arrivalMode
          || !luggageHelp || !accessInfo || !recovery || !draftField || !copyButton || !whatsappBaseUrl) {
        form.hidden = true;
        if (submit) submit.disabled = true;
        if (fallback) fallback.hidden = false;
        if (status) {
          status.dataset.state = 'error';
          status.textContent = 'The arrival enquiry builder is unavailable because an authorized WhatsApp destination could not be loaded. No details were sent or saved.';
        }
        return;
      }

      const localDateString = date => {
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
      };
      const updateTravelDateMinimum = () => {
        const today = localDateString(new Date());
        travelDate.min = today;
        travelDate.setCustomValidity(
          travelDate.value && travelDate.value < today
            ? 'Choose today or a future travel date.'
            : ''
        );
      };
      const invalidateDraft = () => {
        if (recovery.hidden) return;
        recovery.hidden = true;
        draftField.value = '';
        copyButton.disabled = true;
        status.dataset.state = 'ready';
        status.textContent = 'Arrival details changed. Prepare a new draft before copying.';
      };

      [travelDate, arrivalWindow, arrivalMode, luggageHelp, accessInfo].forEach(field => {
        ['input', 'change'].forEach(type => field.addEventListener(type, () => {
          if (field === travelDate) updateTravelDateMinimum();
          invalidateDraft();
        }));
      });
      updateTravelDateMinimum();

      form.hidden = false;
      if (fallback) fallback.hidden = true;
      recovery.hidden = true;
      draftField.value = '';
      copyButton.disabled = true;
      submit.disabled = false;
      status.dataset.state = 'ready';
      status.textContent = 'Ready. Choose your travel details, then prepare a WhatsApp draft. Nothing is sent or saved automatically.';

      copyButton.addEventListener('click', async () => {
        const text = String(draftField.value || '');
        if (!text) return;
        try {
          if (window.isSecureContext && navigator.clipboard
              && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            status.dataset.state = 'ready';
            status.textContent = 'Arrival enquiry text copied. Open the hotel WhatsApp chat and review it before sending. Nothing was sent by this website.';
            return;
          }
        } catch (_) {
          // Clipboard access may be unavailable or permission may be denied.
        }
        try {
          draftField.focus();
          draftField.select();
        } catch (_) {
          // Keep the message available even if selection is unsupported.
        }
        let copied = false;
        try {
          copied = typeof document.execCommand === 'function' && document.execCommand('copy');
        } catch (_) {
          // Manual selection remains available below.
        }
        status.dataset.state = copied ? 'ready' : 'error';
        status.textContent = copied
          ? 'Arrival enquiry text copied. Open the hotel WhatsApp chat and review it before sending. Nothing was sent.'
          : 'The prepared arrival message is selected below. Use your device’s Copy command, then paste it into the hotel WhatsApp chat. Nothing was sent.';
      });

      form.addEventListener('submit', event => {
        event.preventDefault();
        updateTravelDateMinimum();
        if (!form.reportValidity()) return;
        const date = String(travelDate.value || '').trim();
        const today = localDateString(new Date());
        if (!date || date < today) {
          travelDate.setCustomValidity('Choose today or a future travel date.');
          form.reportValidity();
          return;
        }
        const modeLabel = arrivalMode.selectedOptions && arrivalMode.selectedOptions[0]
          ? arrivalMode.selectedOptions[0].textContent.trim()
          : '';
        if (!modeLabel) return;

        const windowText = String(arrivalWindow.value || '').trim().slice(0, 80);
        const lines = [
          'Namaste Garh Jaisal Haveli, please help me plan my arrival.',
          'Travel date: ' + date,
          ...(windowText ? ['Approximate arrival window: ' + windowText] : []),
          'Expected approach: ' + modeLabel,
          'Please confirm the current vehicle drop-off or meeting point and the recommended walking route for this date.',
          'I understand vehicles cannot reach the hotel door inside the fort and the final approach is on foot. Please confirm current access details before I travel.'
        ];
        if (luggageHelp.checked) {
          lines.push('Please advise whether luggage assistance can be arranged; I understand availability is not guaranteed.');
        }
        if (accessInfo.checked) {
          lines.push('Please share available information about route conditions, steps and uneven surfaces so I can plan. I am not assuming any particular assistance is available.');
        }
        lines.push('This is an enquiry only, not a transfer booking or reservation. Please confirm current arrangements before I travel.');

        const draftText = lines.join('\n');
        const target = whatsappBaseUrl + '?text=' + encodeURIComponent(draftText);
        try {
          window.open(target, '_blank', 'noopener,noreferrer');
        } catch (_) {
          // The on-page draft remains the recovery path if the browser blocks opening a tab.
        }
        draftField.value = draftText;
        recovery.hidden = false;
        copyButton.disabled = false;
        status.dataset.state = 'ready';
        status.textContent = 'Your arrival draft is ready to review in WhatsApp. If the tab did not open, copy the prepared message below. Nothing was sent automatically and no details were saved.';
      });
    });
  }

  async function configureContactChannels() {
    if (!enquiryLinks.length && !phoneLinks.length && !alternatePhoneLinks.length
        && !emailLinks.length && !bookingLinks.length && !propertyMapLinks.length
        && !bookingForms.length && !guestEnquiryForms.length && !arrivalPlanningForms.length
        && !roomCompareEnquiryButtons.length) return;
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
      if (typeof CustomEvent === 'function' && typeof document.dispatchEvent === 'function') {
        document.dispatchEvent(new CustomEvent('garh-jaisal:contact-ready', {
          detail: { whatsappBaseUrl }
        }));
      }
      configureRoomCompareEnquiry(whatsappBaseUrl);
      configureArrivalPlanningForms(whatsappBaseUrl);

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
        || (bookingForms.length > 0 && !whatsappBaseUrl)
        || (arrivalPlanningForms.length > 0 && !whatsappBaseUrl);
      if (contactStatus) contactStatus.hidden = !hasUnavailableChannel;
    } catch (_) {
      if (typeof CustomEvent === 'function' && typeof document.dispatchEvent === 'function') {
        document.dispatchEvent(new CustomEvent('garh-jaisal:contact-ready', {
          detail: { whatsappBaseUrl: '' }
        }));
      }
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
      arrivalPlanningForms.forEach(form => {
        form.hidden = true;
        const submit = form.querySelector('[data-arrival-enquiry-submit]');
        const status = form.querySelector('[data-arrival-enquiry-status]');
        const fallback = form.parentElement
          ? form.parentElement.querySelector('[data-arrival-enquiry-fallback]')
          : null;
        if (submit) submit.disabled = true;
        if (fallback) fallback.hidden = false;
        if (status) {
          status.dataset.state = 'error';
          status.textContent = 'The arrival enquiry builder could not load the contact configuration. No details were sent or saved. Use contact details supplied directly by the hotel to confirm your plan.';
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

  const visibleDirectEnquirySurfaces = new Set();
  let directEnquiryDismissed = false;
  // Without IntersectionObserver the dock remains unavailable rather than risk covering controls.
  let directEnquirySurfaceTrackingReady = false;

  function updateDirectEnquiryDock() {
    if (!directEnquiryDock) return;
    const mobilePrimaryActionVisible = Boolean(
      mobileBookingBar && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 760px)').matches
    );
    const shouldShow = !directEnquiryDismissed
      && directEnquirySurfaceTrackingReady
      && window.scrollY > 360
      && visibleDirectEnquirySurfaces.size === 0
      && !mobilePrimaryActionVisible
      && !document.body.classList.contains('menu-open');
    directEnquiryDock.hidden = !shouldShow;
  }

  if (directEnquiryDock) {
    if (directEnquiryDismiss) {
      directEnquiryDismiss.addEventListener('click', () => {
        directEnquiryDismissed = true;
        directEnquiryDock.hidden = true;
      });
    }

    if (typeof IntersectionObserver === 'function') {
      const protectedSurfaces = document.querySelectorAll(
        '[data-guest-enquiry-form], [data-booking-form], .room-compare-panel, .site-footer'
      );
      if (protectedSurfaces.length) {
        const surfaceObserver = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) visibleDirectEnquirySurfaces.add(entry.target);
            else visibleDirectEnquirySurfaces.delete(entry.target);
          });
          directEnquirySurfaceTrackingReady = true;
          updateDirectEnquiryDock();
        }, { threshold: 0.01 });
        protectedSurfaces.forEach(surface => surfaceObserver.observe(surface));
      } else {
        directEnquirySurfaceTrackingReady = true;
      }
    }
  }

  window.addEventListener('resize', updateDirectEnquiryDock, { passive: true });

  let knownMobileBookingBarHeight = 0;

  function updateMobileBookingBar() {
    if (!mobileBookingBar) return;
    const compact = typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 760px)').matches;
    if (!compact || !arrivalQuickCard) {
      mobileBookingBar.classList.remove('is-suppressed-by-arrival-card');
      mobileBookingBar.removeAttribute('aria-hidden');
      mobileBookingBar.removeAttribute('inert');
      return;
    }

    const bounds = arrivalQuickCard.getBoundingClientRect();
    const measuredHeight = Number.parseFloat(window.getComputedStyle(mobileBookingBar).height) || 0;
    if (measuredHeight > 0) knownMobileBookingBarHeight = measuredHeight;
    const barHeight = Math.max(64, measuredHeight, knownMobileBookingBarHeight);
    const overlaps = bounds.left < window.innerWidth
      && bounds.right > 0
      && bounds.top < window.innerHeight
      && bounds.bottom > Math.max(0, window.innerHeight - barHeight);
    const shouldSuppress = overlaps && !mobileBookingBar.contains(document.activeElement);
    mobileBookingBar.classList.toggle('is-suppressed-by-arrival-card', shouldSuppress);
    if (shouldSuppress) {
      mobileBookingBar.setAttribute('aria-hidden', 'true');
      mobileBookingBar.setAttribute('inert', '');
    } else {
      mobileBookingBar.removeAttribute('aria-hidden');
      mobileBookingBar.removeAttribute('inert');
    }
  }

  if (mobileBookingBar) {
    mobileBookingBar.addEventListener('focusin', updateMobileBookingBar);
    mobileBookingBar.addEventListener('focusout', () => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(updateMobileBookingBar);
      } else {
        updateMobileBookingBar();
      }
    });
  }

  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 20);
    updateDirectEnquiryDock();
    updateMobileBookingBar();
  }
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });
  window.addEventListener('resize', () => {
    updateDirectEnquiryDock();
    updateMobileBookingBar();
  });
  window.addEventListener('orientationchange', updateMobileBookingBar);
  window.addEventListener('load', updateMobileBookingBar, { once: true });

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!expanded));
      menuToggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
      nav.classList.toggle('is-open', !expanded);
      document.body.classList.toggle('menu-open', !expanded);
      updateDirectEnquiryDock();
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation');
      nav.classList.remove('is-open');
      document.body.classList.remove('menu-open');
      updateDirectEnquiryDock();
    }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
        nav.classList.remove('is-open');
        document.body.classList.remove('menu-open');
        updateDirectEnquiryDock();
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
