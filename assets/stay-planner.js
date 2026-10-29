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
  const editButton = root.querySelector('[data-edit-stay-plan]');

  if (!form || !arrival || !departure || !guests || topics.length === 0 ||
      !notes || !result || !status || !draft || !copyButton || !editButton) {
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

  const today = localDateKey(new Date());
  arrival.min = today;
  departure.min = today;

  function syncDates() {
    departure.min = arrival.value || today;
    const invalidRange = Boolean(arrival.value && departure.value && departure.value <= arrival.value);
    departure.setCustomValidity(invalidRange ? 'Departure must be after the arrival date.' : '');
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
    copyButton.disabled = false;
    status.textContent = 'Your draft is ready on this page. Nothing has been sent or saved.';
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

  editButton.addEventListener('click', () => {
    result.hidden = true;
    form.querySelector('input, select, textarea').focus();
  });
})();
