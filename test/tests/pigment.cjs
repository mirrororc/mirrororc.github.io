const assert=require('node:assert/strict');
const pigment=require('../src/watercolor.js');
const w=101,h=101,source=new Float32Array(w*h),center=50*w+50;
source[center]=1;
const sum=x=>x.reduce((a,b)=>a+b,0);
const secondMoment=x=>x.reduce((total,value,i)=>total+value*((i%w-50)**2+(Math.floor(i/w)-50)**2),0);
let previousMoment=0;
for(const sigma of [.5,1,2,4,7]){
  const field=pigment.diffuse(source,w,h,sigma);
  assert(Math.abs(sum(field)-1)<1e-5,'diffusion must conserve pigment mass away from canvas edges');
  const moment=secondMoment(field);assert(moment>previousMoment,'pigment must expand as time grows');previousMoment=moment;
  for(let x=51;x<90;x++)assert(field[50*w+x]<=field[50*w+x-1]+1e-8,'radial profile must fade continuously without rings');
}
const a=pigment.diffuse(source,w,h,4.1),b=pigment.diffuse(source,w,h,4.10001);
assert(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<1e-5,'fractional blur changes must be continuous');
console.log('PASS pigment: mass / outward diffusion / no radial rings / fractional continuity');
