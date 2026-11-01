/* GPS processing is entirely local. No positions are stored or transmitted. */
(function(root){
'use strict';
class GPSSpeedTracker {
  constructor(){this.reset();}
  reset(){this.anchor=null;this.lastFixTime=0;this.lastValidAt=0;this.speed=null;this.acceleration=0;this.source='waiting';}
  stale(now=Date.now()){return !this.lastValidAt || now-this.lastValidAt>6000;}
  update(position,now=Date.now()){
    const c=position&&position.coords,t=position&&position.timestamp;
    const reject=reason=>({valid:false,reason});
    if(!c||!Number.isFinite(t)||t>now+2000||now-t>6000||t<=this.lastFixTime)return reject('定位时间无效或已过期');
    if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>50)return reject('定位精度不足，等待更好的信号');
    const fix={lat:c.latitude,lon:c.longitude,time:t,accuracy:c.accuracy};
    this.lastFixTime=t;
    let raw,source='GPS 直接测速';
    if(Number.isFinite(c.speed)&&c.speed>=0){raw=c.speed;this.anchor=fix;}
    else {
      source='位置差分估算';
      if(!this.anchor||t-this.anchor.time>15000){this.anchor=fix;return reject('正在收集位置，等待下一次定位');}
      const dt=(t-this.anchor.time)/1000;
      if(dt<1)return reject('等待有效定位间隔');
      const distance=GPSSpeedTracker.distance(this.anchor,fix);
      // Suppress position jitter, accumulate movement against the same anchor.
      const uncertainty=Math.max(3,(fix.accuracy+this.anchor.accuracy)*0.6);
      raw=distance<=uncertainty?0:distance/dt;
      if(distance>uncertainty||dt>=10)this.anchor=fix;
    }
    if(raw>100)return reject('速度异常，忽略本次定位'); // 360 km/h safety ceiling
    if(raw<0.45)raw=0;
    const dt=this.lastValidAt?(t-this.lastValidAt)/1000:0;
    if(this.speed!==null&&dt>0&&dt<6&&Math.abs(raw-this.speed)>Math.max(12,dt*8))return reject('速度跳变，等待稳定信号');
    const previous=this.speed;
    const alpha=dt>0&&dt<6?1-Math.exp(-dt/0.6):1;
    this.speed=previous===null?raw:previous+alpha*(raw-previous);
    if(raw===0&&this.speed<0.45)this.speed=0;
    this.acceleration=previous!==null&&dt>0&&dt<6?(this.speed-previous)/dt:0;
    this.lastValidAt=t;this.source=source;
    return {valid:true,speed:this.speed,rawSpeed:raw,acceleration:this.acceleration,accuracy:c.accuracy,source};
  }
  static distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,x=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,x)),Math.sqrt(Math.max(0,1-x)));}
}
// Short-horizon trend prediction. It never advances more than 1.2 seconds
// beyond the last valid fix, and never more than 4 km/h beyond measured speed.
class GPSSpeedPredictor {
 constructor(){this.reset();}
 reset(){this.samples=[];this.speed=0;this.time=0;this.trend=0;this.lastRaw=null;this.direction=0;this.directionCount=0;this.candidate=0;this.candidateCount=0;}
 update(speed,time){
  if(!Number.isFinite(speed)||speed<0||!Number.isFinite(time))return;
  if(this.time&&time<=this.time)return;
  if(!this.time||time-this.time>4000)this.reset();
  const first=!this.time,recent=this.lastRaw===null?0:(speed-this.lastRaw)/Math.max(.1,(time-this.time)/1000);
  const direction=Math.abs(recent)>.06?Math.sign(recent):0;
  this.directionCount=direction&&direction===this.direction?this.directionCount+1:direction?1:0;this.direction=direction;
  const outside=Math.abs(speed-this.speed)>.35?Math.sign(speed-this.speed):0;
  this.candidateCount=outside&&outside===this.candidate?this.candidateCount+1:outside?1:0;this.candidate=outside;
  const confirmed=this.directionCount>=2;
  if(first||confirmed||this.candidateCount>=2){this.speed=speed;this.candidate=0;this.candidateCount=0;}
  this.lastRaw=speed;this.time=time;this.samples.push({speed,time});this.samples=this.samples.filter(p=>time-p.time<=3500).slice(-5);
  if(speed<.45){this.speed=0;this.trend=0;this.samples=[{speed:0,time}];this.directionCount=0;return;}
  if(confirmed&&this.samples.length>1){const a=this.samples[0],dt=(time-a.time)/1000;let raw=Math.max(-1.3,Math.min(1.3,(speed-a.speed)/dt));
   if(Math.sign(raw)!==direction)raw=Math.max(-1.3,Math.min(1.3,recent));
   const desired=Math.abs(raw)<.06?0:raw;this.trend=this.trend*.5+desired*.5;
  }else this.trend=0; // No prediction from alternating or unconfirmed GPS noise.
 }
 estimate(now,maxAcceleration=.9){
  if(!this.time)return {speed:0,rate:0};
  const age=Math.max(0,(now-this.time)/1000),trend=Math.max(-maxAcceleration,Math.min(maxAcceleration,this.trend));
  const horizon=Math.min(1.2,age),offset=Math.max(-4/3.6,Math.min(4/3.6,trend*horizon));
  return {speed:Math.max(0,this.speed+offset)*3.6,rate:age<1.2?trend*3.6:0};
 }
}
// Rate + jerk limited tracking with trend feed-forward. A moving GPS target
// does not reset acceleration to zero every time the follower catches it.
class GPSSpeedFollower {
 constructor(){this.reset();}
 reset(){this.value=0;this.target=0;this.rate=0;this.targetRate=0;}
 setTarget(value,rate=0){if(Number.isFinite(value)){this.target=Math.max(0,Math.min(100,value));this.targetRate=Number.isFinite(rate)?rate:0;}}
 step(dt,maxRate=3.24){
  if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(maxRate)||maxRate<=0)return this.value;
  const jerk=maxRate*1.5;
  for(let remaining=Math.min(dt,1);remaining>1e-9;){
   const h=Math.min(remaining,1/120);remaining-=h;
   const difference=this.target-this.value,feed=Math.max(-maxRate,Math.min(maxRate,this.targetRate));
   if(Math.abs(difference)<.002&&Math.abs(feed)<.001){this.value=this.target;this.rate=0;break;}
   const desired=Math.max(-maxRate,Math.min(maxRate,feed+difference*3));
   const previous=this.rate;this.rate+=Math.max(-jerk*h,Math.min(jerk*h,desired-this.rate));
   let delta=(previous+this.rate)*.5*h;
   delta=Math.max(Math.min(0,difference),Math.min(Math.max(0,difference),delta));
   this.value+=delta;
   // Keep velocity for a moving target, otherwise settle without overshoot.
   if(this.value===this.target&&Math.abs(feed)<.001)this.rate=0;
  }
  return this.value;
 }
}
// Stateful Schmitt-trigger stage selection. Crossing a boundary is not enough:
// it must clear the margin on the new side before the modulation stage changes.
class HysteresisStages {
 constructor(){this.reset();}
 reset(){this.key=null;this.stage=0;}
 select(value,thresholds,key,margin=1){
  if(this.key!==key){this.key=key;this.stage=thresholds.filter(t=>value>=t).length;return this.stage;}
  while(this.stage<thresholds.length&&value>=thresholds[this.stage]+margin)this.stage++;
  while(this.stage>0&&value<thresholds[this.stage-1]-margin)this.stage--;
  return this.stage;
 }
}
if(typeof module!=='undefined'&&module.exports)module.exports={GPSSpeedTracker,GPSSpeedFollower,GPSSpeedPredictor,HysteresisStages};else {root.GPSSpeedTracker=GPSSpeedTracker;root.GPSSpeedFollower=GPSSpeedFollower;root.GPSSpeedPredictor=GPSSpeedPredictor;root.HysteresisStages=HysteresisStages;}
})(typeof globalThis!=='undefined'?globalThis:this);
