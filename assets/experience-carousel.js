(() => {
  'use strict';

  const carousels = document.querySelectorAll('[data-experience-carousel]');

  carousels.forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
    const controls = carousel.querySelector('[data-carousel-controls]');
    const previous = carousel.querySelector('[data-carousel-previous]');
    const next = carousel.querySelector('[data-carousel-next]');
    const status = carousel.querySelector('[data-carousel-status]');

    // Keep the authored first photo visible if markup is incomplete or JavaScript cannot enhance it.
    if (slides.length < 2 || !controls || !previous || !next || !status) return;

    const sources = slides.map((slide) => {
      const image = slide.querySelector('img');
      return image ? (image.getAttribute('src') || '').trim() : '';
    });
    if (sources.some((src) => !src) || new Set(sources).size !== sources.length) return;

    let activeIndex = slides.findIndex((slide) => !slide.hidden);
    if (activeIndex < 0) activeIndex = 0;

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === activeIndex;
        slide.hidden = !active;
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'slide');
        slide.setAttribute('aria-label', 'Photo ' + (slideIndex + 1) + ' of ' + slides.length);
        slide.setAttribute('aria-hidden', String(!active));
      });
      status.textContent = 'Photo ' + (activeIndex + 1) + ' of ' + slides.length;
    }

    previous.addEventListener('click', () => showSlide(activeIndex - 1));
    next.addEventListener('click', () => showSlide(activeIndex + 1));

    carousel.classList.add('is-enhanced');
    controls.hidden = false;
    showSlide(activeIndex);
  });
})();
