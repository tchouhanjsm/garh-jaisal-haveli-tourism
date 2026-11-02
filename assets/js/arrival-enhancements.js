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

      try {
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({
              title: 'Garh Jaisal Haveli arrival details',
              text: arrivalNote
            });
            status.textContent = 'Share sheet opened. Choose your driver to send the arrival note.';
            return;
          } catch (error) {
            if (error && error.name === 'AbortError') {
              status.textContent = 'Sharing cancelled. No message was sent.';
              return;
            }
          }
        }

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
          : 'Sharing is unavailable and the note could not be copied. Share the address and walking details shown here manually.';
      } finally {
        button.disabled = false;
      }
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
