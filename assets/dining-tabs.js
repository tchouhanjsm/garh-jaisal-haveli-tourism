(() => {
  'use strict';

  const root = document.querySelector('[data-restaurant-tabs]');
  const tablist = root && root.querySelector('[data-restaurant-tablist]');
  const tabs = root ? Array.from(root.querySelectorAll('[data-restaurant-tab]')) : [];
  const panels = root ? Array.from(root.querySelectorAll('[data-restaurant-panel]')) : [];
  const panelByName = new Map(panels.map(panel => [panel.dataset.restaurantPanel, panel]));
  const requiredNames = ['overview', 'menu', 'table', 'directions'];
  const completeTabContract = Boolean(tablist)
    && requiredNames.every(name => panelByName.has(name) && tabs.some(tab => tab.dataset.restaurantTab === name))
    && tabs.length === requiredNames.length && panels.length === requiredNames.length;

  function activateTab(name, options = {}) {
    if (!completeTabContract || !panelByName.has(name)) return;
    tabs.forEach(tab => {
      const selected = tab.dataset.restaurantTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.restaurantPanel !== name; });
    if (options.focus) {
      const active = tabs.find(tab => tab.dataset.restaurantTab === name);
      if (active) active.focus();
    }
    if (options.scroll) {
      const activePanel = panelByName.get(name);
      if (activePanel) {
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        activePanel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }
  }

  if (completeTabContract) {
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.restaurantTab));
      tab.addEventListener('keydown', event => {
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        activateTab(tabs[nextIndex].dataset.restaurantTab, { focus: true });
      });
    });
    root.querySelectorAll('[data-open-restaurant-tab]').forEach(link => {
      link.addEventListener('click', event => {
        const name = link.dataset.openRestaurantTab;
        if (!panelByName.has(name)) return;
        event.preventDefault();
        activateTab(name, { scroll: true });
      });
    });
    document.body.classList.add('dining-tabs-ready');
    activateTab('overview');
  }

  const form = document.querySelector('[data-restaurant-table-form]');
  if (!form) return;
  const submit = form.querySelector('[data-restaurant-table-submit]');
  const status = form.querySelector('[data-restaurant-table-status]');
  const recovery = form.querySelector('[data-restaurant-table-recovery]');
  const draftField = form.querySelector('[data-restaurant-table-draft]');
  const copyButton = form.querySelector('[data-restaurant-table-copy]');
  const noteField = form.elements.namedItem('note');
  const guestField = form.elements.namedItem('guests');
  const dateField = form.elements.namedItem('date');
  const timeField = form.elements.namedItem('time');
  let approvedWhatsAppBase = '';

  const disable = message => {
    if (submit) submit.disabled = true;
    if (status) {
      status.dataset.state = 'error';
      status.textContent = message;
    }
  };
  if (!submit || !status || !recovery || !draftField || !copyButton || !guestField || !dateField || !timeField || !noteField) {
    disable('Table enquiries are unavailable because a required field is missing. No details have been sent.');
    return;
  }

  const localDateString = value => {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const todayString = () => localDateString(new Date());
  const updateDateConstraint = () => {
    const today = todayString();
    dateField.min = today;
    dateField.setCustomValidity(dateField.value && dateField.value < today
      ? 'Please choose today or a future date.' : '');
    dateField.setAttribute('aria-invalid', String(Boolean(dateField.value && !dateField.validity.valid)));
  };


  ['input', 'change'].forEach(type => {
    dateField.addEventListener(type, updateDateConstraint);
  });
  updateDateConstraint();


  async function loadApprovedContact() {
    try {
      if (typeof fetch !== 'function') throw new Error('Fetch is unavailable');
      const scriptUrl = document.currentScript && document.currentScript.src;
      const configUrl = new URL('../content/site-config.json', scriptUrl || window.location.href);
      const response = await fetch(configUrl.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Contact configuration could not be loaded');
      const config = await response.json();
      const contact = config && config.contact ? config.contact : {};
      const authorized = (config.verificationStatus === 'owner-verified' && contact.status === 'verified')
        || (config.verificationStatus === 'owner-authorized-source' && contact.status === 'source-authorized');
      if (!authorized || typeof contact.whatsappBaseUrl !== 'string') throw new Error('Contact channel is not authorized');
      const url = new URL(contact.whatsappBaseUrl);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'wa.me' || url.port !== ''
          || !/^\/\d{8,15}\/?$/.test(url.pathname) || url.username || url.password || url.search || url.hash) {
        throw new Error('Contact channel has an invalid destination');
      }
      approvedWhatsAppBase = url.origin + url.pathname.replace(/\/$/, '');
      submit.disabled = false;
      status.dataset.state = 'ready';
      status.textContent = 'Ready. After submission, review the details in a WhatsApp draft. Nothing is sent automatically and no table is reserved yet.';
    } catch (_) {
      disable('Table enquiries are temporarily unavailable because the approved contact channel could not be loaded. No details have been sent.');
    }
  }

  recovery.hidden = true;
  copyButton.disabled = true;

  copyButton.addEventListener('click', async () => {
    const text = String(draftField.value || '');
    if (!text) return;
    try {
      if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        status.dataset.state = 'ready';
        status.textContent = 'Table enquiry text copied. Paste it into the hotel WhatsApp chat when ready. Nothing was sent and no table is reserved.';
        return;
      }
    } catch (_) {
      // Clipboard permission may be denied; allow selection-based recovery.
    }
    try {
      draftField.focus();
      draftField.select();
    } catch (_) {
      // Leave the prepared text visible if selection is unavailable.
    }
    let copied = false;
    try {
      copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    } catch (_) {
      // Manual selection remains available.
    }
    status.dataset.state = copied ? 'ready' : 'error';
    status.textContent = copied
      ? 'Table enquiry text copied. Paste it into the hotel WhatsApp chat when ready. Nothing was sent and no table is reserved.'
      : 'The table enquiry is selected below. Use your device’s Copy command, then paste it into the hotel WhatsApp chat. Nothing was sent and no table is reserved.';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    updateDateConstraint();
    if (!approvedWhatsAppBase) {
      disable('The contact channel is not available. No details have been sent.');
      return;
    }
    if (!form.reportValidity()) return;
    const note = String(noteField.value || '').trim().slice(0, 240);
    const date = String(dateField.value || '');
    const time = String(timeField.value || '').trim().slice(0, 40);
    const guests = String(guestField.value || '').trim();
    const message = [
      'Namaste Garh Jaisal’s Kitchen, I would like to ask about a table.',
      'Requested date: ' + date,
      'Guests: ' + guests,
      'Preferred time: ' + (time || 'Not specified'),
      ...(note ? ['Additional note: ' + note] : []),
      'Please confirm current service hours, menu/prices and table availability for this request.',
      'I understand this is an enquiry, not a reservation. The table is not booked until the restaurant replies and confirms it.'
    ].join('\n');
    const draftUrl = approvedWhatsAppBase + '?text=' + encodeURIComponent(message);
    window.open(draftUrl, '_blank', 'noopener,noreferrer');
    draftField.value = message;
    recovery.hidden = false;
    copyButton.disabled = false;
    status.dataset.state = 'ready';
    status.textContent = 'Your table enquiry draft is ready to review. If WhatsApp did not open, copy the prepared message below. Nothing was sent automatically and your table is not reserved.';
  });

  loadApprovedContact();
})();