'use strict';

(function () {
  var currentMapConfig = {};
  var initialised = false;

  function validateHotelMapUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'maps.app.goo.gl'
          && url.port === '' && /^\/[A-Za-z0-9_-]{6,}$/.test(url.pathname)
          && !url.username && !url.password && !url.search && !url.hash) {
        return url.origin + url.pathname;
      }
    } catch (_) {
      // Invalid source configuration keeps the handoff unavailable.
    }
    return '';
  }

  var EXPECTED_HOTEL_MAP_EMBED_URL = 'https://www.google.com/maps?q=Garh+Jaisal+Haveli%2C+Fort+Kotari+Para%2C+Inside+Jaisalmer+Fort%2C+Jaisalmer%2C+Rajasthan+345001&output=embed';

  function validateHotelMapEmbedUrl(value) {
    if (value !== EXPECTED_HOTEL_MAP_EMBED_URL) return '';
    try {
      var url = new URL(value);
      if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'www.google.com'
          && url.port === '' && url.pathname === '/maps'
          && !url.username && !url.password && !url.hash) {
        return EXPECTED_HOTEL_MAP_EMBED_URL;
      }
    } catch (_) {
      // Invalid source configuration keeps the interactive preview unavailable.
    }
    return '';
  }

  function configureMapDestinations(detail) {
    detail = detail || {};
    var hotelMapUrl = validateHotelMapUrl(detail.hotelMapUrl);
    var hotelMapEmbedUrl = validateHotelMapEmbedUrl(detail.hotelMapEmbedUrl);

    document.querySelectorAll('[data-map-preview]').forEach(function (details) {
      details.dataset.mapConfigInputLength = String(
        typeof detail.hotelMapEmbedUrl === 'string' ? detail.hotelMapEmbedUrl.length : 0
      );
      details.dataset.mapConfigAllowlistMatch = String(
        detail.hotelMapEmbedUrl === EXPECTED_HOTEL_MAP_EMBED_URL
      );
      var iframe = details.querySelector('iframe');
      if (!iframe) return;
      if (!hotelMapEmbedUrl) {
        details.dataset.mapConfigState = 'unavailable';
        iframe.removeAttribute('data-map-src');
        details.hidden = true;
        return;
      }

      details.dataset.mapConfigState = 'ready';
      details.hidden = false;
      iframe.setAttribute('data-map-src', hotelMapEmbedUrl);
      if (details.open && !iframe.hasAttribute('src')) {
        iframe.setAttribute('src', hotelMapEmbedUrl);
      }
    });

    var button = document.querySelector('[data-arrival-copy]');
    if (!button) return;
    var baseNote = button.getAttribute('data-arrival-copy-base') || '';
    if (!hotelMapUrl || !baseNote.trim()) {
      button.hidden = true;
      button.setAttribute('data-arrival-copy', '');
      return;
    }

    button.setAttribute('data-arrival-copy', baseNote + '\nExact hotel map pin: ' + hotelMapUrl);
    button.hidden = false;
  }

  function initialiseMapPreviews() {
    document.querySelectorAll('[data-map-preview]').forEach(function (details) {
      if (details.dataset.mapPreviewInitialised === 'true') return;

      var iframe = details.querySelector('iframe');
      var label = details.querySelector('[data-map-preview-label]');
      if (!iframe) return;

      details.hidden = true;
      details.dataset.mapConfigState = 'pending';
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

    button.hidden = true;
    button.addEventListener('click', async function () {
      var arrivalNote = button.getAttribute('data-arrival-copy') || '';
      if (!arrivalNote.trim()) {
        status.textContent = 'The exact hotel pin is unavailable right now. Use the address and walking details shown here, and confirm the meeting point with the hotel.';
        return;
      }

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

  document.addEventListener('garh-jaisal:contact-ready', function (event) {
    currentMapConfig = event && event.detail ? event.detail : {};
    document.querySelectorAll('[data-map-preview]').forEach(function (details) {
      details.dataset.mapConfigEventReceived = 'true';
    });
    // The Directions DOM exists before this deferred script runs. Apply the
    // validated event immediately, even if the one-time UI initializer has
    // not fired yet; initialise() reapplies the last config after wiring the
    // native disclosure and handoff handlers.
    configureMapDestinations(currentMapConfig);
  });

  function initialise() {
    if (initialised) return;
    initialised = true;
    initialiseMapPreviews();
    initialiseArrivalCopy();
    configureMapDestinations(currentMapConfig);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }
}());
