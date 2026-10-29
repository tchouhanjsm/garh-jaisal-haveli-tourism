/* Privacy-safe enquiry brief builder. It drafts locally and never submits or persists data. */
(() => {
  'use strict';

  const root = document.querySelector('[data-stay-planner]');
  if (!root) return;

  const disclosure = root.querySelector('[data-stay-planner-disclosure]');
  const form = root.querySelector('[data-stay-planner-form]');
  const arrival = root.querySelector('#stay-plan-arrival');
  const departure = root.querySelector('#stay-plan-departure');
  const guests = root.querySelector('#stay-plan-guests');
  const topics = Array.from(root.querySelectorAll('[data-stay-plan-topic]'));
  const notes = root.querySelector('#stay-plan-notes');
  const result = root.querySelector('[data-stay-plan-result]');
  const status = root.querySelector('[data-stay-plan-status]');
  const draft = root.querySelector('#stay-plan-draft');
  const copyButton = root.querySelector('[data-copy-stay-plan]');
  const whatsappButton = root.querySelector('[data-open-stay-plan-whatsapp]');
  const editButton = root.querySelector('[data-edit-stay-plan]');

  if (!form || !arrival || !departure || !guests || topics.length === 0 ||
      !notes || !result || !status || !draft || !copyButton || !whatsappButton || !editButton) {
    return;
  }

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function displayDate(value) {
    const parts = value.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function syncDates() {
    // Recompute the local business date on every edit/submit. A tab may remain
    // open across midnight; stale min values must not allow yesterday's dates.
    const today = localDateKey(new Date());
    const arrivalValue = arrival.value;
    const departureValue = departure.value;
    arrival.min = today;
    departure.min = arrivalValue && arrivalValue > today ? arrivalValue : today;

    const invalidArrival = Boolean(arrivalValue && arrivalValue < today);
    arrival.setCustomValidity(invalidArrival ? 'Arrival must be today or later.' : '');
    const invalidDeparture = Boolean(departureValue && departureValue < today);
    const invalidRange = Boolean(arrivalValue && departureValue && departureValue <= arrivalValue);
    departure.setCustomValidity(invalidRange
      ? 'Departure must be after the arrival date.'
      : invalidDeparture ? 'Departure must be today or later.' : '');
  }

  function syncTopics() {
    const hasTopic = topics.some(topic => topic.checked);
    topics.forEach(topic => topic.setCustomValidity(''));
    topics[0].setCustomValidity(hasTopic ? '' : 'Choose at least one planning topic.');
  }

  arrival.addEventListener('change', syncDates);
  departure.addEventListener('change', syncDates);
  topics.forEach(topic => topic.addEventListener('change', syncTopics));
  syncDates();
  syncTopics();

  let whatsappBaseUrl = '';

  function normalizeWhatsAppBaseUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'wa.me'
          || url.port !== '' || !/^\/\d{8,15}\/?$/.test(url.pathname)
          || url.username || url.password || url.search || url.hash) return '';
      return url.origin + url.pathname.replace(/\/$/, '');
    } catch (_) {
      return '';
    }
  }

  function updateShareActions() {
    const hasDraft = Boolean(draft.value.trim()) && !result.hidden;
    copyButton.disabled = !hasDraft;
    whatsappButton.disabled = !hasDraft || !whatsappBaseUrl;
  }

  function invalidateDraft() {
    if (result.hidden) return;
    draft.value = '';
    updateShareActions();
    status.textContent = 'Your details changed. Prepare a new draft before copying or opening WhatsApp. Nothing has been sent or saved.';
  }

  document.addEventListener('garh-jaisal:contact-ready', event => {
    whatsappBaseUrl = normalizeWhatsAppBaseUrl(
      event && event.detail ? event.detail.whatsappBaseUrl : ''
    );
    updateShareActions();
    if (!whatsappBaseUrl && !result.hidden && draft.value.trim()) {
      status.textContent = 'Your enquiry draft is available to copy, but the configured WhatsApp destination could not be loaded. Nothing has been sent.';
    }
  });

  form.addEventListener('input', invalidateDraft);
  form.addEventListener('change', invalidateDraft);

  form.addEventListener('submit', event => {
    event.preventDefault();
    syncDates();
    syncTopics();
    if (!form.reportValidity()) return;

    const topicLabels = topics.filter(topic => topic.checked).map(topic => topic.value);
    const lines = [
      'Namaste Garh Jaisal Haveli, I am planning a visit.',
      'Arrival: ' + displayDate(arrival.value),
      'Departure: ' + displayDate(departure.value),
      'Travelling party: ' + guests.value + (guests.value === '1' ? ' person.' : ' people.'),
      'Please share current details for: ' + topicLabels.join('; ') + '.',
      'Please confirm availability, total prices, inclusions and any arrival arrangements for these dates.'
    ];
    const note = notes.value.trim();
    if (note) lines.push('Additional notes: ' + note);
    lines.push('I understand this is an enquiry only and does not confirm a booking.');

    draft.value = lines.join('\n');
    result.hidden = false;
    updateShareActions();
    status.textContent = whatsappBaseUrl
      ? 'Your draft is ready on this page. Nothing has been sent or saved. Edit it below, then deliberately open WhatsApp or copy it.'
      : 'Your draft is ready on this page. Nothing has been sent or saved. WhatsApp is unavailable, so copy or manually select the message below.';
    if (disclosure) disclosure.open = true;
    result.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  copyButton.addEventListener('click', async () => {
    if (!draft.value) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(draft.value);
        status.textContent = 'Enquiry draft copied. You can paste it into a message and review it before sending.';
        return;
      }
    } catch (_) {
      // Use the local selection fallback below without sending or storing the draft.
    }

    draft.focus();
    draft.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
    status.textContent = copied
      ? 'Enquiry draft copied. You can paste it into a message and review it before sending.'
      : 'Select the draft text above and copy it manually. Nothing has been sent.';
  });

  draft.addEventListener('input', () => {
    updateShareActions();
    status.textContent = draft.value.trim()
      ? 'Draft edited locally. Review it carefully before sharing. Nothing has been sent or saved.'
      : 'The message is empty. Prepare a fresh draft or add text before sharing.';
  });

  whatsappButton.addEventListener('click', () => {
    const message = draft.value.trim();
    if (!whatsappBaseUrl || !message || result.hidden) {
      updateShareActions();
      return;
    }

    const target = new URL(whatsappBaseUrl);
    target.searchParams.set('text', message);
    try {
      window.open(target.toString(), '_blank', 'noopener,noreferrer');
    } catch (_) {
      // The editable draft remains available for manual copy if the handoff fails.
    }
    status.textContent = 'WhatsApp handoff requested. Review the prefilled draft there and press Send yourself. If a new tab does not appear, copy the message below. Nothing was sent by this page.';
  });

  editButton.addEventListener('click', () => {
    result.hidden = true;
    updateShareActions();
    form.querySelector('input, select, textarea').focus();
  });
})();
