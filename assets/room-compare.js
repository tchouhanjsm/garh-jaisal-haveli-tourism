/* Progressive, ephemeral side-by-side comparison for the seven source-listed rooms. */
(() => {
  'use strict';

  const grid = document.querySelector('#room-card-grid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.room-card--named[data-room-floor][data-room-features]'));
  const ids = new Set();
  const validFloors = new Set(['ground', 'first']);

  // Room-card photographs may be active DOM images or remain inside inert templates
  // until the shared near-viewport loader activates them. Comparison must work in both states.
  function getRoomCardImage(card) {
    const renderedImage = card.querySelector('.room-card__image img');
    if (renderedImage) return renderedImage;
    const template = card.querySelector('.room-card__image template[data-deferred-picture-template]');
    return template && template.content ? template.content.querySelector('img') : null;
  }
  const validCards = cards.length === 7 && cards.every(card => {
    const id = card.id;
    const body = card.querySelector('.room-card__body');
    const heading = card.querySelector('h3');
    const floor = card.querySelector('.service-block__meta');
    const description = card.querySelector('p:not(.room-feature-label)');
    const features = card.querySelector('.room-feature-list');
    const enquiry = card.querySelector('[data-enquiry-link][data-enquiry-message]');
    const image = getRoomCardImage(card);
    const featureItems = features ? Array.from(features.querySelectorAll('li')) : [];
    const valid = Boolean(id && !ids.has(id) && body && heading && floor && description
      && featureItems.length && enquiry && image && validFloors.has(card.dataset.roomFloor));
    if (id) ids.add(id);
    return valid;
  });

  // Fail closed: never expose a comparison UI that cannot represent all seven catalogue records.
  if (!validCards || ids.size !== 7) return;

  const MAX_SELECTED = 3;
  const selected = new Set();
  const toggleById = new Map();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const panel = element('section', 'room-compare');
  panel.dataset.roomComparePanel = '';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'room-compare-heading');

  const header = element('div', 'room-compare__header');
  const intro = element('div', 'room-compare__intro');
  intro.appendChild(element('p', 'eyebrow', 'Make a shortlist'));
  const compareHeading = element('h3', 'room-compare__title', 'Compare your rooms');
  compareHeading.id = 'room-compare-heading';
  intro.appendChild(compareHeading);
  intro.appendChild(element('p', 'room-compare__description',
    'Choose two or three rooms to compare their photographs, listed floor and catalogue features side by side.'));

  const clearButton = element('button', 'room-compare__clear', 'Clear shortlist');
  clearButton.type = 'button';
  clearButton.dataset.roomCompareClear = '';
  clearButton.disabled = true;
  const enquiryButton = element('button', 'room-compare__enquire', 'Ask about selected rooms');
  enquiryButton.type = 'button';
  enquiryButton.dataset.roomCompareEnquiry = '';
  enquiryButton.dataset.roomCompareContactState = 'pending';
  enquiryButton.disabled = true;
  const actions = element('div', 'room-compare__actions');
  actions.append(clearButton, enquiryButton);
  header.append(intro, actions);

  const status = element('p', 'room-compare__status',
    'Choose two or three rooms from the catalogue to compare them.');
  status.dataset.roomCompareStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  const tableWrap = element('div', 'room-compare__table-wrap');
  tableWrap.dataset.roomCompareTableWrap = '';
  tableWrap.hidden = true;
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute('role', 'region');
  tableWrap.setAttribute('aria-label', 'Side-by-side room comparison');

  const table = element('table', 'room-compare__table');
  table.dataset.roomCompareTable = '';
  tableWrap.appendChild(table);

  const recovery = element('section', 'guest-enquiry-recovery');
  recovery.dataset.roomCompareRecovery = '';
  recovery.hidden = true;
  recovery.setAttribute('aria-labelledby', 'room-compare-recovery-heading');
  const recoveryHeading = element('h4', '', 'Message text fallback');
  recoveryHeading.id = 'room-compare-recovery-heading';
  recovery.appendChild(recoveryHeading);
  recovery.appendChild(element('p', '', 'If WhatsApp does not open, copy this prepared message and paste it into the hotel chat. Nothing is sent automatically.'));
  const draftLabel = element('label', '', 'Prepared message');
  draftLabel.setAttribute('for', 'room-compare-draft');
  recovery.appendChild(draftLabel);
  const draftField = element('textarea');
  draftField.id = 'room-compare-draft';
  draftField.dataset.roomCompareDraft = '';
  draftField.rows = 7;
  draftField.readOnly = true;
  draftField.setAttribute('spellcheck', 'false');
  recovery.appendChild(draftField);
  const copyButton = element('button', 'button button--light', 'Copy prepared message');
  copyButton.type = 'button';
  copyButton.dataset.roomCompareCopy = '';
  copyButton.disabled = true;
  recovery.appendChild(copyButton);
  panel.append(header, status, tableWrap, recovery);
  grid.parentNode.insertBefore(panel, grid);

  function recordFor(card) {
    const image = getRoomCardImage(card);
    const descriptionNode = card.querySelector('p:not(.room-feature-label)');
    const description = descriptionNode.textContent.trim()
      .replace(/\s*These details are taken from the owner-maintained source catalogue and do not indicate live room assignment\.?$/i, '')
      .trim();
    return {
      id: card.id,
      name: card.querySelector('h3').textContent.trim(),
      floor: card.querySelector('.service-block__meta').textContent.trim(),
      description,
      features: Array.from(card.querySelectorAll('.room-feature-list li'))
        .map(item => item.textContent.trim()).filter(Boolean),
      imageSrc: image.getAttribute('src') || image.currentSrc || '',
      imageAlt: image.getAttribute('alt') || '',
      card,
    };
  }

  const records = new Map(cards.map(card => [card.id, recordFor(card)]));

  function syncToggles() {
    for (const [id, button] of toggleById) {
      const record = records.get(id);
      const isSelected = selected.has(id);
      button.setAttribute('aria-pressed', String(isSelected));
      button.setAttribute('aria-label', (isSelected ? 'Remove ' : 'Add ')
        + record.name + ' ' + (isSelected ? 'from' : 'to') + ' the comparison shortlist');
      button.textContent = isSelected ? 'Remove from compare' : 'Add to compare';
    }
  }

  function makeCell(row, tag, text, scope) {
    const cell = element(tag, '', text);
    if (scope) cell.setAttribute('scope', scope);
    row.appendChild(cell);
    return cell;
  }

  function appendComparisonRow(tbody, key, label, values, renderValue) {
    const row = element('tr');
    row.dataset.roomCompareRow = key;
    makeCell(row, 'th', label, 'row');
    values.forEach(value => {
      const cell = makeCell(row, 'td', '');
      renderValue(cell, value);
    });
    tbody.appendChild(row);
  }

  function renderTable() {
    table.replaceChildren();
    if (selected.size < 2) {
      tableWrap.hidden = true;
      return;
    }

    const chosen = Array.from(selected, id => records.get(id));
    const caption = element('caption', 'room-compare__caption',
      'Side-by-side comparison of selected source-listed room catalogue entries.');
    table.appendChild(caption);

    const thead = element('thead');
    const headingRow = element('tr');
    makeCell(headingRow, 'th', 'Compare details', 'col');

    chosen.forEach(record => {
      const heading = element('th');
      heading.setAttribute('scope', 'col');
      const roomHeading = element('div', 'room-compare__room-heading');
      const image = element('img', 'room-compare__thumbnail');
      image.alt = record.imageAlt;
      image.width = 240;
      image.height = 160;
      image.loading = 'eager';
      image.decoding = 'async';
      image.dataset.roomCompareImage = '';
      image.src = new URL(record.imageSrc, document.baseURI).href;

      const nameLink = element('a', 'room-compare__room-link', record.name);
      nameLink.href = '#' + record.id;
      nameLink.dataset.roomCompareCardLink = record.id;
      nameLink.addEventListener('click', () => {
        if (record.card.hidden) {
          const reset = document.querySelector('[data-room-reset]');
          if (reset) reset.click();
        }
      });

      const remove = element('button', 'room-compare__remove', 'Remove');
      remove.type = 'button';
      remove.dataset.roomCompareRemove = record.id;
      remove.setAttribute('aria-label', 'Remove ' + record.name + ' from comparison shortlist');
      remove.addEventListener('click', () => toggleSelection(record.id, true));

      roomHeading.append(image, nameLink, remove);
      heading.appendChild(roomHeading);
      headingRow.appendChild(heading);
    });

    thead.appendChild(headingRow);
    table.appendChild(thead);

    const tbody = element('tbody');
    appendComparisonRow(tbody, 'floor', 'Floor listed', chosen,
      (cell, record) => { cell.textContent = record.floor; });
    appendComparisonRow(tbody, 'description', 'Room description', chosen,
      (cell, record) => { cell.textContent = record.description; });
    appendComparisonRow(tbody, 'features', 'Features listed in the catalogue', chosen,
      (cell, record) => {
        const list = element('ul', 'room-compare__features');
        record.features.forEach(feature => list.appendChild(element('li', '', feature)));
        cell.appendChild(list);
      });
    table.appendChild(tbody);
    tableWrap.hidden = false;
  }

  function renderStatus(message) {
    if (message) {
      status.textContent = message;
    } else if (selected.size === 0) {
      status.textContent = 'Shortlist cleared. Choose two or three rooms to compare them side by side.';
    } else if (selected.size === 1) {
      status.textContent = '1 room selected. Add one more to compare side by side; you can select up to three.';
    } else {
      status.textContent = 'Comparing ' + selected.size
        + ' rooms. Current availability, exact assignment, amenities and total price still need confirmation.';
    }
  }

  function render(message) {
    panel.hidden = false;
    syncToggles();
    clearButton.disabled = selected.size === 0;
    enquiryButton.disabled = selected.size === 0 || enquiryButton.dataset.roomCompareContactState !== 'ready';
    enquiryButton.textContent = selected.size === 1 ? 'Ask about this room' : 'Ask about selected rooms';
    // A changed shortlist invalidates any previously prepared message.
    recovery.hidden = true;
    draftField.value = '';
    copyButton.disabled = true;
    renderTable();
    renderStatus(message);
  }

  function toggleSelection(id, forceRemove = false) {
    if (!records.has(id)) return;
    if (selected.has(id)) {
      selected.delete(id);
    } else if (!forceRemove && selected.size >= MAX_SELECTED) {
      status.textContent = 'You can compare up to three rooms. Remove one from your shortlist before adding another.';
      return;
    } else {
      selected.add(id);
    }
    render();
  }

  cards.forEach(card => {
    const record = records.get(card.id);
    const button = element('button', 'room-compare__toggle', 'Add to compare');
    button.type = 'button';
    button.dataset.roomCompareToggle = record.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Add ' + record.name + ' to the comparison shortlist');
    button.addEventListener('click', () => toggleSelection(record.id));
    toggleById.set(record.id, button);
    const enquiry = card.querySelector('[data-enquiry-link][data-enquiry-message]');
    enquiry.parentNode.insertBefore(button, enquiry);
  });

  clearButton.addEventListener('click', () => {
    selected.clear();
    syncToggles();
    clearButton.disabled = true;
    enquiryButton.disabled = true;
    enquiryButton.textContent = 'Ask about selected rooms';
    recovery.hidden = true;
    draftField.value = '';
    copyButton.disabled = true;
    renderTable();
    panel.hidden = false;
    renderStatus('Shortlist cleared. Choose two or three rooms to compare them side by side.');
  });
})();
