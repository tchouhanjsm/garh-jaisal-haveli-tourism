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
const mediaWorkbench=root.querySelector('[data-media-workbench]'),mediaSearch=root.querySelector('[data-media-search]'),mediaRole=root.querySelector('[data-media-role-filter]'),mediaSource=root.querySelector('[data-media-source-filter]'),mediaClear=root.querySelector('[data-media-clear]'),mediaSummary=root.querySelector('[data-media-summary]'),mediaResults=root.querySelector('[data-media-results]'),mediaGrid=root.querySelector('[data-media-grid]'),mediaEmpty=root.querySelector('[data-media-empty]');
let mediaManifest=null,mediaGroups=[];
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
function safeAssetPath(value){
return typeof value==='string'&&/^assets\/images\/[a-z0-9._/-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(value)&&!value.includes('\\')&&!/[?#]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
}
function mediaManifestIndex(manifest){
const available=Boolean(manifest&&manifest.sourceRepository==='https://github.com/tchouhanjsm/garh-jaisal-website'&&manifest.sourceBranch==='main'&&Array.isArray(manifest.entries));
const entries=new Map();
if(available)manifest.entries.forEach(entry=>{if(safeAssetPath(entry.targetPath))entries.set(entry.targetPath,entry);});
return {available:available,entries:entries};
}
function mediaLine(parent,label,value){
const line=el('p','journal-media-card__line');
line.append(el('strong','',label+':'),document.createTextNode(' '+String(value===undefined||value===null||value===''?'Not recorded':value)));
parent.append(line);
return line;
}
function mediaRoleLabel(role){return role==='hero'?'Hero':'Social preview';}
function mediaTechnicalText(group,placement,image){
const requirement=placement.requirement||{},entry=group.manifestTrusted?group.manifestEntry:null;
const width=entry&&entry.dimensions&&Number.isInteger(entry.dimensions.width)?entry.dimensions.width:(image.naturalWidth||0);
const bytes=entry&&Number.isInteger(entry.bytes)?entry.bytes:0;
const minimum=Number(requirement.minWidth)||0,maximum=Number(requirement.maxBytes)||0;
const widthText=width?(width+'px '+(width>=minimum?'meets':'is below')+' the '+minimum+'px minimum'):'width not verified';
const bytesText=bytes?(bytes+' bytes '+(bytes<=maximum?'within':'over')+' the '+maximum+' byte cap'):'byte size not recorded in an exact source-manifest match';
const decodeText=image.naturalWidth>0?'browser image decode passed':'browser image decode pending';
return 'Technical evidence: '+decodeText+'; '+widthText+'; '+bytesText+'. This does not establish rights or article relevance.';
}
function buildMediaWorkbench(){
if(!mediaWorkbench||!mediaGrid)return;
const grouped=new Map();
records.forEach(record=>{
const media=record.media&&typeof record.media==='object'?record.media:{};
const candidates=Array.isArray(media.candidates)?media.candidates:[];
candidates.forEach(candidate=>{
if(!safeAssetPath(candidate.path))return;
if(!grouped.has(candidate.path))grouped.set(candidate.path,{path:candidate.path,placements:[]});
const requirement=media.requirements&&media.requirements[candidate.role]&&typeof media.requirements[candidate.role]==='object'?media.requirements[candidate.role]:{};
grouped.get(candidate.path).placements.push({record:record,candidate:candidate,requirement:requirement});
});
});
const manifestIndex=mediaManifestIndex(mediaManifest);
mediaGroups=Array.from(grouped.values()).sort((a,b)=>a.path.localeCompare(b.path));
mediaGroups.forEach(group=>{
const entry=manifestIndex.entries.get(group.path)||null;
const validSha=Boolean(entry&&typeof entry.sourceBlobSha==='string'&&/^[a-f0-9]{40}$/i.test(entry.sourceBlobSha)&&entry.sourceBlobSha===entry.targetBlobSha);
group.manifestEntry=entry;
group.manifestTrusted=validSha;
group.sourceStatus=!manifestIndex.available?'unavailable':validSha?'matched':'unmatched';
});
mediaGrid.replaceChildren();
const placementCount=mediaGroups.reduce((total,group)=>total+group.placements.length,0);
const mappedCount=mediaGroups.filter(group=>group.sourceStatus==='matched').length;
const approvedCount=records.reduce((total,record)=>total+(Array.isArray(record.media&&record.media.approvedAssets)?record.media.approvedAssets.length:0),0);
mediaSummary.textContent=placementCount+' candidate placements across '+mediaGroups.length+' unique asset paths. '+mappedCount+' exact source/target blob matches in the current migration manifest. '+approvedCount+' approved article media records. Source mapping is not rights or article approval; this board is read-only.';
mediaGroups.forEach((group,index)=>{
const cardNode=el('article','journal-media-card');
const roles=Array.from(new Set(group.placements.map(item=>item.candidate.role))).sort();
const roleText=roles.map(mediaRoleLabel).join(' · ');
const allRightsUnverified=group.placements.every(item=>item.candidate.rightsStatus==='unverified');
const allUnreviewed=group.placements.every(item=>item.candidate.reviewStatus==='unreviewed');
cardNode.dataset.mediaCard=group.path;
cardNode.dataset.mediaPath=group.path;
cardNode.dataset.mediaRoles=roles.join(' ');
cardNode.dataset.mediaSource=group.sourceStatus;
cardNode.setAttribute('aria-labelledby','journal-media-card-title-'+(index+1));
const figure=el('figure','journal-media-card__figure');
const image=document.createElement('img');
image.alt='';
image.setAttribute('aria-hidden','true');
image.loading='lazy';
image.decoding='async';
const figcaption=el('figcaption','','Visual inspection lead only · not approved for article use');
figure.append(image,figcaption);
const content=el('div','journal-media-card__content');
const meta=el('div','journal-media-card__meta');
meta.append(el('span','journal-card__topic',roleText),el('span','journal-draft-stamp','Candidate · not approved'));
content.append(meta);
const heading=el('h3','',group.path);
heading.id='journal-media-card-title-'+(index+1);
content.append(heading);
const status=el('p','journal-media-card__status','Article review: '+(allUnreviewed?'unreviewed':'mixed')+' · Rights: '+(allRightsUnverified?'unverified':'mixed')+' · Visual fit: '+(group.placements.every(item=>item.candidate.fit==='not-assessed')?'not assessed':'varies'));
status.dataset.mediaReview=allUnreviewed?'unreviewed':'mixed';
status.dataset.mediaRights=allRightsUnverified?'unverified':'mixed';
content.append(status);
const technical=el('p','journal-media-card__technical','Browser decode pending; role-specific technical evidence is incomplete.');
content.append(technical);
const manifest=el('div','journal-media-card__manifest');
manifest.append(el('h4','','Source repository mapping'));
if(group.sourceStatus==='matched'){
mediaLine(manifest,'Source repository','garh-jaisal-website · main');
mediaLine(manifest,'Source path',group.manifestEntry.sourcePath);
mediaLine(manifest,'Source/target Git blob SHA',group.manifestEntry.sourceBlobSha+' · exact match');
mediaLine(manifest,'Manifest visual subject',group.manifestEntry.visualSubject);
if(group.manifestEntry.dimensions)mediaLine(manifest,'Manifest dimensions',group.manifestEntry.dimensions.width+' × '+group.manifestEntry.dimensions.height);
if(Number.isInteger(group.manifestEntry.bytes))mediaLine(manifest,'Manifest file size',group.manifestEntry.bytes+' bytes');
mediaLine(manifest,'Manifest MIME type',group.manifestEntry.mimeType);
mediaLine(manifest,'Existing asset alt text (reference only)',group.manifestEntry.altText);
mediaLine(manifest,'Migration provenance',group.manifestEntry.provenance);
mediaLine(manifest,'Publication caveat',group.manifestEntry.publicationCaveat);
mediaLine(manifest,'Separate rights/usage decision','Still unverified for these article uses');
}else if(group.sourceStatus==='unmatched'){
mediaLine(manifest,'Source mapping',group.manifestEntry?'Manifest entry exists but source/target blob identity is not verified':'No exact targetPath entry in the current migration manifest');
mediaLine(manifest,'Rights/usage status','Unverified; no source or licence inference is made');
}else{
mediaLine(manifest,'Source mapping','Migration manifest unavailable or its repository/branch identity could not be verified');
mediaLine(manifest,'Rights/usage status','Unverified; no source or licence inference is made');
}
content.append(manifest);
const details=el('details','journal-media-card__details');
const summary=el('summary','','Review '+group.placements.length+' draft placement'+(group.placements.length===1?'':'s')+' and evidence');
const usageList=el('ul','journal-media-card__placements');
group.placements.forEach(placement=>{
const candidate=placement.candidate,visual=candidate.visualReview&&typeof candidate.visualReview==='object'?candidate.visualReview:{},source=candidate.sourceEvidence&&typeof candidate.sourceEvidence==='object'?candidate.sourceEvidence:{};
const item=el('li','journal-media-card__placement');
item.dataset.mediaPlacement='true';
item.append(el('h4','',placement.record.title));
mediaLine(item,'Intended role',mediaRoleLabel(candidate.role));
mediaLine(item,'Required subject',placement.requirement.subject);
mediaLine(item,'Candidate fit',candidate.fit);
mediaLine(item,'Candidate review status',candidate.reviewStatus);
mediaLine(item,'Visual review',visual.status);
mediaLine(item,'Visual evidence',visual.evidence);
mediaLine(item,'Visual reviewer/date',(visual.reviewer||'Not recorded')+' / '+(visual.reviewedAt||'Not recorded'));
mediaLine(item,'Rights status',candidate.rightsStatus);
mediaLine(item,'Creator',source.creator);
mediaLine(item,'Source URL',source.sourceUrl);
mediaLine(item,'Licence name',source.licenseName);
mediaLine(item,'Source evidence reference',source.evidenceReference);
mediaLine(item,'Rights verified by/date',(source.verifiedBy||'Not recorded')+' / '+(source.verifiedAt||'Not recorded'));
mediaLine(item,'Candidate rationale',candidate.rationale);
mediaLine(item,'Candidate provenance note',candidate.provenance);
const technicalLine=el('p','journal-media-card__technical',mediaTechnicalText(group,placement,image));
technicalLine.dataset.mediaTechnical='true';
item.append(technicalLine);
usageList.append(item);
});
details.append(summary,usageList);
content.append(details);
const openLink=el('a','journal-media-card__open','Open full-size candidate image');
openLink.href='../'+group.path;
openLink.target='_blank';
openLink.rel='noopener noreferrer';
content.append(openLink);
cardNode.append(figure,content);
mediaGrid.append(cardNode);
const updateTechnical=function(){
technical.textContent=mediaTechnicalText(group,group.placements[0],image);
cardNode.querySelectorAll('[data-media-technical]').forEach(node=>{
const placement=group.placements.find(item=>node.parentElement&&node.parentElement.querySelector('h4')&&node.parentElement.querySelector('h4').textContent===item.record.title&&node.parentElement.querySelector('[data-media-technical]')===node);
if(placement)node.textContent=mediaTechnicalText(group,placement,image);
});
};
image.addEventListener('load',updateTechnical);
image.addEventListener('error',function(){technical.textContent='Browser image decode failed. Technical validation remains incomplete.';cardNode.querySelectorAll('[data-media-technical]').forEach(node=>{node.textContent='Browser image decode failed. Technical validation remains incomplete.';});});
image.src='../'+group.path;
});
mediaWorkbench.setAttribute('aria-busy','false');
renderMediaWorkbench();
}
function renderMediaWorkbench(){
if(!mediaGrid||!mediaResults||!mediaSearch||!mediaRole||!mediaSource)return;
const query=norm(mediaSearch.value),role=mediaRole.value,source=mediaSource.value;
let visible=0;
mediaGroups.forEach(group=>{
const roleMatches=role==='all'||group.placements.some(item=>item.candidate.role===role);
const sourceMatches=source==='all'||group.sourceStatus===source;
const searchValue=norm([group.path,group.manifestEntry&&group.manifestEntry.sourcePath,group.manifestEntry&&group.manifestEntry.visualSubject,group.placements.map(item=>[item.record.title,item.candidate.role,item.requirement.subject,item.candidate.rationale,item.candidate.provenance].join(' ')).join(' ')].join(' '));
const matches=roleMatches&&sourceMatches&&(!query||searchValue.includes(query));
const cardNode=mediaGrid.querySelector('[data-media-card="'+group.path.replace(/"/g,'\\"')+'"]');
if(cardNode){cardNode.hidden=!matches;if(matches)visible++;}
});
mediaResults.textContent='Showing '+visible+' of '+mediaGroups.length+' unique candidate asset paths; '+mediaGroups.reduce((total,group)=>total+group.placements.length,0)+' draft placements in the current records.';
if(mediaEmpty)mediaEmpty.hidden=visible>0;
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
if(mediaSearch)mediaSearch.addEventListener('input',renderMediaWorkbench);if(mediaRole)mediaRole.addEventListener('change',renderMediaWorkbench);if(mediaSource)mediaSource.addEventListener('change',renderMediaWorkbench);if(mediaClear)mediaClear.addEventListener('click',()=>{mediaSearch.value='';mediaRole.value='all';mediaSource.value='all';renderMediaWorkbench();mediaSearch.focus();});
grid.addEventListener('click',openFrom);featured.addEventListener('click',openFrom);related.addEventListener('click',openFrom);backs.forEach(b=>b.addEventListener('click',back));
const recordRequest=Promise.all(slugs.map(slug=>fetch('../content/blogs/'+slug+'.json',{credentials:'omit',cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Missing draft '+slug);return response.json();}).then(record=>{if(record.slug!==slug||record.status!=='draft'||!labels[record.topic])throw new Error('Ineligible draft '+slug);return record;})));
const manifestRequest=fetch('../docs/MEDIA-MIGRATION-MANIFEST.json',{credentials:'omit',cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Media migration manifest unavailable');return response.json();}).catch(()=>null);
Promise.all([recordRequest,manifestRequest]).then(data=>{records=data[0];mediaManifest=data[1];buildTopics();renderArchive();buildMediaWorkbench();}).catch(()=>{results.textContent='The draft preview could not load its records.';error.hidden=false;featured.replaceChildren();grid.replaceChildren();if(mediaSummary)mediaSummary.textContent='Candidate media evidence could not be loaded because the draft records are unavailable.';});
})();