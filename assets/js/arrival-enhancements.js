'use strict';

(function () {
  function initialiseMapPreviews() {
    document.querySelectorAll('[data-map-preview]').forEach(function (details) {
      if (details.dataset.mapPreviewInitialised === 'true') return;

      var iframe = details.querySelector('iframe[data-map-src]');
      var label = details.querySelector('[data-map-preview-label]');
      if (!iframe) return;

      details.dataset.mapPreviewInitialised = 'true';
      details.addEventListener('toggle', function () {
        if (details.open && !iframe.hasAttribute('src')) {
          var source = iframe.getAttribute('data-map-src');
          if (source) iframe.setAttribute('src', source);
        }

        if (label) {
          if (details.open) {
            label.textContent = 'Hide interactive map';
          } else {
            label.textContent = iframe.hasAttribute('src')
              ? 'Show interactive map'
              : 'Load interactive map';
          }
        }
      });
    });
  }

  function legacyCopy(value) {
    var field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    field.style.position = 'fixed';
    field.style.inset = '0 auto auto -9999px';
    document.body.appendChild(field);
    field.select();

    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
    field.remove();
    return copied;
  }

  function initialiseArrivalCopy() {
    var button = document.querySelector('[data-arrival-copy]');
    var status = document.querySelector('[data-arrival-copy-status]');
    if (!button || !status) return;

    var arrivalNote = button.getAttribute('data-arrival-copy') || '';
    if (!arrivalNote.trim()) return;

    button.hidden = false;
    button.addEventListener('click', async function () {
      button.disabled = true;
      status.textContent = '';

      var copied = false;
      try {
        if (!navigator.clipboard || !window.isSecureContext) {
          throw new Error('Clipboard API unavailable');
        }
        await navigator.clipboard.writeText(arrivalNote);
        copied = true;
      } catch (_) {
        copied = legacyCopy(arrivalNote);
      }

      status.textContent = copied
        ? 'Arrival note copied. Share it with your driver before you set out.'
        : 'Copy is unavailable in this browser. Share the address and walking details shown here manually.';
      button.disabled = false;
    });
  }

  function initialise() {
    initialiseMapPreviews();
    initialiseArrivalCopy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }
}());
