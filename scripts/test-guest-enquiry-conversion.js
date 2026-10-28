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
function localDateOffset(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const testDates = {
  yesterday: localDateOffset(-1),
  today: localDateOffset(0),
  day2: localDateOffset(2),
  day3: localDateOffset(3),
  day5: localDateOffset(5),
};
function makeForm() {
  const form=element({'data-guest-enquiry-form':''});
  const submit=element({'data-guest-enquiry-submit':''},'Prepare WhatsApp enquiry');
  const status=element({'data-guest-enquiry-status':''},'Loading');
  const values={experience:'Swiss tent overnight',arrival:testDates.day3,departure:testDates.day5,guests:'2',notes:'Vegetarian meal request'};
  const experienceField=element({name:'experience'});
  experienceField.value=values.experience;
  experienceField.selectedOptions=[element({'data-requires-departure':'true'})];
  const arrival=element({name:'arrival'});
  const departure=element({name:'departure'});
  arrival.value=values.arrival; arrival.min='';
  departure.value=values.departure; departure.min='';
  form.children={'[data-guest-enquiry-submit]':submit,'[data-guest-enquiry-status]':status,'[name="experience"]':experienceField,'[name="arrival"]':arrival,'[name="departure"]':departure};
  form.reportValidity=()=>!arrival.validationMessage&&!departure.validationMessage&&(!departure.required||Boolean(departure.value));
  form.dispatch=function(type,event={}){const ev={...event,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const fn of this.listeners.get(type)||[])fn(ev);return ev;};
  return {form,submit,status,experienceField,arrival,departure,values};
}
async function boot({config,fetchFails=false,arrival=testDates.day3,departure=testDates.day5,experience='Swiss tent overnight'}={}) {
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
  guest.values.experience=experience;
  guest.experienceField.value=experience;
  const departureRequired = ['Sleep under the stars','Swiss tent overnight','Room availability'].includes(experience);
  guest.experienceField.selectedOptions=[element(departureRequired?{'data-requires-departure':'true'}:{})];
  guest.values.arrival=arrival;
  guest.arrival.value=arrival;
  guest.values.departure=departure;
  guest.departure.value=departure;
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
  const localToday = testDates.today;
  const good=await boot({config:valid});
  assert.equal(good.guest.submit.disabled,false);
  assert.equal(good.guest.status.dataset.state,'ready');
  assert.equal(good.guest.arrival.min,localToday);
  assert.equal(good.guest.departure.min,good.guest.arrival.value);
  assert.equal(good.guest.departure.required,true,'overnight stays require a departure date');
  const event=good.guest.form.dispatch('submit');
  assert.equal(event.defaultPrevented,true);
  assert.equal(good.opened.length,1);
  assert.match(good.opened[0][0],/^https:\/\/wa\.me\/917727047567\?text=/);
  assert.equal(good.opened[0][1],'_blank');
  const bodyText=new URL(good.opened[0][0]).searchParams.get('text');
  assert.match(bodyText,/Swiss tent overnight/);
  assert.match(bodyText,new RegExp('Requested date \/ arrival: ' + testDates.day3));
  assert.match(bodyText,new RegExp('Departure: ' + testDates.day5));
  assert.match(bodyText,/Guests: 2/);
  assert.match(bodyText,/Vegetarian meal request/);
  assert.match(bodyText,/does not confirm a booking/);
  assert.equal(good.guest.status.dataset.state,'ready');
  const badDate=await boot({config:valid,departure:testDates.day3});
  badDate.guest.form.dispatch('submit');
  assert.equal(badDate.opened.length,0);
  assert.equal(badDate.guest.departure.validationMessage,'Departure must be after arrival.');
  // Correcting arrival alone must recompute the range and clear the stale
  // custom error; requiring an edit to departure would trap the guest.
  badDate.guest.arrival.value=testDates.day2;
  badDate.guest.values.arrival=testDates.day2;
  badDate.guest.arrival.dispatch('input');
  assert.equal(badDate.guest.departure.min,testDates.day2);
  assert.equal(badDate.guest.departure.validationMessage,'');
  assert.equal(badDate.guest.form.reportValidity(),true);
  badDate.guest.form.dispatch('submit');
  assert.equal(badDate.opened.length,1);
  const recoveredText=new URL(badDate.opened[0][0]).searchParams.get('text');
  assert.match(recoveredText,new RegExp('Requested date \/ arrival: ' + testDates.day2));
  assert.match(recoveredText,new RegExp('Departure: ' + testDates.day3));
  const missingStayDeparture=await boot({config:valid,departure:''});
  assert.equal(missingStayDeparture.guest.departure.required,true);
  missingStayDeparture.guest.form.dispatch('submit');
  assert.equal(missingStayDeparture.opened.length,0,'overnight enquiry without departure must not open a draft');

  const dayEnquiry=await boot({config:valid,experience:'Sunset camel safari',departure:''});
  assert.equal(dayEnquiry.guest.departure.required,false,'day experiences do not require a departure date');
  dayEnquiry.guest.form.dispatch('submit');
  assert.equal(dayEnquiry.opened.length,1,'day experience may prepare a single-date enquiry');
  const dayText=new URL(dayEnquiry.opened[0][0]).searchParams.get('text');
  assert.match(dayText,/Interest: Sunset camel safari/);
  assert.match(dayText,new RegExp('Requested date \/ arrival: ' + testDates.day3));
  assert.doesNotMatch(dayText,/^Departure:/m,'blank optional departure must be omitted from the draft');

  for (const interest of ['Sleep under the stars','Swiss tent overnight','Room availability']) {
    const stay=await boot({config:valid,experience:interest,departure:''});
    assert.equal(stay.guest.departure.required,true,interest + ' requires a departure date');
  }

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
  for (const pageName of ['experiences.html','experience-details.html','dining.html']) {
    const html=fs.readFileSync(path.join(__dirname,'..',pageName),'utf8');
    const start=html.indexOf('<form class="guest-enquiry-form" data-guest-enquiry-form>');
    const end=start < 0 ? -1 : html.indexOf('</form>',start);
    const formHtml=start >= 0 && end >= 0 ? html.slice(start,end + '</form>'.length) : '';
    assert.ok(formHtml,pageName + ' must retain the shared guest enquiry form');
    const departureTag=(formHtml.match(/<input[^>]*name="departure"[^>]*>/)||[])[0]||'';
    assert.ok(departureTag,pageName + ' must expose a departure date field');
    assert.ok(!departureTag.includes(' required'),pageName + ' departure is optional in static markup');
    assert.ok(formHtml.includes('id="guest-enquiry-departure-hint"'),pageName + ' departure must explain when it is required');
    for (const option of ['Sleep under the stars','Swiss tent overnight','Room availability']) {
      assert.ok(formHtml.includes('<option data-requires-departure="true">' + option + '</option>'),pageName + ' must mark ' + option + ' as stay-like');
    }
  }
  console.log('PASS: intent-aware enquiry dates, encoded drafts, authorized destination, and fail-closed cases.');
})().catch(error=>{console.error(error);process.exitCode=1;});
