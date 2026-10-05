// Fast hero image pipeline: only the current slide is rendered immediately;
// the next slide is decoded ahead of the transition so the carousel stays smooth.
const slides=[...document.querySelectorAll('.hero-slide')];
let current=0;
const number=document.getElementById('slide-number');
const loaded=new Set();
function loadSlide(i, highPriority=false){
  const slide=slides[i]; if(!slide || loaded.has(i)) return;
  const src=slide.dataset.bg; if(!src) return;
  const img=new Image();
  if(highPriority) img.fetchPriority='high';
  img.decoding='async';
  img.onload=()=>{slide.style.backgroundImage=`url("${src}")`; loaded.add(i);};
  img.src=src;
}
function showSlide(i){
  slides.forEach((s,n)=>s.classList.toggle('active',n===i));
  if(number)number.textContent=String(i+1).padStart(2,'0');
  loadSlide(i, i===0);
  loadSlide((i+1)%slides.length, false);
}
showSlide(0);
setInterval(()=>{current=(current+1)%slides.length;showSlide(current)},6500);
window.addEventListener('scroll',()=>{const y=window.scrollY;const hero=document.querySelector('[data-parallax]');if(hero)hero.style.transform='translateY('+Math.min(y*.16,100)+'px')},{passive:true});
