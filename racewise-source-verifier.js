/* RaceWise cross-source evidence verifier. No network fetching; verifies supplied records. */
(function () {
"use strict";
const clean = v => String(v == null ? "" : v).trim();
const norm = v => clean(v).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
function verifyRecords(records, registry, options) {
  const sources = new Map(((registry && registry.sources) || []).filter(s => s && s.id).map(s => [s.id,s]));
  const minSources = Math.max(2, Number(options && options.minIndependentSources) || 2);
  const groups = new Map(), rejected = [];
  (Array.isArray(records) ? records : []).forEach(record => {
    const reasons = [], source = sources.get(clean(record && record.sourceId));
    if (!record || typeof record !== "object") reasons.push("record_missing");
    if (!source) reasons.push("source_not_registered");
    if (!clean(record && record.factType)) reasons.push("fact_type_missing");
    if (!clean(record && record.subjectKey)) reasons.push("subject_identity_missing");
    if (!clean(record && record.recordDate)) reasons.push("record_date_missing");
    if (!record || (record.value === undefined && record.rawValue === undefined && record.normalisedValue === undefined)) reasons.push("value_missing");
    if (!clean(record && record.sourceUrl)) reasons.push("source_url_missing");
    if (source && record && record.sourceUrl) {
      try {
        const actual = new URL(record.sourceUrl), expected = new URL(source.url);
        if (actual.hostname !== expected.hostname && !actual.hostname.endsWith("." + expected.hostname)) reasons.push("source_host_mismatch");
      } catch (_) { reasons.push("source_url_invalid"); }
    }
    if (reasons.length) { rejected.push({sourceId:record && record.sourceId || null, recordId:record && record.recordId || null, reasons}); return; }
    const raw = record.value !== undefined ? record.value : record.normalisedValue !== undefined ? record.normalisedValue : record.rawValue;
    const value = typeof raw === "number" ? String(Number(raw.toFixed(4))) : norm(raw);
    const key = [clean(record.factType),norm(record.subjectKey),clean(record.recordDate),clean(record.contextKey)].join("|");
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({sourceId:record.sourceId,sourceName:source.name,priority:Number(source.priority)||99,value,rawValue:raw,sourceUrl:record.sourceUrl,retrievedAt:record.retrievedAt||null,sourceVerified:record.sourceVerified===true,independent:record.independent!==false});
  });
  const assessments=[];
  groups.forEach((items,key)=>{
    const distinct=new Set(items.filter(x=>x.independent).map(x=>x.sourceId));
    const values=new Set(items.map(x=>x.value)), conflict=values.size>1;
    const authority=items.slice().sort((a,b)=>a.priority-b.priority)[0];
    const allVerified=items.every(x=>x.sourceVerified);
    let status="single_source_unverified";
    if(conflict) status="conflicting_records";
    else if(distinct.size>=minSources && allVerified) status="cross_source_corroborated";
    else if(distinct.size>=minSources) status="multi_source_match_needs_record_verification";
    else if(allVerified) status="single_authoritative_record";
    assessments.push({key,factType:key.split("|")[0],status,recordCount:items.length,independentSourceCount:distinct.size,selectedValue:conflict?null:authority.rawValue,authoritySourceId:authority.sourceId,records:items,note:conflict?"Sources disagree; preserve all values and resolve before scoring.":status==="cross_source_corroborated"?"Matching values found in independent sources; each record carries a verification flag.":"Insufficient independent record-level verification."});
  });
  return {valid:true,totalInputRecords:Array.isArray(records)?records.length:0,acceptedRecordCount:assessments.reduce((n,g)=>n+g.recordCount,0),rejectedRecordCount:rejected.length,groupCount:assessments.length,corroboratedCount:assessments.filter(x=>x.status==="cross_source_corroborated").length,conflictCount:assessments.filter(x=>x.status==="conflicting_records").length,assessments,rejected};
}
function statisticsFromResults(records) {
  const valid=(Array.isArray(records)?records:[]).filter(r=>r&&r.identityVerified===true&&r.sourceVerified===true&&Number.isInteger(Number(r.finishingPosition))&&Number(r.finishingPosition)>0&&Number.isInteger(Number(r.fieldSize))&&Number(r.fieldSize)>=Number(r.finishingPosition));
  const starts=valid.length,wins=valid.filter(r=>Number(r.finishingPosition)===1).length,places=valid.filter(r=>Number(r.finishingPosition)<=3).length;
  const rate=n=>starts?Number((100*n/starts).toFixed(1)):null;
  return {starts,wins,places,winRatePercent:rate(wins),placeRatePercent:rate(places),sampleSufficient:starts>=10,note:starts<10?"Small sample; display counts and label rates low-sample.":"Descriptive rates; segment by date window, course, distance, class and going where available."};
}
window.RACEWISE_SOURCE_VERIFIER={version:"1.0.0",verifyRecords,statisticsFromResults};
})();