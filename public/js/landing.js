const slides=[...document.querySelectorAll('.hero-slide')];
let current=0;
const number=document.getElementById('slide-number');
const setSlide=(i)=>{slides.forEach((s,n)=>s.classList.toggle('active',n===i));if(number)number.textContent=String(i+1).padStart(2,'0');};
const advance=()=>{if(slides.length<2)return;current=(current+1)%slides.length;setSlide(current);};
setSlide(0);
if(slides.length>1){
  window.setInterval(advance,6500);
  slides.forEach((slide)=>{const image=slide.querySelector('img');if(image)image.addEventListener('error',()=>slide.classList.add('image-unavailable'),{once:true});});
}
window.addEventListener('scroll',()=>{const y=window.scrollY;const hero=document.querySelector('[data-parallax]');if(hero)hero.style.transform='translateY('+Math.min(y*.16,100)+'px)'},{passive:true});