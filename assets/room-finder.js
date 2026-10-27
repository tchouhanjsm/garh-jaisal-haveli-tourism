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
  const validFloors = new Set(['ground', 'first']);
  const validFeatures = new Set(['king-bed', 'second-bed', 'city-view', 'window-seat', 'carved-bed']);

  if (cards.length !== 7 || !floorSelect || !status || !emptyState || !resetButton
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

  function applyFilters() {
    const floor = floorSelect.value;
    const selectedFeatures = featureInputs
      .filter(input => input.checked)
      .map(input => input.value);

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
  }

  floorSelect.addEventListener('change', applyFilters);
  featureInputs.forEach(input => input.addEventListener('change', applyFilters));
  resetButton.addEventListener('click', () => {
    floorSelect.value = 'all';
    featureInputs.forEach(input => { input.checked = false; });
    applyFilters();
    floorSelect.focus();
  });

  // Only reveal controls after all listeners and fail-closed checks are installed.
  finder.hidden = false;
  applyFilters();
})();
