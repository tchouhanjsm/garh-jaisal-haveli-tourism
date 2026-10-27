(() => {
  'use strict';
  const tabList = document.querySelector('[data-restaurant-tabs]');
  const panels = Array.from(document.querySelectorAll('[data-restaurant-panel]'));
  if (tabList && panels.length) {
    const tabs = Array.from(tabList.querySelectorAll('a[href^="#"]'));
    const byId = new Map(panels.map(panel => [panel.id, panel]));
    function activate(id, options = {}) {
      if (!byId.has(id)) return false;
      tabs.forEach(tab => {
        const active = tab.hash === '#' + id;
        tab.classList.toggle('is-active', active);
        if (active) tab.setAttribute('aria-current', 'location'); else tab.removeAttribute('aria-current');
      });
      panels.forEach(panel => { panel.hidden = panel.id !== id; });
      if (options.focus) tabs.find(tab => tab.hash === '#' + id)?.focus();
      if (options.history && window.history?.replaceState) window.history.replaceState(null, '', '#' + id);
      return true;
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', event => { event.preventDefault(); activate(tab.hash.slice(1), { history: true }); });
      tab.addEventListener('keydown', event => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
        activate(tabs[next].hash.slice(1), { focus: true, history: true });
      });
    });
    const requested = window.location.hash.slice(1);
    activate(byId.has(requested) ? requested : 'restaurant-about');
  }

  const form = document.querySelector('[data-restaurant-table-form]');
  if (!form) return;
  const date = form.elements.namedItem('date');
  const name = form.elements.namedItem('name');
  const email = form.elements.namedItem('email');
  const mobile = form.elements.namedItem('mobile');
  const time = form.elements.namedItem('time');
  const guests = form.elements.namedItem('guests');
  const submit = form.querySelector('[data-restaurant-table-submit]');
  const status = form.querySelector('[data-restaurant-table-status]');
  let whatsappBase = '';

  function setStatus(state, message) { if (status) { status.dataset.state = state; status.textContent = message; } }
  function resolveChannel(config) {
    const contact = config && config.contact ? config.contact : {};
    const authorized = Boolean(config && (
      (config.verificationStatus === 'owner-verified' && contact.status === 'verified')
      || (config.verificationStatus === 'owner-authorized-source' && contact.status === 'source-authorized')
    ));
    if (!authorized || typeof contact.whatsappBaseUrl !== 'string') return '';
    try {
      const url = new URL(contact.whatsappBaseUrl);
      return url.protocol === 'https:' && url.hostname.toLowerCase() === 'wa.me' && url.port === ''
        && /^\/\d{8,15}\/?$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash
        ? url.origin + url.pathname.replace(/\/$/, '') : '';
    } catch (_) { return ''; }
  }
  const now = new Date();
  date.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  date.addEventListener('input', () => date.setCustomValidity(''));
  mobile.addEventListener('input', () => mobile.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!whatsappBase) { setStatus('error', 'The contact channel is unavailable. Your details have not been sent.'); return; }
    if (!form.reportValidity()) return;
    if (date.value < date.min) { date.setCustomValidity('Choose today or a future date.'); date.reportValidity(); return; }
    const phone = mobile.value.trim().replace(/[()\s.-]/g, '');
    if (!/^\+?[0-9]{10,15}$/.test(phone)) { mobile.setCustomValidity('Enter a valid mobile number with 10 to 15 digits.'); mobile.reportValidity(); return; }
    const guestLabel = guests.selectedOptions?.[0]?.textContent.trim() || guests.value;
    const message = [
      'Namaste Garh Jaisal’s Kitchen, I would like to request a table.',
      'Name: ' + name.value.trim(),
      'Email: ' + email.value.trim(),
      'Mobile: ' + phone,
      'Preferred date: ' + date.value,
      'Preferred time: ' + time.value,
      'Guests: ' + guestLabel,
      'This is a table enquiry, not a confirmed reservation. Please confirm availability, service hours and current menu/prices.'
    ].join('\n');
    setStatus('ready', 'Opening WhatsApp with your table request. Review the recipient and details before sending; no table is confirmed by this website.');
    window.open(whatsappBase + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
  });

  (async () => {
    try {
      const scriptUrl = document.currentScript && document.currentScript.src;
      const url = new URL('../content/site-config.json', scriptUrl || window.location.href);
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('config unavailable');
      whatsappBase = resolveChannel(await response.json());
      if (!whatsappBase) throw new Error('unauthorized channel');
      if (submit) submit.disabled = false;
      setStatus('ready', 'Ready. Submit to open a WhatsApp draft you can review and send. The restaurant must confirm the table.');
    } catch (_) {
      whatsappBase = '';
      if (submit) submit.disabled = true;
      setStatus('error', 'Table requests are unavailable because the contact channel could not be loaded. No details have been sent.');
    }
  })();
})();
