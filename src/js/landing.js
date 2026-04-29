// ============================================
// COWBELL - Landing Page Logic
// ============================================

// ---------- Navbar scroll effect ----------
const navbar = document.getElementById('navbar');

function handleNavbarScroll() {
  if (window.scrollY > 80) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
}

window.addEventListener('scroll', handleNavbarScroll, { passive: true });

// ---------- Intersection Observer for scroll animations ----------
const animatedElements = document.querySelectorAll('.animate-on-scroll');

const observerOptions = {
  threshold: 0.15,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      // Stagger animation delay based on siblings
      const siblings = entry.target.parentElement.querySelectorAll('.animate-on-scroll');
      const siblingIndex = Array.from(siblings).indexOf(entry.target);
      entry.target.style.transitionDelay = `${siblingIndex * 0.1}s`;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

animatedElements.forEach(el => observer.observe(el));

// ---------- Smooth scroll for anchor links ----------
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ---------- Hide scroll indicator after scrolling ----------
const scrollIndicator = document.querySelector('.scroll-indicator');
let scrollHidden = false;

window.addEventListener('scroll', () => {
  if (!scrollHidden && window.scrollY > 200) {
    scrollIndicator.style.opacity = '0';
    scrollHidden = true;
  }
}, { passive: true });
