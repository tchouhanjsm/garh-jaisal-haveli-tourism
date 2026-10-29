(function(){
'use strict';
const root=document.querySelector('[data-journal-preview]');if(!root)return;
const slugs=['jaisalmer-fort-guide','staying-inside-jaisalmer-fort','jaisalmer-fort-arrival-checklist','heritage-hotel-booking-checklist','best-time-to-visit-jaisalmer','jaisalmer-two-day-itinerary','jain-temples-jaisalmer-guide','thar-desert-experience-planning','gadisar-lake-jaisalmer-guide','bada-bagh-vyas-chhatri-guide','kuldhara-village-jaisalmer-guide','jaisalmer-photography-guide'];
const labels={'fort-and-heritage':'Fort & heritage','trip-planning':'Trip planning','itineraries':'Itineraries','desert-planning':'Desert planning','beyond-the-fort':'Beyond the Fort'};
const search=root.querySelector('[data-journal-search]'),topic=root.querySelector('[data-journal-topic]'),clear=root.querySelector('[data-journal-clear]');
const results=root.querySelector('[data-journal-results]'),error=root.querySelector('[data-journal-error]'),featured=root.querySelector('[data-journal-featured]'),grid=root.querySelector('[data-journal-grid]'),empty=root.querySelector('[data-journal-empty]');
const archive=root.querySelector('.journal-archive'),panel=root.querySelector('[data-journal-article]'),title=root.querySelector('[data-journal-article-title]'),topicNode=root.querySelector('[data-journal-article-topic]'),lede=root.querySelector('[data-journal-article-lede]');
const toc=root.querySelector('[data-journal-toc]'),body=root.querySelector('[data-journal-article-body]'),sources=root.querySelector('[data-journal-sources]'),related=root.querySelector('[data-journal-related]');
const backs=Array.from(root.querySelectorAll('[data-journal-back]'));let records=[];
const reviewNodes={
recordStatus:root.querySelector('[data-review-record-status]'),
heroCaption:root.querySelector('[data-review-hero-caption]'),
heroCaptionReview:root.querySelector('[data-review-hero-caption-review]'),
editorial:root.querySelector('[data-review-editorial]'),
source:root.querySelector('[data-review-source]'),
facts:root.querySelector('[data-review-facts]'),
media:root.querySelector('[data-review-media]'),
ownerFacts:root.querySelector('[data-review-owner-facts]'),
reviewer:root.querySelector('[data-review-reviewer]'),
reviewedAt:root.querySelector('[data-review-reviewed-at]'),
approvedMedia:root.querySelector('[data-review-approved-media]'),
candidateMedia:root.querySelector('[data-review-candidate-media]'),
mediaConsistency:root.querySelector('[data-review-media-consistency]')
};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=String(text);return n;}
function norm(value){return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();}
function topicText(id){return labels[id]||'Travel guide';}
function searchText(r){const s=(r.sections||[]).map(x=>[x.heading].concat(x.body||[]).join(' ')).join(' ');return norm([r.slug,r.title,r.lede,r.seo&&r.seo.description,r.seo&&r.seo.primaryQuery,topicText(r.topic),s].join(' '));}
function art(r,i){const a=el('div','journal-card__art');a.setAttribute('aria-hidden','true');a.append(el('span','journal-card__art-word',r.slug==='jaisalmer-fort-guide'?'GJ':String(i+1).padStart(2,'0')),el('span','journal-card__art-index',topicText(r.topic)));return a;}
function card(r,i,isFeature){const c=el('article','journal-card'+(isFeature?' journal-card--featured':'')+' journal-card--topic-'+r.topic);c.dataset.journalCard=r.slug;c.dataset.topic=r.topic;c.append(art(r,i));const b=el('div','journal-card__body'),meta=el('div','journal-card__meta');meta.append(el('span','journal-card__topic',topicText(r.topic)),el('span','journal-draft-stamp','Draft preview'));b.append(meta,el('h3','',r.title),el('p','journal-card__lede',r.lede));const action=el('button','journal-card__action','Preview working draft');action.type='button';action.dataset.journalOpen=r.slug;action.setAttribute('aria-label','Preview draft: '+r.title);const arrow=el('span','','↗');arrow.setAttribute('aria-hidden','true');action.append(arrow);b.append(action);c.append(b);return c;}
function buildTopics(){Array.from(new Set(records.map(r=>r.topic))).sort((a,b)=>topicText(a).localeCompare(topicText(b))).forEach(id=>{const opt=el('option','',topicText(id));opt.value=id;topic.append(opt);});}
function renderArchive(){const q=norm(search.value),t=topic.value;const matches=records.filter(r=>(t==='all'||r.topic===t)&&(!q||searchText(r).includes(q)));const pillar=matches.find(r=>r.slug==='jaisalmer-fort-guide');featured.replaceChildren();grid.replaceChildren();if(pillar)featured.append(card(pillar,records.indexOf(pillar),true));matches.filter(r=>!pillar||r.slug!==pillar.slug).forEach(r=>grid.append(card(r,records.indexOf(r),false)));empty.hidden=matches.length>0;results.textContent=matches.length+(matches.length===1?' draft guide in this preview':' draft guides in this preview');}
function setReviewValue(node,label,state){
if(!node)return;
const allowed=['pending','approved','missing','rejected','unrecorded','not-approved','none','unreviewed','draft','warning','aligned'];
const safeState=allowed.includes(state)?state:'unrecorded';
node.replaceChildren(el('span','journal-readiness__value journal-readiness__value--'+safeState,label));
}
function setMappedReviewValue(node,value,labels){
const entry=Object.prototype.hasOwnProperty.call(labels,value)?labels[value]:['Not recorded','unrecorded'];
setReviewValue(node,entry[0],entry[1]);
}
function renderReadiness(record){
const review=record.editorialReview&&typeof record.editorialReview==='object'?record.editorialReview:{};
const media=record.media&&typeof record.media==='object'?record.media:{};
const approved=Array.isArray(media.approvedAssets)?media.approvedAssets:[];
const candidates=Array.isArray(media.candidates)?media.candidates:[];
setReviewValue(reviewNodes.recordStatus,record.status==='draft'?'Draft — not published':'Unexpected record status',record.status==='draft'?'draft':'warning');
setMappedReviewValue(reviewNodes.editorial,review.editorialStatus,{pending:['Pending','pending'],approved:['Approved in record','approved']});
setMappedReviewValue(reviewNodes.source,review.sourceStatus,{pending:['Pending','pending'],approved:['Approved in record','approved']});
setMappedReviewValue(reviewNodes.facts,review.factStatus,{pending:['Pending','pending'],approved:['Approved in record','approved']});
setMappedReviewValue(reviewNodes.media,review.mediaStatus,{missing:['Missing','missing'],pending:['Pending','pending'],rejected:['Rejected','rejected'],approved:['Approved in record','approved']});
setReviewValue(reviewNodes.ownerFacts,review.ownerFactApproved===true?'Approved in record':'Not approved',review.ownerFactApproved===true?'approved':'not-approved');
setReviewValue(reviewNodes.reviewer,typeof review.reviewer==='string'&&review.reviewer.trim()?review.reviewer.trim():'Not recorded',typeof review.reviewer==='string'&&review.reviewer.trim()?'aligned':'unrecorded');
const validReviewDate=typeof review.reviewedAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt)&&!Number.isNaN(Date.parse(review.reviewedAt+'T00:00:00Z'))&&new Date(review.reviewedAt+'T00:00:00Z').toISOString().slice(0,10)===review.reviewedAt;
setReviewValue(reviewNodes.reviewedAt,validReviewDate?review.reviewedAt:'Not recorded',validReviewDate?'aligned':'unrecorded');
const caption=typeof record.heroCaption==='string'?record.heroCaption.trim():'';
const captionValid=caption.length>=20&&caption.length<=180;
setReviewValue(reviewNodes.heroCaption,captionValid?'Caption text present — review is separate':'Not drafted or outside 20–180 characters',captionValid?'pending':'missing');
const captionReview=record.heroCaptionReview&&typeof record.heroCaptionReview==='object'?record.heroCaptionReview:{};
const captionReviewDate=typeof captionReview.reviewedAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(captionReview.reviewedAt)&&!Number.isNaN(Date.parse(captionReview.reviewedAt+'T00:00:00Z'))&&new Date(captionReview.reviewedAt+'T00:00:00Z').toISOString().slice(0,10)===captionReview.reviewedAt;
const captionReviewComplete=captionReview.status==='approved'&&typeof captionReview.reviewer==='string'&&captionReview.reviewer.trim().length>=2&&captionReviewDate&&typeof captionReview.evidenceReference==='string'&&captionReview.evidenceReference.trim().length>=8;
const captionReviewRejected=captionReview.status==='rejected';
const captionReviewLabel=captionReviewComplete?'Approved review recorded':captionReviewRejected?'Review rejected':captionReview.status==='pending'?'Review pending':captionReview.status==='approved'?'Review evidence incomplete':'Not recorded';
const captionReviewState=captionReviewComplete?'approved':captionReviewRejected?'rejected':captionReview.status==='pending'?'pending':captionReview.status==='approved'?'warning':'unrecorded';
setReviewValue(reviewNodes.heroCaptionReview,captionReviewLabel,captionReviewState);
setReviewValue(reviewNodes.approvedMedia,approved.length?approved.length+' approved asset record'+(approved.length===1?'':'s'):'None recorded',approved.length?'approved':'none');
setReviewValue(reviewNodes.candidateMedia,candidates.length?candidates.length+' candidate lead'+(candidates.length===1?'':'s')+' — not approved':'None recorded',candidates.length?'unreviewed':'none');
const recordsAgree=(review.mediaStatus==='approved')===(approved.length>0);
setReviewValue(reviewNodes.mediaConsistency,!recordsAgree?'Review required: status and approved asset records disagree':approved.length?'Status and approved asset records align':'No approved assets; consistent with current status',recordsAgree?(approved.length?'aligned':'none'):'warning');
}
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u:null;}catch(_){return null;}}
function showArticle(r){archive.hidden=true;panel.hidden=false;renderReadiness(r);title.textContent=r.title;topicNode.textContent=topicText(r.topic)+' · Draft preview';lede.textContent=r.lede;toc.replaceChildren();body.replaceChildren();sources.replaceChildren();related.replaceChildren();const ids=new Map();
(r.sections||[]).forEach((s,i)=>{const sid=/^[a-z0-9-]+$/.test(s.id)?s.id:'section-'+(i+1),id='journal-section-'+sid;ids.set(s.id,id);const section=el('section','journal-preview-section');section.id=id;section.append(el('h3','',s.heading));(s.body||[]).forEach(p=>section.append(el('p','',p)));body.append(section);});
const contents=Array.isArray(r.tableOfContents)?r.tableOfContents:[];contents.forEach(item=>{const id=ids.get(item.id);if(!id)return;const li=el('li'),a=el('a','',item.label);a.href='#'+id;li.append(a);toc.append(li);});
if(!toc.children.length)(r.sections||[]).forEach(s=>{const id=ids.get(s.id);if(!id)return;const li=el('li'),a=el('a','',s.heading);a.href='#'+id;li.append(a);toc.append(li);});
(r.sources||[]).forEach(s=>{const u=safeUrl(s.url);if(!u)return;const li=el('li'),a=el('a','',s.label);a.href=u.toString();a.target='_blank';a.rel='noopener noreferrer';li.append(a);sources.append(li);});
if(!sources.children.length)sources.append(el('li','','No validated source links are available in this record.'));
(r.relatedBlogs||[]).forEach(slug=>{const match=records.find(other=>other.slug===slug);if(!match||match.slug===r.slug)return;const btn=el('button','',match.title);btn.type='button';btn.dataset.journalRelated=match.slug;related.append(btn);});
if(!related.children.length)related.append(el('p','','No related draft notes are linked yet.'));
panel.focus({preventScroll:true});panel.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
function back(){panel.hidden=true;archive.hidden=false;search.focus({preventScroll:true});search.scrollIntoView({block:'center',behavior:'auto'});}
function openFrom(event){const btn=event.target.closest('[data-journal-open],[data-journal-related]');if(!btn)return;const slug=btn.dataset.journalOpen||btn.dataset.journalRelated;const r=records.find(x=>x.slug===slug);if(r)showArticle(r);}
search.addEventListener('input',renderArchive);topic.addEventListener('change',renderArchive);clear.addEventListener('click',()=>{search.value='';topic.value='all';renderArchive();search.focus();});
grid.addEventListener('click',openFrom);featured.addEventListener('click',openFrom);related.addEventListener('click',openFrom);backs.forEach(b=>b.addEventListener('click',back));
Promise.all(slugs.map(slug=>fetch('../content/blogs/'+slug+'.json',{credentials:'omit',cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Missing draft '+slug);return response.json();}).then(record=>{if(record.slug!==slug||record.status!=='draft'||!labels[record.topic])throw new Error('Ineligible draft '+slug);return record;})))
.then(data=>{records=data;buildTopics();renderArchive();}).catch(()=>{results.textContent='The draft preview could not load its records.';error.hidden=false;featured.replaceChildren();grid.replaceChildren();});
})();