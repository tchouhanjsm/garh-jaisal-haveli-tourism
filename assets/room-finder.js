/* Progressive room filtering. Without JavaScript every source-listed room remains visible. */
(function () {
  'use strict';

  const finder = document.querySelector('[data-room-finder]');
  const grid = document.querySelector('#room-card-grid');
  if (!finder || !grid) return;

  const cards = Array.from(grid.querySelectorAll('.room-card--named[data-room-floor][data-room-features]'));
  const floorSelect = finder.querySelector('[data-room-floor-filter]');
  const featureInputs = Array.from(finder.querySelectorAll('[data-room-feature-filter]'));
  const status = finder.querySelector('[data-room-finder-status]');
  const emptyState = finder.querySelector('[data-room-finder-empty]');
  const resetButton = finder.querySelector('[data-room-reset]');
  const shareButton = finder.querySelector('[data-room-share]');
  const shareFallback = finder.querySelector('[data-room-share-fallback]');
  const shareUrlField = finder.querySelector('[data-room-share-url]');
  const validFloors = new Set(['ground', 'first']);
  const validFeatures = new Set(['king-bed', 'second-bed', 'city-view', 'window-seat', 'carved-bed']);
  const shareHashPrefix = '#room-finder?';
  let restoredFromShareHash = false;

  if (cards.length !== 7 || !floorSelect || !status || !emptyState || !resetButton
      || !shareButton || !shareFallback || !shareUrlField
      || featureInputs.length !== validFeatures.size) return;

  const cardDataIsValid = cards.every(card => {
    const floor = card.dataset.roomFloor;
    const features = String(card.dataset.roomFeatures || '').split(/\s+/).filter(Boolean);
    return validFloors.has(floor)
      && features.length > 0
      && features.every(feature => /^[a-z0-9-]+$/.test(feature));
  });
  const filterOptionsAreValid = featureInputs.every(input => validFeatures.has(input.value));
  if (!cardDataIsValid || !filterOptionsAreValid) return;

  function activeFeatures() {
    return featureInputs.filter(input => input.checked).map(input => input.value);
  }

  function isShareHash(hash) {
    return String(hash || '').startsWith(shareHashPrefix);
  }

  function clearShareHash() {
    const url = new URL(window.location.href);
    if (isShareHash(url.hash)) {
      url.hash = '';
      window.history.replaceState(null, '', url.toString());
    }
    restoredFromShareHash = false;
  }

  function restoreSharedFilters() {
    const url = new URL(window.location.href);
    if (!isShareHash(url.hash)) return false;

    const params = new URLSearchParams(url.hash.slice(shareHashPrefix.length));
    const requestedFloor = params.get('floor') || 'all';
    floorSelect.value = requestedFloor === 'all' || validFloors.has(requestedFloor)
      ? requestedFloor
      : 'all';
    const requestedFeatures = new Set(
      params.getAll('feature')
        .flatMap(value => value.split(','))
        .filter(feature => validFeatures.has(feature))
    );
    featureInputs.forEach(input => { input.checked = requestedFeatures.has(input.value); });
    restoredFromShareHash = true;
    return true;
  }

  function buildShareUrl() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams();
    params.set('floor', floorSelect.value);
    activeFeatures().forEach(feature => params.append('feature', feature));
    url.hash = shareHashPrefix + params.toString();
    return url.toString();
  }

  function applyFilters() {
    const floor = floorSelect.value;
    const selectedFeatures = activeFeatures();

    let visibleCount = 0;
    cards.forEach(card => {
      const roomFeatures = new Set(String(card.dataset.roomFeatures || '').split(/\s+/).filter(Boolean));
      const matchesFloor = floor === 'all' || card.dataset.roomFloor === floor;
      const matchesFeatures = selectedFeatures.every(feature => roomFeatures.has(feature));
      const visible = matchesFloor && matchesFeatures;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    const filtersActive = floor !== 'all' || selectedFeatures.length > 0;
    status.textContent = visibleCount === cards.length && !filtersActive
      ? 'Showing all seven listed rooms.'
      : visibleCount === 0
        ? 'No rooms match every selected source-listed feature and floor.'
        : 'Showing ' + visibleCount + ' of seven listed rooms. Results match every selected feature recorded in the source catalogue.';
    emptyState.hidden = visibleCount !== 0;
    resetButton.disabled = !filtersActive;
    shareButton.disabled = !filtersActive;
    shareFallback.hidden = true;
  }

  function handleFilterChange() {
    clearShareHash();
    applyFilters();
  }

  floorSelect.addEventListener('change', handleFilterChange);
  featureInputs.forEach(input => input.addEventListener('change', handleFilterChange));
  resetButton.addEventListener('click', () => {
    clearShareHash();
    floorSelect.value = 'all';
    featureInputs.forEach(input => { input.checked = false; });
    applyFilters();
    floorSelect.focus();
  });

  shareButton.addEventListener('click', async () => {
    const shareUrl = buildShareUrl();
    window.history.replaceState(null, '', shareUrl);
    restoredFromShareHash = true;
    shareUrlField.value = shareUrl;
    shareFallback.hidden = true;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(shareUrl);
      status.textContent = 'Filter link copied. It contains only floor and listed-feature filters, not guest details.';
    } catch {
      shareFallback.hidden = false;
      shareUrlField.focus();
      shareUrlField.select();
      status.textContent = 'Copy the selected link below. It contains only floor and listed-feature filters, not guest details.';
    }
  });

  window.addEventListener('hashchange', () => {
    if (restoreSharedFilters()) {
      applyFilters();
      return;
    }
    if (restoredFromShareHash) {
      floorSelect.value = 'all';
      featureInputs.forEach(input => { input.checked = false; });
      restoredFromShareHash = false;
      applyFilters();
    }
  });

  // Restore a shared catalogue filter before exposing interactive controls.
  restoreSharedFilters();
  // Only reveal controls after all listeners and fail-closed checks are installed.
  finder.hidden = false;
  applyFilters();
})();
