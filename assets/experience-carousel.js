(() => {
  'use strict';

  const carousels = document.querySelectorAll('[data-experience-carousel]');

  carousels.forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
    const controls = carousel.querySelector('[data-carousel-controls]');
    const previous = carousel.querySelector('[data-carousel-previous]');
    const next = carousel.querySelector('[data-carousel-next]');
    const status = carousel.querySelector('[data-carousel-status]');

    // Leave the first real photograph visible when a carousel is incomplete or JS cannot enhance it.
    if (slides.length < 2 || !controls || !previous || !next || !status) return;

    let activeIndex = slides.findIndex((slide) => !slide.hidden);
    if (activeIndex < 0) activeIndex = 0;

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === activeIndex;
        slide.hidden = !active;
        slide.setAttribute('aria-hidden', String(!active));
      });
      status.textContent = `${activeIndex + 1} of ${slides.length}`;
    }

    previous.addEventListener('click', () => showSlide(activeIndex - 1));
    next.addEventListener('click', () => showSlide(activeIndex + 1));

    carousel.classList.add('is-enhanced');
    controls.hidden = false;
    showSlide(activeIndex);
  });
})();
