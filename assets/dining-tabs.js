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
  const nameField = form.elements.namedItem('name');
  const emailField = form.elements.namedItem('email');
  const mobileField = form.elements.namedItem('mobile');
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
  if (!submit || !status || !nameField || !emailField || !mobileField || !dateField || !timeField) {
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
  const updateMobileConstraint = () => {
    const digits = String(mobileField.value || '').replace(/\D/g, '');
    mobileField.setCustomValidity(mobileField.value && (digits.length < 8 || digits.length > 15)
      ? 'Enter a mobile number with 8–15 digits, including the country code where needed.' : '');
    mobileField.setAttribute('aria-invalid', String(Boolean(mobileField.value && !mobileField.validity.valid)));
  };
  const allowedSlot = value => {
    if (!/^\d{2}:\d{2}$/.test(value)) return false;
    const parts = value.split(':').map(Number);
    const minutes = parts[0] * 60 + parts[1];
    return minutes >= 7 * 60 && minutes <= 22 * 60 + 30 && (minutes - 7 * 60) % 30 === 0;
  };

  ['input', 'change'].forEach(type => {
    dateField.addEventListener(type, updateDateConstraint);
    mobileField.addEventListener(type, updateMobileConstraint);
  });
  updateDateConstraint();
  updateMobileConstraint();


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

  form.addEventListener('submit', event => {
    event.preventDefault();
    updateDateConstraint();
    updateMobileConstraint();
    if (!approvedWhatsAppBase) {
      disable('The contact channel is not available. No details have been sent.');
      return;
    }
    if (!form.reportValidity()) return;
    const name = String(nameField.value || '').trim();
    const email = String(emailField.value || '').trim();
    const mobile = String(mobileField.value || '').trim();
    const date = String(dateField.value || '');
    const time = String(timeField.value || '');
    if (name.length < 2) {
      nameField.setCustomValidity('Enter your name so the restaurant knows who is enquiring.');
      form.reportValidity();
      nameField.setCustomValidity('');
      return;
    }
    if (!allowedSlot(time) || !Array.from(timeField.options).some(option => option.value === time)) {
      timeField.setCustomValidity('Choose one of the listed 30-minute time slots, from 7:00 AM to 10:30 PM.');
      form.reportValidity();
      timeField.setCustomValidity('');
      return;
    }
    const selectedLabel = timeField.selectedOptions && timeField.selectedOptions[0]
      ? timeField.selectedOptions[0].textContent : time;
    const message = [
      'Namaste Garh Jaisal’s Kitchen, I would like to enquire about a table.',
      'Name: ' + name,
      'Email: ' + email,
      'Mobile: ' + mobile,
      'Requested date: ' + date,
      'Preferred time: ' + selectedLabel,
      'Please confirm current opening hours and table availability for this request.',
      'I understand this is an enquiry, not a reservation. The table is not booked until the restaurant replies and confirms it.'
    ].join('\n');
    const draftUrl = approvedWhatsAppBase + '?text=' + encodeURIComponent(message);
    window.open(draftUrl, '_blank', 'noopener,noreferrer');
    status.dataset.state = 'ready';
    status.textContent = 'Your details have been prepared for a WhatsApp draft. Review and send it yourself; the restaurant has not received a message and your table is not reserved. If no new tab opened, allow pop-ups and try again.';
  });

  loadApprovedContact();
})();