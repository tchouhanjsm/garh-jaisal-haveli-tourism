'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeClassList() {
  const set = new Set();
  return { add(...xs) { xs.forEach(x => set.add(x)); }, remove(...xs) { xs.forEach(x => set.delete(x)); }, toggle(x, force) { const next = force === undefined ? !set.has(x) : Boolean(force); next ? set.add(x) : set.delete(x); return next; }, contains(x) { return set.has(x); } };
}
function element(attrs = {}, text = '') {
  const attributes = new Map(Object.entries(attrs));
  const listeners = new Map();
  const classes = makeClassList();
  const el = {
    attributes, listeners, classList: classes, textContent: text, hidden: false, disabled: false, dataset: {},
    setAttribute(k,v){attributes.set(k,String(v));}, getAttribute(k){return attributes.has(k)?attributes.get(k):null;}, removeAttribute(k){attributes.delete(k);},
    addEventListener(type, fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    dispatch(type,event={}){const ev={...event,preventDefault(){ev.defaultPrevented=true;}};for(const fn of listeners.get(type)||[])fn(ev);return ev;},
    querySelector(sel){return this.children?.[sel]||null;}, querySelectorAll(){return [];},
    reportValidity(){return true;}, setCustomValidity(message){this.validationMessage=String(message);}, appendChild(){}, focus(){},
  };
  return el;
}
function makeForm() {
  const form=element({'data-guest-enquiry-form':''});
  const submit=element({'data-guest-enquiry-submit':''},'Prepare WhatsApp enquiry');
  const status=element({'data-guest-enquiry-status':''},'Loading');
  const departure=element({name:'departure'});
  const values={experience:'Swiss tent overnight',arrival:'2026-11-01',departure:'2026-11-03',guests:'2',notes:'Vegetarian meal request'};
  form.children={'[data-guest-enquiry-submit]':submit,'[data-guest-enquiry-status]':status,'[name="departure"]':departure};
  form.reportValidity=()=>true;
  form.dispatch=function(type,event={}){const ev={...event,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const fn of this.listeners.get(type)||[])fn(ev);return ev;};
  return {form,submit,status,departure,values};
}
async function boot({config,fetchFails=false,departure='2026-11-03'}={}) {
  const enquiry=element({'data-enquiry-link':'','href':'#contact-status','aria-disabled':'true','data-enquiry-message':'Please share details.'});
  const phone=element({'data-contact-phone':'','href':'#contact-status','aria-disabled':'true'});
  const alt=element({'data-contact-alt-phone':'','href':'#contact-status','aria-disabled':'true'});
  const email=element({'data-contact-email':'','href':'#contact-status','aria-disabled':'true'});
  const booking=element({'data-booking-link':'','href':'#contact-status','aria-disabled':'true'});
  const baseForm=element({'data-booking-form':''});
  const bookingArrival=element({name:'arrival'}); bookingArrival.value='2026-11-01'; bookingArrival.min='';
  const bookingDeparture=element({name:'departure'}); bookingDeparture.value='2026-11-03'; bookingDeparture.min='';
  const bookingGuests=element({name:'guests'}); bookingGuests.value='2'; bookingGuests.selectedOptions=[{textContent:'2 guests'}];
  baseForm.elements={namedItem(name){return ({arrival:bookingArrival,departure:bookingDeparture,guests:bookingGuests})[name]||null;}};
  baseForm.reportValidity=()=>true;
  const bookingSubmit=element({'data-booking-submit':''});
  const bookingNote=element({'data-booking-note':''});
  baseForm.querySelector=s=>s==='[data-booking-submit]'?bookingSubmit:s==='[data-booking-note]'?bookingNote:null;
  const guest=makeForm();
  guest.values.departure=departure;
  guest.form.querySelector=s=>guest.form.children[s]||null;
  const header=element({'data-header':''});
  const toggle=element({'aria-expanded':'false','aria-label':'Open navigation'});
  const nav=element({});
  nav.querySelectorAll=()=>[];
  const contactStatus=element({},'Contact unavailable.');
  const body=element({});
  const document={
    body,currentScript:{src:'https://example.test/assets/site.js'},
    querySelector:s=>({'[data-header]':header,'.menu-toggle':toggle,'#primary-navigation':nav,'#contact-status':contactStatus})[s]||null,
    querySelectorAll:s=>({'[data-current-year]':[],'[data-booking-form]':[baseForm],'[data-accordion]':[],'[data-reveal]':[],'[data-enquiry-link]':[enquiry],'[data-contact-phone]':[phone],'[data-contact-alt-phone]':[alt],'[data-contact-email]':[email],'[data-booking-link]':[booking],'[data-guest-enquiry-form]':[guest.form]})[s]||[],
    createElement:()=>element({}),addEventListener(){},
  };
  const opened=[];
  const context={document,window:{location:{href:'https://example.test/experiences.html'},scrollY:0,addEventListener(){},clearTimeout(){},setTimeout(){return 1;},open:(...args)=>opened.push(args)},URL,URLSearchParams,FormData:class{constructor(){this.get=k=>guest.values[k]??'';}},console,encodeURIComponent,fetch:async()=>{if(fetchFails)throw new Error('offline');return{ok:true,json:async()=>config};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','assets/site.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {guest,enquiry,phone,alt,email,booking,bookingSubmit,bookingNote,contactStatus,opened,context};
}
const valid={verificationStatus:'owner-authorized-source',contact:{status:'source-authorized',whatsappBaseUrl:'https://wa.me/917727047567',primaryPhoneE164:'+917727047567',primaryPhoneDisplay:'+91 77270 47567',alternatePhoneE164:'+912992253836',alternatePhoneDisplay:'+91 2992 253836',email:'info@example.com'},booking:{status:'source-authorized',legacyBookingEngineUrl:'https://asiatech.in/booking_engine/index3?token=test'}};
(async()=>{
  const good=await boot({config:valid});
  assert.equal(good.guest.submit.disabled,false);
  assert.equal(good.guest.status.dataset.state,'ready');
  const event=good.guest.form.dispatch('submit');
  assert.equal(event.defaultPrevented,true);
  assert.equal(good.opened.length,1);
  assert.match(good.opened[0][0],/^https:\/\/wa\.me\/917727047567\?text=/);
  assert.equal(good.opened[0][1],'_blank');
  const bodyText=new URL(good.opened[0][0]).searchParams.get('text');
  assert.match(bodyText,/Swiss tent overnight/);
  assert.match(bodyText,/Arrival: 2026-11-01/);
  assert.match(bodyText,/Departure: 2026-11-03/);
  assert.match(bodyText,/Guests: 2/);
  assert.match(bodyText,/Vegetarian meal request/);
  assert.match(bodyText,/does not confirm a booking/);
  assert.equal(good.guest.status.dataset.state,'ready');
  const badDate=await boot({config:valid,departure:'2026-11-01'});
  badDate.guest.form.dispatch('submit');
  assert.equal(badDate.opened.length,0);
  assert.equal(badDate.guest.departure.getAttribute('setCustomValidity'),null);
  const unauthorized=await boot({config:{...valid,verificationStatus:'legacy-source-unverified'}});
  assert.equal(unauthorized.guest.submit.disabled,true);
  assert.equal(unauthorized.opened.length,0);
  assert.equal(unauthorized.guest.status.dataset.state,'error');
  const badUrl=await boot({config:{...valid,contact:{...valid.contact,whatsappBaseUrl:'https://wa.me.evil.test/917727047567'}}});
  assert.equal(badUrl.guest.submit.disabled,true);
  assert.equal(badUrl.opened.length,0);
  const failed=await boot({config:valid,fetchFails:true});
  assert.equal(failed.guest.submit.disabled,true);
  assert.equal(failed.guest.status.dataset.state,'error');
  assert.match(failed.guest.status.textContent,/configuration could not be loaded/i);
  console.log('PASS: guest enquiry configuration, validation, encoded draft, authorized destination, and fail-closed cases.');
})().catch(error=>{console.error(error);process.exitCode=1;});
