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
    const alpha=dt>0&&dt<6?1-Math.exp(-dt/1.2):1;
    this.speed=previous===null?raw:previous+alpha*(raw-previous);
    if(raw===0&&this.speed<0.45)this.speed=0;
    this.acceleration=previous!==null&&dt>0&&dt<6?(this.speed-previous)/dt:0;
    this.lastValidAt=t;this.source=source;
    return {valid:true,speed:this.speed,rawSpeed:raw,acceleration:this.acceleration,accuracy:c.accuracy,source};
  }
  static distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,x=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,x)),Math.sqrt(Math.max(0,1-x)));}
}
if(typeof module!=='undefined'&&module.exports)module.exports={GPSSpeedTracker};else root.GPSSpeedTracker=GPSSpeedTracker;
})(typeof globalThis!=='undefined'?globalThis:this);
