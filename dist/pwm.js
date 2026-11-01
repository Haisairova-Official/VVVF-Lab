// Shared by the scope and AudioWorklet: phases are in electrical cycles.
const PWM = {
 triangle(x) { x = x - Math.floor(x); return 1 - 4 * Math.abs(((x + .25) % 1) - .5); },
 phase(x,p,carrier) {
  x -= Math.floor(x);
  if (p.she) {
   const q=Math.floor(x*4);let angle=(x*4-q)*Math.PI/2;
   if(q&1)angle=Math.PI/2-angle;
   let level=p.she[0];for(let i=1;i<p.she.length;i+=2){if(angle<p.she[i])break;level=p.she[i+1];}
   return q>1?1-level:level-1;
  }
  if(p.six)return x<.5?1:-1;
  const ref=p.m*(Math.sin(2*Math.PI*x)+(p.third||0)*Math.sin(6*Math.PI*x));
  return ref>this.triangle(p.n?x*p.n:carrier)?1:-1;
 }
};
