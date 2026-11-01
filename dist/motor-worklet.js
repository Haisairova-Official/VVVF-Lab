'use strict';
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

// Generic RL current + rotating-field torque-ripple proxy. No measured motor transfer function.
class TractionSound extends AudioWorkletProcessor {
 constructor(){super();this.target={f:0,fc:800,n:0,six:false,m:0,on:false,load:0,random:0,third:0};this.f=0;this.fc=800;this.m=0;this.env=0;this.a=0;this.b=0;this.i=[0,0,0];this.dc=0;this.lp=0;this.coilLP=0;this.coilDC=0;this.prevMotor=0;this.prevCoil=0;this.seed=1234567;this.jitter=0;this.oversample=8;this.fs=sampleRate*this.oversample;this.alpha=1-Math.exp(-1/(this.fs*.003));this.smooth=1-Math.exp(-1/(this.fs*.02));this.gpsSmooth=1-Math.exp(-1/(this.fs*.10));this.dcAlpha=1-Math.exp(-2*Math.PI*35/this.fs);this.lowAlpha=1-Math.exp(-2*Math.PI*7000/this.fs);this.coilAlpha=1-Math.exp(-2*Math.PI*180/this.fs);this.gpsExpiresAt=0;this.gpsFramesLeft=0;this.port.onmessage=e=>{this.target=e.data;this.gpsExpiresAt=Number.isFinite(e.data.gpsExpiresAt)?e.data.gpsExpiresAt:Date.now()+6000;this.gpsFramesLeft=Math.max(0,Math.min(6000,this.gpsExpiresAt-Date.now()))/1000*sampleRate}}
 rand(){this.seed=(Math.imul(1664525,this.seed)+1013904223)|0;return(this.seed>>>0)/4294967296*2-1}
 process(inputs,outputs){const motor=outputs[0][0],coil=outputs[1][0],p={...this.target};if(p.gps){this.gpsFramesLeft-=motor.length;if(this.gpsFramesLeft<=0||Date.now()>this.gpsExpiresAt){p.on=false;p.f=0;p.m=0;}}const wave={...p};for(let j=0;j<motor.length;j++){let acc=0,voltage=0;for(let os=0;os<this.oversample;os++){
 const pitchSmooth=p.gps?this.gpsSmooth:this.smooth;this.f+=pitchSmooth*(p.f-this.f);this.fc+=pitchSmooth*(p.fc-this.fc);this.m+=this.smooth*(p.m-this.m);this.env+=this.smooth*((p.on?1:0)-this.env);
 this.a=(this.a+this.f/this.fs)%1;this.b+=this.fc*(1+(p.random||0)*this.jitter)/this.fs;if(this.b>=1){this.b%=1;this.jitter=this.rand()}
 wave.m=this.m;const a=PWM.phase(this.a,wave,this.b),b=PWM.phase(this.a-1/3,wave,this.b),c=PWM.phase(this.a-2/3,wave,this.b),common=(a+b+c)/3;
 this.i[0]+=this.alpha*(a-common-this.i[0]);this.i[1]+=this.alpha*(b-common-this.i[1]);this.i[2]+=this.alpha*(c-common-this.i[2]);
 const alpha=this.i[0],beta=(this.i[1]-this.i[2])/Math.sqrt(3),angle=this.a*2*Math.PI;
 const torque=alpha*Math.sin(angle)-beta*Math.cos(angle);this.dc+=this.dcAlpha*(torque-this.dc);
 this.lp+=this.lowAlpha*((torque-this.dc)*4-this.lp);this.coilLP+=this.lowAlpha*((a-b)*.22-this.coilLP);this.coilDC+=this.coilAlpha*(this.coilLP-this.coilDC);
 acc+=this.lp*this.env;voltage+=(this.coilLP-this.coilDC)*this.env;
 }motor[j]=acc/this.oversample;coil[j]=voltage/this.oversample;}return true}
}
registerProcessor('traction',TractionSound);
