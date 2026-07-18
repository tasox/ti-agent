import { useState, useRef, useMemo, useEffect, useCallback } from "react";


// ─────────────────────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const API = "http://localhost:3001/api";

const apiFetch = async (path, opts={}) => {
  const url = API + path;
  const { body, headers: extraHeaders, ...restOpts } = opts;
  const res = await fetch(url, {
    ...restOpts,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text().catch(()=>"");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return res.json();
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────
const BUILTIN_FEEDS = [
  // ── Core IOC / Indicator Feeds ───────────────────────────────────────────
  { id:"alienvault",  name:"AlienVault OTX",          xmlUrl:"https://otx.alienvault.com/api/v1/pulses/subscribed",       url:"https://otx.alienvault.com",                        category:"IOC Feeds",       color:"#00ff9d" },
  { id:"abuse",       name:"Abuse.ch (URLhaus)",       xmlUrl:"https://urlhaus.abuse.ch/feeds/recent/",                   url:"https://urlhaus.abuse.ch",                          category:"IOC Feeds",       color:"#00ff9d" },
  { id:"threatfox",   name:"ThreatFox",                xmlUrl:"https://threatfox.abuse.ch/export/json/recent/",           url:"https://threatfox.abuse.ch",                        category:"IOC Feeds",       color:"#00ff9d" },
  { id:"feodo",       name:"Feodo Tracker",            xmlUrl:"https://feodotracker.abuse.ch/downloads/ipblocklist.json", url:"https://feodotracker.abuse.ch",                     category:"IOC Feeds",       color:"#00ff9d" },
  { id:"phishtank",   name:"PhishTank",                xmlUrl:"https://data.phishtank.com/data/online-valid.json",        url:"https://phishtank.com",                             category:"IOC Feeds",       color:"#00ff9d" },
  { id:"openphish",   name:"OpenPhish",                xmlUrl:"https://openphish.com/feed.txt",                           url:"https://openphish.com",                             category:"IOC Feeds",       color:"#00ff9d" },
  { id:"circl",       name:"CIRCL MISP Feeds",         xmlUrl:"https://www.circl.lu/doc/misp/",                           url:"https://circl.lu/doc/misp/",                        category:"IOC Feeds",       color:"#00ff9d" },
  { id:"hibp",        name:"Have I Been Pwned",        xmlUrl:"http://feeds.feedburner.com/HaveIBeenPwnedLatestBreaches", url:"https://haveibeenpwned.com/",                       category:"IOC Feeds",       color:"#00ff9d" },

  // ── Vulnerabilities ──────────────────────────────────────────────────────
  { id:"cisa",        name:"CISA KEV",                 xmlUrl:"http://www.us-cert.gov/channels/techalerts.rdf",           url:"https://www.cisa.gov/",                             category:"Vulnerabilities", color:"#ffd700" },
  { id:"nist",        name:"NIST Cybersecurity Blog",  xmlUrl:"https://www.nist.gov/blogs/cybersecurity-insights/rss.xml",url:"https://www.nist.gov/",                             category:"Vulnerabilities", color:"#ffd700" },
  { id:"nvd",         name:"NVD / CVE Feed",           xmlUrl:"https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-recent.json.gz", url:"https://nvd.nist.gov",                  category:"Vulnerabilities", color:"#ffd700" },
  { id:"msrc",        name:"Microsoft Security RC",    xmlUrl:"https://msrc.microsoft.com/blog/feed",                     url:"https://msrc.microsoft.com/blog/",                  category:"Vulnerabilities", color:"#ffd700" },

  // ── Threat Intelligence ──────────────────────────────────────────────────
  { id:"asec",        name:"ASEC (AhnLab)",            xmlUrl:"https://asec.ahnlab.com/en/feed/",                         url:"https://asec.ahnlab.com/en/",                       category:"Threat Intel",    color:"#4fc3f7" },
  { id:"spiderlabs",  name:"LevelBlue SpiderLabs",     xmlUrl:"https://www.trustwave.com/en-us/resources/blogs/spiderlabs-blog/rss.xml", url:"https://levelblue.com/blogs/spiderlabs-blog", category:"Threat Intel", color:"#4fc3f7" },
  { id:"securelist",  name:"Securelist (Kaspersky)",   xmlUrl:"https://securelist.com/feed/",                             url:"https://securelist.com",                            category:"Threat Intel",    color:"#4fc3f7" },
  { id:"bluepurple",  name:"Cyber Defence Analysis",   xmlUrl:"https://bluepurple.substack.com/feed/",                   url:"https://bluepurple.binaryfirefly.com",              category:"Threat Intel",    color:"#4fc3f7" },
  { id:"crowdstrike", name:"CrowdStrike Blog",          xmlUrl:"https://www.crowdstrike.com/blog/feed/",                   url:"https://www.crowdstrike.com/en-us/blog/",           category:"Threat Intel",    color:"#4fc3f7" },
  { id:"permiso",     name:"Cloud Chronicles (Permiso)",xmlUrl:"https://permiso.io/blog/rss.xml",                         url:"https://permiso.io/blog",                           category:"Threat Intel",    color:"#4fc3f7" },
  { id:"groupib",     name:"Group-IB Blog",             xmlUrl:"https://blog.group-ib.com/rss.xml",                       url:"https://www.group-ib.com/blog/",                    category:"Threat Intel",    color:"#4fc3f7" },
  { id:"checkpoint",  name:"Check Point Research",     xmlUrl:"https://research.checkpoint.com/feed",                    url:"https://research.checkpoint.com/",                  category:"Threat Intel",    color:"#4fc3f7" },
  { id:"citizenlab",  name:"The Citizen Lab",           xmlUrl:"https://citizenlab.ca/feed/",                              url:"https://citizenlab.ca/",                            category:"Threat Intel",    color:"#4fc3f7" },
  { id:"sentinelone", name:"SentinelOne",               xmlUrl:"http://www.sentinelone.com/feed/",                         url:"https://www.sentinelone.com/",                      category:"Threat Intel",    color:"#4fc3f7" },
  { id:"securonix",   name:"Securonix",                 xmlUrl:"https://www.securonix.com/feed/",                          url:"https://www.securonix.com",                         category:"Threat Intel",    color:"#4fc3f7" },
  { id:"trendmicro",  name:"Trend Micro Research",      xmlUrl:"http://feeds.trendmicro.com/TrendMicroResearch",           url:"https://www.trendmicro.com/en_us/research.html",    category:"Threat Intel",    color:"#4fc3f7" },
  { id:"volexity",    name:"Volexity",                  xmlUrl:"http://www.volexity.com/blog/?feed=rss2",                  url:"https://www.volexity.com/blog/",                    category:"Threat Intel",    color:"#4fc3f7" },
  { id:"proofpoint",  name:"Proofpoint Threat Insight", xmlUrl:"https://www.proofpoint.com/us/threat-insight-blog.xml",   url:"https://www.proofpoint.com/us/blog",                category:"Threat Intel",    color:"#4fc3f7" },
  { id:"rapid7",      name:"Rapid7 Blog",               xmlUrl:"https://blog.rapid7.com/rss/",                             url:"https://www.rapid7.com/blog/",                      category:"Threat Intel",    color:"#4fc3f7" },
  { id:"talos",       name:"Cisco Talos Blog",          xmlUrl:"https://blog.talosintelligence.com/feed",                  url:"https://blog.talosintelligence.com/",               category:"Threat Intel",    color:"#4fc3f7" },
  { id:"googletag",   name:"Google TAG",                xmlUrl:"https://blog.google/threat-analysis-group/rss",            url:"https://blog.google/threat-analysis-group/",       category:"Threat Intel",    color:"#4fc3f7" },
  { id:"seebug",      name:"Seebug Paper",              xmlUrl:"https://paper.seebug.org/rss",                             url:"https://paper.seebug.org/",                         category:"Threat Intel",    color:"#4fc3f7" },
  { id:"eset",        name:"WeLiveSecurity (ESET)",     xmlUrl:"http://blog.eset.com/feed",                                url:"https://www.welivesecurity.com",                    category:"Threat Intel",    color:"#4fc3f7" },
  { id:"cyble",       name:"Cyble",                     xmlUrl:"https://cyble.com/feed/",                                  url:"https://cyble.com",                                 category:"Threat Intel",    color:"#4fc3f7" },
  { id:"cybereason",  name:"Cybereason Blog",           xmlUrl:"https://www.cybereason.com/blog/rss.xml",                  url:"https://www.cybereason.com/blog",                   category:"Threat Intel",    color:"#4fc3f7" },
  { id:"virustotal",  name:"VirusTotal Blog",           xmlUrl:"http://blog.virustotal.com/feeds/posts/default",           url:"https://blog.virustotal.com/",                      category:"Threat Intel",    color:"#4fc3f7" },
  { id:"msblog",      name:"Microsoft Security Blog",   xmlUrl:"https://www.microsoft.com/en-us/security/blog/feed/",     url:"https://www.microsoft.com/en-us/security/blog/",    category:"Threat Intel",    color:"#4fc3f7" },
  { id:"mandiant",    name:"Mandiant Reports",          xmlUrl:"https://www.mandiant.com/resources/reports/rss.xml",      url:"https://www.mandiant.com/",                         category:"Threat Intel",    color:"#4fc3f7" },
  { id:"unit42",      name:"Unit 42 (Palo Alto)",       xmlUrl:"http://feeds.feedburner.com/Unit42",                       url:"https://unit42.paloaltonetworks.com/",              category:"Threat Intel",    color:"#4fc3f7" },
  { id:"dfirreport",  name:"The DFIR Report",           xmlUrl:"https://thedfirreport.com/feed/",                          url:"https://thedfirreport.com/home/",                   category:"Threat Intel",    color:"#4fc3f7" },
  { id:"morphisec",   name:"Morphisec Blog",            xmlUrl:"http://blog.morphisec.com/rss.xml",                        url:"https://blog.morphisec.com",                        category:"Threat Intel",    color:"#4fc3f7" },
  { id:"tarlogic",    name:"Tarlogic Security",         xmlUrl:"https://www.tarlogic.com/feed/",                           url:"https://www.tarlogic.com/",                         category:"Threat Intel",    color:"#4fc3f7" },
  { id:"symantec",    name:"Symantec Threat Intel",     xmlUrl:"https://sed-cms.broadcom.com/rss/v1/blogs/rss.xml/221",   url:"https://www.security.com",                          category:"Threat Intel",    color:"#4fc3f7" },
  { id:"teamcymru",   name:"Team Cymru",                xmlUrl:"https://www.team-cymru.com/blog-feed.xml",                 url:"https://www.team-cymru.com/blog",                   category:"Threat Intel",    color:"#4fc3f7" },
  { id:"avast",       name:"Avast Threat Labs",         xmlUrl:"https://decoded.avast.io/feed/",                           url:"https://decoded.avast.io/",                         category:"Threat Intel",    color:"#4fc3f7" },
  { id:"k7labs",      name:"K7 Labs",                   xmlUrl:"https://labs.k7computing.com/index.php/feed/",             url:"https://labs.k7computing.com",                      category:"Threat Intel",    color:"#4fc3f7" },
  { id:"harfanglab",  name:"HarfangLab",                xmlUrl:"https://harfanglab.io/feed",                               url:"https://harfanglab.io",                             category:"Threat Intel",    color:"#4fc3f7" },
  { id:"denwp",       name:"Denwp Research",            xmlUrl:"https://denwp.com/feed",                                   url:"https://denwp.com/",                                category:"Threat Intel",    color:"#4fc3f7" },
  { id:"lab52",       name:"lab52",                     xmlUrl:"https://lab52.io/blog/feed/",                              url:"https://lab52.io/blog",                             category:"Threat Intel",    color:"#4fc3f7" },
  { id:"foxit",       name:"Fox-IT International Blog", xmlUrl:"https://blog.fox-it.com/rss",                              url:"https://blog.fox-it.com",                           category:"Threat Intel",    color:"#4fc3f7" },
  { id:"recordedfuture", name:"Recorded Future",        xmlUrl:"https://www.recordedfuture.com/feed",                     url:"https://www.recordedfuture.com",                    category:"Threat Intel",    color:"#4fc3f7" },
  { id:"intezer",     name:"Intezer",                   xmlUrl:"http://www.intezer.com/feed/",                             url:"https://intezer.com/",                              category:"Threat Intel",    color:"#4fc3f7" },

  // ── Red / Blue / Purple Team Research ───────────────────────────────────
  { id:"badsector",   name:"Bad Sector Labs",           xmlUrl:"https://blog.badsectorlabs.com/feeds/all.atom.xml",       url:"https://blog.badsectorlabs.com/",                   category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"outflank",    name:"Outflank",                  xmlUrl:"https://outflank.nl/blog/feed/",                           url:"https://www.outflank.nl/blog/",                     category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"zerosum0x0",  name:"zerosum0x0",                xmlUrl:"https://zerosum0x0.blogspot.com/feeds/posts/default?alt=rss", url:"https://zerosum0x0.blogspot.com/",              category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"specterops",  name:"SpecterOps",                xmlUrl:"https://posts.specterops.io/feed",                         url:"https://posts.specterops.io",                       category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"huntress",    name:"Huntress Blog",             xmlUrl:"https://www.huntress.com/blog/rss.xml",                   url:"https://www.huntress.com/blog",                     category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"binarydef",   name:"Binary Defense",            xmlUrl:"https://www.binarydefense.com/feed/",                     url:"https://www.binarydefense.com/",                    category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"nccgroup",    name:"NCC Group Research",        xmlUrl:"https://research.nccgroup.com/feed/",                     url:"https://research.nccgroup.com",                     category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"redsiege",    name:"Red Siege InfoSec",         xmlUrl:"https://redsiege.com/blog/feed",                           url:"https://redsiege.com",                              category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"mdsec",       name:"MDSec",                     xmlUrl:"https://www.mdsec.co.uk/feed",                             url:"https://www.mdsec.co.uk/",                          category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"xpnsec",      name:"XPN InfoSec Blog",          xmlUrl:"https://blog.xpnsec.com/rss/",                             url:"https://blog.xpnsec.com/",                          category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"redcanary",   name:"Red Canary Blog",           xmlUrl:"https://www.redcanary.com/blog/feed/",                    url:"https://redcanary.com/blog/",                       category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"zephrsec",    name:"ZephrSec",                  xmlUrl:"https://blog.zsec.uk/rss/",                                url:"https://blog.zsec.uk/",                             category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"trimarc",     name:"Trimarc Security",          xmlUrl:"https://www.hub.trimarcsecurity.com/blog-feed.xml",       url:"https://www.hub.trimarcsecurity.com/posts",         category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"mitremedium", name:"MITRE ATT&CK (Medium)",     xmlUrl:"https://medium.com/feed/mitre-attack",                    url:"https://medium.com/mitre-attack",                   category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"kostasts",    name:"Kostas (Medium)",            xmlUrl:"https://medium.com/feed/@kostas-ts",                      url:"https://medium.com/@kostas-ts",                     category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"itm4n",       name:"itm4n blog",              xmlUrl:"https://itm4n.github.io/feed.xml",                        url:"https://itm4n.github.io/",                          category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"projectzero", name:"Google Project Zero",       xmlUrl:"http://googleprojectzero.blogspot.com/feeds/posts/default", url:"https://projectzero.google/",                   category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"compass",     name:"Compass Security Blog",     xmlUrl:"https://blog.compass-security.com/feed/",                 url:"https://blog.compass-security.com",                 category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"netspi",      name:"NetSPI",                    xmlUrl:"https://www.netspi.com/blog/rssid/1",                     url:"https://www.netspi.com/",                           category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"ptswarm",     name:"PT SWARM",                  xmlUrl:"https://swarm.ptsecurity.com/feed/",                      url:"https://swarm.ptsecurity.com",                      category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"malwarebytes",name:"Malwarebytes",              xmlUrl:"http://blog.malwarebytes.org/feed/",                       url:"https://www.malwarebytes.com/",                     category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"darknet",     name:"Darknet",                   xmlUrl:"http://feeds.feedburner.com/darknethackers",               url:"https://www.darknet.org.uk",                        category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"immersivelabs",name:"Immersive Labs",           xmlUrl:"https://immersivelabs.com/feed/",                         url:"https://www.immersivelabs.com/",                    category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"starlabs",    name:"STAR Labs",                 xmlUrl:"https://starlabs.sg/blog/index.xml",                      url:"https://starlabs.sg",                               category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"shorsec",     name:"Shorsec",                   xmlUrl:"https://shorsec.io/feed/",                                 url:"https://shorsec.io",                                category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"redxorblue",  name:"Red XOR Blue",              xmlUrl:"http://blog.redxorblue.com/feeds/posts/default",           url:"https://blog.redxorblue.com/",                      category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"shells",      name:"Shells.Systems",            xmlUrl:"https://shells.systems/feed/",                             url:"https://shells.systems",                            category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"falconforce", name:"FalconForce (Medium)",      xmlUrl:"https://medium.com/feed/falconforce",                     url:"https://medium.com/falconforce",                    category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"trustedsec",  name:"TrustedSec",                xmlUrl:"https://www.trustedsec.com/feed/",                        url:"https://www.trustedsec.com/",                       category:"Red|Blue|Purple", color:"#e879f9" },
  { id:"digitaldef",  name:"Digital Defense",           xmlUrl:"https://www.digitaldefense.com/feed/",                    url:"https://www.digitaldefense.com",                    category:"Red|Blue|Purple", color:"#e879f9" },

  // ── Security News ────────────────────────────────────────────────────────
  { id:"sans_isc",    name:"SANS Internet Storm Center",xmlUrl:"https://isc.sans.edu/rssfeed_full.xml",                   url:"https://isc.sans.edu",                              category:"Security News",   color:"#26c6da" },
  { id:"blueteamsec", name:"r/blueteamsec",             xmlUrl:"https://reddit.com/r/blueteamsec/rising",                  url:"https://reddit.com/r/blueteamsec/rising",            category:"Security News",   color:"#26c6da" },
  { id:"zeroday",     name:"ZERO DAY",                  xmlUrl:"https://www.zetter-zeroday.com/feed",                     url:"https://www.zetter-zeroday.com/",                   category:"Security News",   color:"#26c6da" },
  { id:"paloalto",    name:"Palo Alto Networks Blog",   xmlUrl:"http://researchcenter.paloaltonetworks.com/feed/",         url:"https://www.paloaltonetworks.com/blog/",            category:"Security News",   color:"#26c6da" },
  { id:"hackernews",  name:"The Hacker News",           xmlUrl:"http://thehackernews.com/feeds/posts/default",            url:"https://thehackernews.com",                         category:"Security News",   color:"#26c6da" },
  { id:"zimperium",   name:"Zimperium Blog",            xmlUrl:"http://blog.zimperium.com/feed/",                          url:"https://zimpstage.wpengine.com/blog/",               category:"Security News",   color:"#26c6da" },
  { id:"doublepulsar",name:"DoublePulsar",              xmlUrl:"https://doublepulsar.com/feed",                            url:"https://doublepulsar.com",                          category:"Security News",   color:"#26c6da" },
  { id:"itnews",      name:"iTnews Security",           xmlUrl:"http://www.itnews.com.au/RSS/rss.ashx?type=Category&ID=32",url:"https://www.itnews.com.au",                         category:"Security News",   color:"#26c6da" },
  { id:"krebsonsec",  name:"Krebs on Security",         xmlUrl:"http://krebsonsecurity.com/feed/",                         url:"https://krebsonsecurity.com",                       category:"Security News",   color:"#26c6da" },
  { id:"infosecmag",  name:"Infosecurity Magazine",     xmlUrl:"http://www.infosecurity-magazine.com/rss/news/",           url:"https://www.infosecurity-magazine.com/news/",       category:"Security News",   color:"#26c6da" },
  { id:"cyberscoop",  name:"CyberScoop",                xmlUrl:"https://www.cyberscoop.com/feed/",                         url:"https://cyberscoop.com/",                           category:"Security News",   color:"#26c6da" },
  { id:"therecord",   name:"The Record (Recorded Future)",xmlUrl:"https://therecord.media/feed",                          url:"https://therecord.media/",                          category:"Security News",   color:"#26c6da" },
  { id:"nytcybersec", name:"NYT Computer Security",     xmlUrl:"http://topics.nytimes.com/top/reference/timestopics/subjects/c/computer_security/?rss=1", url:"https://www.nytimes.com/topic/subject/computer-security-cybersecurity", category:"Security News", color:"#26c6da" },
  { id:"threatpost",  name:"Threatpost – Malware",      xmlUrl:"http://threatpost.com/category/malware-2/feed",           url:"https://threatpost.com",                            category:"Security News",   color:"#26c6da" },

  // ── CTF & Learning ───────────────────────────────────────────────────────
  { id:"securitynik", name:"SecurityNik",               xmlUrl:"http://securitynik.blogspot.com/feeds/posts/default",     url:"https://www.securitynik.com/",                      category:"CTF & Learning",  color:"#ff9800" },
  { id:"sansblog",    name:"SANS Blog",                 xmlUrl:"https://blogs.sans.org/computer-forensics/feed/",         url:"https://www.sans.org/blog",                         category:"CTF & Learning",  color:"#ff9800" },
];

const CATEGORY_COLORS = {
  "IOC Feeds":      "#00ff9d",
  "Vulnerabilities":"#ffd700",
  "Threat Intel":   "#4fc3f7",
  "Red|Blue|Purple":"#e879f9",
  "Security News":  "#26c6da",
  "CTF & Learning": "#ff9800",
  "Custom":         "#c084fc",
};

const MODELS = [
  { id:"haiku45",  name:"Haiku 4.5",  apiId:"claude-haiku-4-5-20251001",   inputPer1M:1.00,  outputPer1M:5.00,  color:"#26c6da", badge:"FASTEST · DEFAULT" },
  { id:"sonnet45", name:"Sonnet 4.5", apiId:"claude-sonnet-4-5-20251101",  inputPer1M:3.00,  outputPer1M:15.00, color:"#00ff9d", badge:"BALANCED" },
  { id:"sonnet46", name:"Sonnet 4.6", apiId:"claude-sonnet-4-6",           inputPer1M:3.00,  outputPer1M:15.00, color:"#4fc3f7", badge:"LATEST" },
  { id:"opus45",   name:"Opus 4.5",   apiId:"claude-opus-4-5",             inputPer1M:5.00,  outputPer1M:25.00, color:"#e879f9", badge:"CAPABLE" },
];

const DATE_PRESETS = [
  { label:"Last 24h", days:1 },
  { label:"Last 48h", days:2 },
  { label:"Last 7d",  days:7 },
  { label:"Last 14d", days:14 },
  { label:"Last 30d", days:30 },
  { label:"Custom",   days:null },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const toDateStr  = d => d.toISOString().slice(0,10);
const subtractDays = n => { const d=new Date(); d.setDate(d.getDate()-n); return toDateStr(d); };
const fmtDate  = s => new Date(s).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
const fmtMoney = n => n < 0.001 ? `$${(n*1000).toFixed(3)}m` : n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
const fmtMoneyFull = n => `$${n.toFixed(4)}`;
const fmtK     = n => n >= 1000 ? `${(n/1000).toFixed(1)}K` : n.toString();

function calcCost(inputTokens, outputTokens, modelId, batchDiscount=false, cacheHitRatio=0) {
  const m = MODELS.find(x=>x.id===modelId) || MODELS[1];
  const disc = batchDiscount ? 0.5 : 1;
  // cached portion of input is 10% of normal input price
  const effectiveInputRate = (m.inputPer1M / 1_000_000) * disc;
  const cacheReadRate      = (m.inputPer1M * 0.1 / 1_000_000) * disc;
  const outputRate         = (m.outputPer1M / 1_000_000) * disc;
  const inputCost  = inputTokens  * ((1 - cacheHitRatio) * effectiveInputRate + cacheHitRatio * cacheReadRate);
  const outputCost = outputTokens * outputRate;
  return { inputCost, outputCost, total: inputCost + outputCost };
}

// Rebuild the References section from sourceMap — guarantees completeness, no duplicates.
// Strips any existing ## 9. References block Claude may have produced, then appends authoritative one.
function rebuildReferences(body, sourceMap) {
  const stripped = body.replace(/\n## 9\. References[\s\S]*$/, "").trimEnd();
  const nums = [...new Set([...stripped.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10)))]
    .sort((a, b) => a - b);
  if (!nums.length || !Object.keys(sourceMap).length) return body;
  const lines = ["", "## 9. References", ""];
  for (const n of nums) {
    const src = sourceMap[String(n)];
    if (src) lines.push(`[${n}] ${src.name} — ${src.url}`);
  }
  return stripped + lines.join("\n");
}


function buildPrompt({ articles, feedErrors, query, dateFrom, dateTo }) {
  const total = articles.length;

  // Group articles by feed for the source list header
  const feedsSeen = {};
  articles.forEach(a => { feedsSeen[a.feedIndex] = a.feedName; });
  const feedList = Object.entries(feedsSeen)
    .map(([idx, name]) => `[${idx}] ${name}`)
    .join("\n");

  // Article digest — each article gets its own reference number (its feedIndex isn't unique per article)
  // Re-number articles 1..N for citation purposes
  const articleLines = articles.map((a, i) => {
    const num = i + 1;
    const dateStr = a.date !== "date-unknown" ? ` (${a.date})` : "";
    const summary = a.summary ? `\n     ${a.summary.slice(0, 400)}` : "";
    return `[${num}] "${a.title}"${dateStr} — ${a.feedName}\n     ${a.url}${summary}`;
  }).join("\n\n");

  const errorNote = feedErrors.length
    ? `\nNote: ${feedErrors.length} feed(s) could not be fetched: ${feedErrors.map(e=>e.feed).join(", ")}.`
    : "";

  return `You are a senior threat intelligence analyst at a Tier 1 SOC.
Produce a structured, actionable threat intelligence briefing based ONLY on the articles provided below.
Do NOT use any prior knowledge or training data — every claim must trace to a specific article in this list.

DATA WINDOW: ${dateFrom} to ${dateTo}
FOCUS: ${query}
TOTAL ARTICLES: ${total}${errorNote}

SOURCE FEEDS:
${feedList}

ARTICLES (each numbered for citation):
${articleLines}

CITATION RULE: After every factual claim, threat name, IOC, CVE, or actor mention, cite the article number in square brackets: [3] for one article, [3][7] for multiple. The citation must match the article number in the list above.

---

## 1. Data Window
This briefing covers ${fmtDate(dateFrom)} to ${fmtDate(dateTo)} — ${total} articles ingested.

## 2. Executive Summary
3-4 sentences for a CISO. Cite all claims [N].

## 3. Top Threats
Up to 5 items drawn from the articles above. Format: - SEVERITY: Name — description [N]
Severity: CRITICAL / HIGH / MEDIUM only. Omit if insufficient data.

## 4. IOC Highlights
Only IOCs explicitly mentioned in the articles. Format: \`value\` — type — [N]
Omit this section entirely if none found.

## 5. CVE Watch
CVEs explicitly mentioned in the articles. Use a markdown table:
| CVE ID | CVSS | Product | Status | Source |
|--------|------|---------|--------|--------|
Omit if none found.

## 6. Threat Actor Spotlight
Actors explicitly named in the articles. Cite all claims [N].

## 7. Analyst Recommendations
3 actionable steps derived from findings above.

## 8. MITRE ATT&CK Coverage
Techniques mentioned in the articles. Use a markdown table:
| Technique ID | Name | Context | Source |
|-------------|------|---------|--------|

## 9. References
List only articles actually cited:
[N] "Title" — Feed — URL

Today: ${new Date().toDateString()}`;
}

// Build sourceMap keyed by article index (1-based), mapping [N] → actual article URL + title
function buildSourceMap(articles) {
  const map = {};
  articles.forEach((a, i) => {
    map[String(i + 1)] = { name: `${a.feedName}: ${a.title}`, url: a.url || "" };
  });
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// HUNTING HYPOTHESES — extraction prompt + response parsing
// ─────────────────────────────────────────────────────────────────────────────
const HYPOTHESIS_CATEGORIES = ["Network", "Endpoint", "Cloud", "Identity", "Supply Chain"];

function buildHypothesisPrompt(reportBody) {
  return `You are a senior threat hunter at a Tier 1 SOC. Below is a threat intelligence briefing that was already produced from cited source articles — each factual claim carries a [N] citation matching the briefing's own reference list.

Your task: read the briefing and derive 3-8 ACTIONABLE THREAT HUNTING HYPOTHESES a hunt team could run against their own telemetry this week. Use ONLY content already present in the briefing below — do not introduce outside knowledge, and do not invent citation numbers that aren't already used in the briefing.

BRIEFING:
---
${reportBody}
---

Respond with STRICT JSON ONLY — a JSON array, no markdown fences, no prose before or after. Each element:
{
  "priority": "critical" | "high" | "medium",
  "category": one of ${JSON.stringify(HYPOTHESIS_CATEGORIES)},
  "title": "short one-line hunt title",
  "hypothesis": "2-4 sentences explaining the hunting rationale, keeping any [N] citation tokens from the briefing that support it",
  "where": "systems/logs/environments to look in",
  "data_sources": ["specific log source or telemetry type", "..."],
  "query": "pseudo detection-logic / query sketch, multi-line, // comments allowed",
  "mitre": ["T#### — Technique name", "..."],
  "iocs": ["specific indicator or artefact pattern to hunt for", "..."]
}`;
}

// Strict-JSON responses sometimes still arrive wrapped in ```json fences — strip before parsing.
function parseHypothesisResponse(text) {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of hypotheses.");
  return parsed;
}

// Resolve [N] citation tokens inside a hypothesis's free-text fields into refs
// grounded in the report's own sourceMap — never trust URLs the model might invent.
function resolveHypothesisRefs(hyp, sourceMap) {
  const text = [hyp.hypothesis, hyp.where, hyp.query].filter(Boolean).join(" ");
  const nums = [...new Set([...text.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10)))].sort((a, b) => a - b);
  const refs = nums
    .map(n => {
      const src = sourceMap[String(n)];
      return src ? { label: `[${n}] ${src.name}`, url: src.url } : null;
    })
    .filter(Boolean);
  return { ...hyp, refs };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
// Add mode (initial=null): creates a new custom feed with a category.
// Edit mode (initial={id,name,url}): renames/re-points an existing feed (built-in or custom) — no category field.
function FeedForm({ initial, onSave, onClose }) {
  const isEdit = !!initial;
  const [name,setName]=useState(initial?.name || ""); const [url,setUrl]=useState(initial?.url || ""); const [cat,setCat]=useState("Custom"); const [err,setErr]=useState("");
  const CATS=["Custom","Threat Feeds","Malware","Vulnerabilities","IOCs","Botnet","Phishing","Reports","Framework"];
  const inp={width:"100%",boxSizing:"border-box",background:"#060d14",border:"1px solid #1a3a4a",color:"#c9d8e8",padding:"0.6rem 0.8rem",borderRadius:"5px",fontFamily:"inherit",fontSize:"0.78rem",outline:"none"};
  const handleSave = () => {
    if(!name.trim()){setErr("Name required");return;}
    if (isEdit) onSave({ id: initial.id, name: name.trim(), url: url.trim() });
    else onSave({id:`custom_${Date.now()}`,name:name.trim(),url:url.trim(),category:cat,color:"#e879f9",isCustom:true});
    onClose();
  };
  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#0a1929",border:"1px solid #e879f933",borderRadius:"10px",padding:"1.8rem",width:"440px",maxWidth:"90vw",boxShadow:"0 0 60px #e879f911"}}>
        <div style={{color:"#e879f9",fontSize:"0.85rem",letterSpacing:"0.12em",marginBottom:"1.4rem"}}>{isEdit ? "✎ EDIT FEED" : "✦ ADD CUSTOM FEED"}</div>
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#4a6a80",fontSize:"0.65rem",letterSpacing:"0.15em",marginBottom:"0.4rem"}}>FEED NAME *</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Internal MISP, FS-ISAC..." style={inp}/>
        </div>
        <div style={{marginBottom:isEdit?"1.4rem":"1rem"}}>
          <div style={{color:"#4a6a80",fontSize:"0.65rem",letterSpacing:"0.15em",marginBottom:"0.4rem"}}>URL / ENDPOINT {!isEdit && <span style={{opacity:0.5}}>(optional)</span>}</div>
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..." style={inp}/>
        </div>
        {!isEdit && (
          <div style={{marginBottom:"1.4rem"}}>
            <div style={{color:"#4a6a80",fontSize:"0.65rem",letterSpacing:"0.15em",marginBottom:"0.4rem"}}>CATEGORY</div>
            <select value={cat} onChange={e=>setCat(e.target.value)} style={inp}>{CATS.map(c=><option key={c}>{c}</option>)}</select>
          </div>
        )}
        {err&&<div style={{color:"#ef5350",fontSize:"0.72rem",marginBottom:"1rem"}}>{"⚠"} {err}</div>}
        <div style={{display:"flex",gap:"0.8rem"}}>
          <button onClick={handleSave} style={{flex:1,padding:"0.7rem",background:"#e879f922",border:"1px solid #e879f9",color:"#e879f9",borderRadius:"5px",cursor:"pointer",fontFamily:"inherit",fontSize:"0.78rem",fontWeight:700}}>{isEdit ? "✎ SAVE CHANGES" : "✦ ADD FEED"}</button>
          <button onClick={onClose} style={{padding:"0.7rem 1.2rem",background:"transparent",border:"1px solid #1a3a4a",color:"#4a6a80",borderRadius:"5px",cursor:"pointer",fontFamily:"inherit",fontSize:"0.78rem"}}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// Mini sparkline using SVG
function Sparkline({ data, color="#00ff9d", height=32, width=120 }) {
  if (!data || data.length < 2) return <div style={{width,height,opacity:0.3,fontSize:"0.6rem",color:"#4a6a80",display:"flex",alignItems:"center"}}>no data</div>;
  const max=Math.max(...data); const min=Math.min(...data);
  const range=max-min||1;
  const pts=data.map((v,i)=>{
    const x=(i/(data.length-1))*width;
    const y=height-((v-min)/range)*(height-4)-2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{overflow:"visible"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.8"/>
      <circle cx={parseFloat(pts.split(" ").pop().split(",")[0])} cy={parseFloat(pts.split(" ").pop().split(",")[1])} r="2.5" fill={color}/>
    </svg>
  );
}

// Bar chart component
function BarChart({ bars, height=80, maxVal }) {
  const max = maxVal || Math.max(...bars.map(b=>b.value), 0.0001);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height,paddingTop:"4px"}}>
      {bars.map((b,i)=>(
        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"2px"}}>
          <div title={`${b.label}: ${fmtMoney(b.value)}`} style={{
            width:"100%",background:`${b.color||"#00ff9d"}55`,
            border:`1px solid ${b.color||"#00ff9d"}88`,
            borderRadius:"2px 2px 0 0",
            height:`${Math.max((b.value/max)*height,2)}px`,
            transition:"height 0.3s ease",
            cursor:"default",
          }}/>
        </div>
      ))}
    </div>
  );
}

// Cost tab component
function CostTab({ costLedger, selectedFeeds, schedule, selectedModelId, setSelectedModelId, maxTokens, setMaxTokens, liveEstimate }) {
  const [forecastDays, setForecastDays]     = useState(30);
  const [batchDiscount, setBatchDiscount]   = useState(false);
  const [cacheRatio, setCacheRatio]         = useState(0);
  const [budgetAlert, setBudgetAlert]       = useState(10);

  // Compute totals from ledger
  const totalSpend    = costLedger.reduce((s,r)=>s+r.totalCost, 0);
  const totalInput    = costLedger.reduce((s,r)=>s+r.inputTokens, 0);
  const totalOutput   = costLedger.reduce((s,r)=>s+r.outputTokens, 0);
  const totalReports  = costLedger.length;
  const avgCostPerRun = totalReports ? totalSpend / totalReports : 0;

  // Forecast
  const runsPerDay = schedule==="hourly" ? 24 : schedule==="weekly" ? 1/7 : 1;
  const forecastRuns = Math.ceil(runsPerDay * forecastDays);

  // Estimate per run for current config
  const estInputTokens  = 1200 + selectedFeeds.length * 1500; // ~1500 tok/feed: title+url+summary × ~10 articles
  const estOutputTokens = maxTokens;
  const estCost = calcCost(estInputTokens, estOutputTokens, selectedModelId, batchDiscount, cacheRatio);
  const forecastTotal = estCost.total * forecastRuns;
  const forecastModel = MODELS.find(m=>m.id===selectedModelId);

  // Cumulative spend data for chart
  const cumulative = costLedger.reduce((acc,r,i)=>{
    acc.push((acc[i-1]||0)+r.totalCost); return acc;
  },[]);

  // Per-run costs for bar chart (last 20)
  const recent = costLedger.slice(-20);
  const recentBars = recent.map(r=>({value:r.totalCost, color:"#00ff9d", label:r.timestamp}));

  // Model comparison for forecast
  const modelComparison = MODELS.map(m=>{
    const c = calcCost(estInputTokens, estOutputTokens, m.id, batchDiscount, cacheRatio);
    return { ...m, perRun: c.total, monthly: c.total * runsPerDay * 30, forecast: c.total * forecastRuns };
  });

  // Token breakdown
  const inputPct  = totalInput+totalOutput ? Math.round(totalInput/(totalInput+totalOutput)*100) : 0;
  const outputPct = 100 - inputPct;

  // Days until budget alert
  const daysUntilAlert = avgCostPerRun > 0 && runsPerDay > 0
    ? Math.floor((budgetAlert - totalSpend) / (avgCostPerRun * runsPerDay))
    : null;

  const ROW = ({label,val,sub,col="#c9d8e8"}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"0.5rem 0",borderBottom:"1px solid #0d2137"}}>
      <div>
        <span style={{color:"#4a6a80",fontSize:"0.72rem"}}>{label}</span>
        {sub&&<div style={{color:"#2a4a60",fontSize:"0.6rem"}}>{sub}</div>}
      </div>
      <span style={{color:col,fontSize:"0.85rem",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{val}</span>
    </div>
  );

  const CARD = ({title,children,accent="#00ff9d"}) => (
    <div style={{background:"#0a1929",border:`1px solid ${accent}22`,borderRadius:"8px",padding:"1.2rem"}}>
      <div style={{color:accent,fontSize:"0.68rem",letterSpacing:"0.18em",marginBottom:"1rem",display:"flex",alignItems:"center",gap:"0.4rem"}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:accent}}/>
        {title}
      </div>
      {children}
    </div>
  );

  return (
    <div>
      {/* ── Pre-flight Estimator ── */}
      <div style={{marginBottom:"1.5rem",background:"#0a1929",border:"1px solid #ffd70033",borderRadius:"10px",padding:"1.2rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <div style={{color:"#ffd700",fontSize:"0.68rem",letterSpacing:"0.18em",display:"flex",alignItems:"center",gap:"0.5rem"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#ffd700",boxShadow:"0 0 6px #ffd700"}}/>
            LIVE PRE-FLIGHT ESTIMATE
          </div>
          <div style={{color:"#4a6a80",fontSize:"0.62rem"}}>{selectedFeeds.length}{" feeds · "}{maxTokens.toLocaleString()}{" max tokens · "}{(MODELS.find(m=>m.id===selectedModelId)||{name:""}).name}</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.8rem",marginBottom:"1rem"}}>
          {[
            {label:"EST. INPUT TOKENS",  val: fmtK(estInputTokens),          sub:`~${selectedFeeds.length} feeds × 1500 tok`,   col:"#ffd700"},
            {label:"EST. OUTPUT TOKENS", val: fmtK(estOutputTokens),         sub:"= max tokens setting",                         col:"#ff9800"},
            {label:"EST. INPUT COST",    val: fmtMoneyFull(estCost.inputCost), sub:`@ $${(MODELS.find(m=>m.id===selectedModelId)||{inputPer1M:0}).inputPer1M}/1M`, col:"#ffd700"},
            {label:"EST. TOTAL COST",    val: fmtMoneyFull(estCost.total),   sub:"this request",                                 col:"#00ff9d"},
          ].map(k=>(
            <div key={k.label} style={{background:"#060d14",border:"1px solid #1a3a4a",borderRadius:"6px",padding:"0.8rem",textAlign:"center"}}>
              <div style={{color:"#4a6a80",fontSize:"0.55rem",letterSpacing:"0.15em",marginBottom:"0.3rem"}}>{k.label}</div>
              <div style={{color:k.col,fontSize:"1.05rem",fontWeight:700,lineHeight:1}}>{k.val}</div>
              <div style={{color:"#2a4a60",fontSize:"0.58rem",marginTop:"0.25rem"}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Token composition bar */}
        <div style={{marginBottom:"0.5rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.6rem",color:"#4a6a80",marginBottom:"0.3rem"}}>
            <span>Input tokens ({Math.round(estInputTokens/(estInputTokens+estOutputTokens)*100)}%)</span>
            <span>Output tokens ({Math.round(estOutputTokens/(estInputTokens+estOutputTokens)*100)}%)</span>
          </div>
          <div style={{height:6,background:"#0d2137",borderRadius:"3px",overflow:"hidden",display:"flex"}}>
            <div style={{width:`${Math.round(estInputTokens/(estInputTokens+estOutputTokens)*100)}%`,background:"linear-gradient(90deg,#ffd700,#ffb300)",transition:"width 0.3s ease"}}/>
            <div style={{flex:1,background:"linear-gradient(90deg,#ff9800,#ff6b35)"}}/>
          </div>
        </div>

        {/* Accuracy tracker — only shown if we have prior runs */}
        {costLedger.filter(r=>r.estTotalCost!=null).length > 0 && (() => {
          const runsWithEst = costLedger.filter(r=>r.estTotalCost!=null);
          const drifts = runsWithEst.map(r=>((r.totalCost - r.estTotalCost)/r.estTotalCost)*100);
          const avgDrift = drifts.reduce((a,b)=>a+b,0)/drifts.length;
          const maxDrift = Math.max(...drifts.map(Math.abs));
          const overCount = drifts.filter(d=>d>0).length;
          const underCount = drifts.filter(d=>d<0).length;
          return (
            <div style={{marginTop:"1rem",paddingTop:"1rem",borderTop:"1px solid #1a3a4a"}}>
              <div style={{color:"#4fc3f7",fontSize:"0.62rem",letterSpacing:"0.15em",marginBottom:"0.6rem"}}>◈ ESTIMATION ACCURACY ({runsWithEst.length} runs tracked)</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.6rem"}}>
                {[
                  {label:"AVG DRIFT",   val:`${avgDrift>0?"+":""}${avgDrift.toFixed(1)}%`, col:Math.abs(avgDrift)<10?"#00ff9d":Math.abs(avgDrift)<25?"#ffd700":"#ef5350"},
                  {label:"MAX DRIFT",   val:`±${maxDrift.toFixed(1)}%`,                     col:maxDrift<15?"#00ff9d":maxDrift<30?"#ffd700":"#ef5350"},
                  {label:"OVER EST.",   val:`${overCount} runs`,                             col:"#ff9800"},
                  {label:"UNDER EST.",  val:`${underCount} runs`,                            col:"#4fc3f7"},
                ].map(k=>(
                  <div key={k.label} style={{background:"#060d14",border:"1px solid #1a3a4a",borderRadius:"5px",padding:"0.6rem",textAlign:"center"}}>
                    <div style={{color:"#4a6a80",fontSize:"0.55rem",letterSpacing:"0.12em",marginBottom:"0.2rem"}}>{k.label}</div>
                    <div style={{color:k.col,fontSize:"0.9rem",fontWeight:700}}>{k.val}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:"0.6rem",overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.62rem"}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid #1a3a4a"}}>
                      {["#","Model","Feeds","Est. $","Actual $","Drift","In Tok Est→Act","Out Tok Est→Act"].map(h=>(
                        <th key={h} style={{padding:"0.3rem 0.5rem",color:"#4a6a80",textAlign:"left",fontWeight:400,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...runsWithEst].reverse().map((r,i)=>{
                      const drift = ((r.totalCost - r.estTotalCost)/r.estTotalCost)*100;
                      const driftCol = Math.abs(drift)<10?"#00ff9d":Math.abs(drift)<25?"#ffd700":"#ef5350";
                      return (
                        <tr key={r.id} style={{borderBottom:"1px solid #0d2137",background:i%2===0?"transparent":"#060d1455"}}>
                          <td style={{padding:"0.3rem 0.5rem",color:"#2a4a60"}}>{runsWithEst.length-i}</td>
                          <td style={{padding:"0.3rem 0.5rem",color:(MODELS.find(m=>m.id===r.modelId)||{color:"#c9d8e8"}).color}}>{r.modelName}</td>
                          <td style={{padding:"0.3rem 0.5rem",color:"#00ff9d"}}>{r.sources}</td>
                          <td style={{padding:"0.3rem 0.5rem",color:"#ffd700",fontVariantNumeric:"tabular-nums"}}>{fmtMoneyFull(r.estTotalCost)}</td>
                          <td style={{padding:"0.3rem 0.5rem",color:"#00ff9d",fontVariantNumeric:"tabular-nums"}}>{fmtMoneyFull(r.totalCost)}</td>
                          <td style={{padding:"0.3rem 0.5rem",color:driftCol,fontWeight:700}}>{drift>0?"+":""}{drift.toFixed(1)}%</td>
                          <td style={{padding:"0.3rem 0.5rem",color:"#4a6a80",whiteSpace:"nowrap"}}>{fmtK(r.estInputTokens)}{"→"}{fmtK(r.inputTokens)}</td>
                          <td style={{padding:"0.3rem 0.5rem",color:"#4a6a80",whiteSpace:"nowrap"}}>{fmtK(r.estOutputTokens)}{"→"}{fmtK(r.outputTokens)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Header KPIs ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"1rem",marginBottom:"1.5rem"}}>
        {[
          {label:"TOTAL SPENT",     val: fmtMoney(totalSpend),      sub:`${totalReports} reports`, col:"#00ff9d"},
          {label:"AVG PER REPORT",  val: fmtMoneyFull(avgCostPerRun), sub:"current model",         col:"#4fc3f7"},
          {label:"TOKENS IN",       val: fmtK(totalInput),           sub:"input tokens",           col:"#ffd700"},
          {label:"TOKENS OUT",      val: fmtK(totalOutput),          sub:"output tokens",          col:"#ff9800"},
          {label:"30D FORECAST",    val: fmtMoney(estCost.total*runsPerDay*30), sub:`${Math.round(runsPerDay*30)} runs`, col:"#e879f9"},
        ].map(k=>(
          <div key={k.label} style={{background:"#0a1929",border:"1px solid #1a3a4a",borderRadius:"8px",padding:"1rem",textAlign:"center"}}>
            <div style={{color:"#4a6a80",fontSize:"0.6rem",letterSpacing:"0.18em",marginBottom:"0.4rem"}}>{k.label}</div>
            <div style={{color:k.col,fontSize:"1.35rem",fontWeight:700,lineHeight:1}}>{k.val}</div>
            <div style={{color:"#2a4a60",fontSize:"0.62rem",marginTop:"0.3rem"}}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem",marginBottom:"1.5rem"}}>

        {/* ── Spend history chart ── */}
        <CARD title="SPEND PER REPORT (LAST 20 RUNS)" accent="#00ff9d">
          {recentBars.length ? (
            <>
              <BarChart bars={recentBars} height={80}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:"0.5rem",fontSize:"0.62rem",color:"#2a4a60"}}>
                <span>oldest</span><span>most recent</span>
              </div>
            </>
          ) : (
            <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:"#2a4a60",fontSize:"0.72rem"}}>Run reports to populate chart</div>
          )}
        </CARD>

        {/* ── Cumulative spend ── */}
        <CARD title="CUMULATIVE SPEND" accent="#4fc3f7">
          {cumulative.length > 1 ? (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"0.5rem"}}>
                <span style={{color:"#4a6a80",fontSize:"0.65rem"}}>run #1</span>
                <span style={{color:"#4fc3f7",fontSize:"1.1rem",fontWeight:700}}>{fmtMoney(totalSpend)}</span>
              </div>
              <Sparkline data={cumulative} color="#4fc3f7" height={60} width={260}/>
            </>
          ) : (
            <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:"#2a4a60",fontSize:"0.72rem"}}>Run at least 2 reports to see trend</div>
          )}
        </CARD>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem",marginBottom:"1.5rem"}}>

        {/* ── Forecast engine ── */}
        <CARD title="FORECAST ENGINE" accent="#ffd700">
          {/* Model selector */}
          <div style={{marginBottom:"1rem"}}>
            <div style={{color:"#4a6a80",fontSize:"0.62rem",letterSpacing:"0.15em",marginBottom:"0.5rem"}}>MODEL</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.4rem"}}>
              {MODELS.map(m=>(
                <button key={m.id} onClick={()=>setSelectedModelId(m.id)} style={{
                  padding:"0.45rem 0.6rem",textAlign:"left",
                  background:selectedModelId===m.id?`${m.color}18`:"transparent",
                  border:`1px solid ${selectedModelId===m.id?m.color:"#1a3a4a"}`,
                  borderRadius:"5px",cursor:"pointer",fontFamily:"inherit",
                }}>
                  <div style={{color:selectedModelId===m.id?m.color:"#4a6a80",fontSize:"0.68rem",fontWeight:700}}>{m.name}</div>
                  <div style={{color:"#2a4a60",fontSize:"0.58rem"}}>${m.inputPer1M}/${m.outputPer1M} per 1M</div>
                </button>
              ))}
            </div>
          </div>

          {/* Forecast horizon slider */}
          <div style={{marginBottom:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.3rem"}}>
              <span style={{color:"#4a6a80",fontSize:"0.65rem"}}>FORECAST HORIZON</span>
              <span style={{color:"#ffd700",fontSize:"0.78rem",fontWeight:700}}>{forecastDays} days</span>
            </div>
            <input type="range" min={7} max={365} step={1} value={forecastDays}
              onChange={e=>setForecastDays(+e.target.value)}
              style={{width:"100%",accentColor:"#ffd700"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.58rem",color:"#2a4a60",marginTop:"0.2rem"}}>
              <span>1w</span><span>1m</span><span>3m</span><span>6m</span><span>1y</span>
            </div>
          </div>

          {/* Optimisation toggles */}
          <div style={{display:"flex",gap:"0.8rem",marginBottom:"1rem"}}>
            {[
              {label:"Batch API",       sub:"−50%",  val:batchDiscount, set:setBatchDiscount, col:"#26c6da"},
              {label:"Prompt Caching",  sub:"−85% input", val:cacheRatio>0, set:v=>setCacheRatio(v?0.85:0), col:"#00ff9d"},
            ].map(t=>(
              <button key={t.label} onClick={()=>t.set(!t.val)} style={{
                flex:1,padding:"0.5rem",
                background:t.val?`${t.col}18`:"transparent",
                border:`1px solid ${t.val?t.col:"#1a3a4a"}`,
                borderRadius:"5px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",
              }}>
                <div style={{color:t.val?t.col:"#4a6a80",fontSize:"0.68rem",fontWeight:700}}>{t.label}</div>
                <div style={{color:t.val?"#00ff9d":"#2a4a60",fontSize:"0.6rem"}}>{t.sub}</div>
              </button>
            ))}
          </div>

          {/* Forecast result */}
          <div style={{background:"#060d14",border:"1px solid #ffd70033",borderRadius:"6px",padding:"1rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.4rem 1rem"}}>
              {[
                ["Runs",        forecastRuns],
                ["Per run",     fmtMoneyFull(estCost.total)],
                ["Input cost",  fmtMoneyFull(estCost.inputCost)],
                ["Output cost", fmtMoneyFull(estCost.outputCost)],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:"0.7rem",padding:"0.2rem 0",borderBottom:"1px solid #0d2137"}}>
                  <span style={{color:"#4a6a80"}}>{k}</span>
                  <span style={{color:"#c9d8e8"}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:"0.8rem",display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
              <span style={{color:"#4a6a80",fontSize:"0.7rem"}}>{forecastDays}-day total</span>
              <span style={{color:"#ffd700",fontSize:"1.4rem",fontWeight:700}}>{fmtMoney(forecastTotal)}</span>
            </div>
            {batchDiscount||cacheRatio>0?<div style={{marginTop:"0.4rem",color:"#00ff9d",fontSize:"0.62rem"}}>↓ savings active: {batchDiscount&&cacheRatio>0?"Batch + Cache":"Batch API" in (batchDiscount?"Batch API":"") || "Prompt Caching"}</div>:null}
          </div>
        </CARD>

        {/* ── Model comparison ── */}
        <CARD title={`MODEL COMPARISON (${forecastDays}d FORECAST)`} accent="#e879f9">
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {modelComparison.map(m=>{
              const pct = m.forecast / Math.max(...modelComparison.map(x=>x.forecast)) * 100;
              const isSelected = m.id===selectedModelId;
              return (
                <div key={m.id} onClick={()=>setSelectedModelId(m.id)} style={{cursor:"pointer",padding:"0.6rem 0.8rem",background:isSelected?`${m.color}12`:"transparent",border:`1px solid ${isSelected?m.color:"#1a3a4a"}`,borderRadius:"6px",transition:"all 0.15s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.4rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                      <span style={{color:m.color,fontSize:"0.75rem",fontWeight:700}}>{m.name}</span>
                      <span style={{padding:"0.1rem 0.4rem",background:`${m.color}22`,color:m.color,borderRadius:"3px",fontSize:"0.55rem",letterSpacing:"0.1em"}}>{m.badge}</span>
                    </div>
                    <span style={{color:m.color,fontSize:"0.85rem",fontWeight:700}}>{fmtMoney(m.forecast)}</span>
                  </div>
                  <div style={{height:4,background:"#0d2137",borderRadius:"2px",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:m.color,borderRadius:"2px",transition:"width 0.4s ease"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:"0.3rem",fontSize:"0.6rem",color:"#2a4a60"}}>
                    <span>${m.inputPer1M}/${m.outputPer1M} per 1M</span>
                    <span>{fmtMoneyFull(m.perRun)}{"/run · "}{fmtMoney(m.monthly)}{"/mo"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CARD>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem",marginBottom:"1.5rem"}}>

        {/* ── Token breakdown ── */}
        <CARD title="TOKEN BREAKDOWN" accent="#ff9800">
          <div style={{marginBottom:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.4rem",fontSize:"0.7rem"}}>
              <span style={{color:"#ffd700"}}>Input  {inputPct}%</span>
              <span style={{color:"#ff9800"}}>Output  {outputPct}%</span>
            </div>
            <div style={{height:8,background:"#0d2137",borderRadius:"4px",overflow:"hidden",display:"flex"}}>
              <div style={{width:`${inputPct}%`,background:"linear-gradient(90deg,#ffd700,#ff9800)",transition:"width 0.3s"}}/>
              <div style={{flex:1,background:"#ff6b35"}}/>
            </div>
          </div>
          <ROW label="Total input tokens"  val={fmtK(totalInput)}  col="#ffd700"/>
          <ROW label="Total output tokens" val={fmtK(totalOutput)} col="#ff9800"/>
          <ROW label="Avg input / report"  val={totalReports?fmtK(Math.round(totalInput/totalReports)):"–"} col="#ffd700"/>
          <ROW label="Avg output / report" val={totalReports?fmtK(Math.round(totalOutput/totalReports)):"–"} col="#ff9800"/>
          <ROW label="Est. input per run"  val={fmtK(estInputTokens)}  sub={`~${selectedFeeds.length} feeds × 1500 tok`} col="#4a6a80"/>
          <ROW label="Est. output per run" val={fmtK(estOutputTokens)} sub="= max tokens setting" col="#4a6a80"/>
        </CARD>

        {/* ── Budget tracker ── */}
        <CARD title="BUDGET TRACKER" accent="#ef5350">
          <div style={{marginBottom:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.3rem"}}>
              <span style={{color:"#4a6a80",fontSize:"0.65rem"}}>MONTHLY BUDGET ALERT</span>
              <span style={{color:"#ef5350",fontSize:"0.78rem",fontWeight:700}}>${budgetAlert}</span>
            </div>
            <input type="range" min={1} max={200} step={1} value={budgetAlert}
              onChange={e=>setBudgetAlert(+e.target.value)}
              style={{width:"100%",accentColor:"#ef5350"}}/>
          </div>

          {/* Budget burn bar */}
          <div style={{marginBottom:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.4rem",fontSize:"0.7rem"}}>
              <span style={{color:"#4a6a80"}}>Spent this session</span>
              <span style={{color: totalSpend/budgetAlert>0.8?"#ef5350":totalSpend/budgetAlert>0.5?"#ffd700":"#00ff9d"}}>{((totalSpend/budgetAlert)*100).toFixed(1)}%</span>
            </div>
            <div style={{height:10,background:"#0d2137",borderRadius:"5px",overflow:"hidden"}}>
              <div style={{
                height:"100%",
                width:`${Math.min((totalSpend/budgetAlert)*100,100)}%`,
                background: totalSpend/budgetAlert>0.8?"linear-gradient(90deg,#ffd700,#ef5350)":totalSpend/budgetAlert>0.5?"linear-gradient(90deg,#00ff9d,#ffd700)":"linear-gradient(90deg,#00ff9d,#4fc3f7)",
                transition:"width 0.4s ease",borderRadius:"5px",
              }}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:"0.3rem",fontSize:"0.62rem",color:"#2a4a60"}}>
              <span>{fmtMoney(totalSpend)} spent</span>
              <span>{fmtMoney(budgetAlert - totalSpend)} remaining</span>
            </div>
          </div>

          <ROW label="Budget"         val={`$${budgetAlert}`}               col="#ef5350"/>
          <ROW label="Spent (session)"val={fmtMoney(totalSpend)}            col={totalSpend/budgetAlert>0.8?"#ef5350":"#00ff9d"}/>
          <ROW label="Remaining"      val={fmtMoney(Math.max(budgetAlert-totalSpend,0))} col="#4fc3f7"/>
          <ROW label="30d projection" val={fmtMoney(estCost.total*runsPerDay*30)} sub="at current config" col={estCost.total*runsPerDay*30>budgetAlert?"#ef5350":"#00ff9d"}/>
          {daysUntilAlert!==null&&daysUntilAlert>0&&(
            <div style={{marginTop:"0.8rem",padding:"0.6rem",background:"#ffd70011",border:"1px solid #ffd70033",borderRadius:"5px",color:"#ffd700",fontSize:"0.68rem"}}>
              ⚠ At current run rate, you'll hit the ${budgetAlert} alert in ~{daysUntilAlert} day{daysUntilAlert!==1?"s":""}
            </div>
          )}
          {estCost.total*runsPerDay*30>budgetAlert&&(
            <div style={{marginTop:"0.5rem",padding:"0.6rem",background:"#ef535011",border:"1px solid #ef535033",borderRadius:"5px",color:"#ef5350",fontSize:"0.68rem"}}>
              🚨 30-day projection exceeds budget. Enable Batch API or switch to Haiku.
            </div>
          )}
        </CARD>
      </div>

      {/* ── Per-run ledger ── */}
      <CARD title={`RUN LEDGER (${costLedger.length} TOTAL)`} accent="#4a6a80">
        {!costLedger.length?
          <div style={{textAlign:"center",padding:"2rem",color:"#2a4a60",fontSize:"0.75rem"}}>No runs recorded yet. Generate a report to start tracking costs.</div>:
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.7rem"}}>
              <thead>
                <tr style={{borderBottom:"1px solid #1a3a4a"}}>
                  {["#","Timestamp","Sources","Model","Window","In Tok","Out Tok","Input $","Output $","Total $"].map(h=>(
                    <th key={h} style={{padding:"0.4rem 0.6rem",color:"#4a6a80",textAlign:"left",fontWeight:400,letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...costLedger].reverse().map((r,i)=>(
                  <tr key={r.id} style={{borderBottom:"1px solid #0d2137",background:i%2===0?"transparent":"#060d1455"}}>
                    <td style={{padding:"0.4rem 0.6rem",color:"#2a4a60"}}>{costLedger.length-i}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#c9d8e8",whiteSpace:"nowrap"}}>{r.timestamp}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#00ff9d"}}>{r.sources}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:(MODELS.find(m=>m.id===r.modelId)||{color:"#c9d8e8"}).color}}>{r.modelName}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#4fc3f7",whiteSpace:"nowrap",fontSize:"0.65rem"}}>{fmtDate(r.dateFrom)}{"→"}{fmtDate(r.dateTo)}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#ffd700"}}>{fmtK(r.inputTokens)}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#ff9800"}}>{fmtK(r.outputTokens)}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#ffd700",fontVariantNumeric:"tabular-nums"}}>{fmtMoneyFull(r.inputCost)}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#ff9800",fontVariantNumeric:"tabular-nums"}}>{fmtMoneyFull(r.outputCost)}</td>
                    <td style={{padding:"0.4rem 0.6rem",color:"#00ff9d",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmtMoneyFull(r.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{borderTop:"2px solid #1a3a4a"}}>
                  <td colSpan={5} style={{padding:"0.5rem 0.6rem",color:"#4a6a80",fontSize:"0.68rem"}}>TOTALS</td>
                  <td style={{padding:"0.5rem 0.6rem",color:"#ffd700",fontWeight:700}}>{fmtK(totalInput)}</td>
                  <td style={{padding:"0.5rem 0.6rem",color:"#ff9800",fontWeight:700}}>{fmtK(totalOutput)}</td>
                  <td style={{padding:"0.5rem 0.6rem",color:"#ffd700",fontWeight:700}}>{fmtMoney(costLedger.reduce((s,r)=>s+r.inputCost,0))}</td>
                  <td style={{padding:"0.5rem 0.6rem",color:"#ff9800",fontWeight:700}}>{fmtMoney(costLedger.reduce((s,r)=>s+r.outputCost,0))}</td>
                  <td style={{padding:"0.5rem 0.6rem",color:"#00ff9d",fontWeight:700}}>{fmtMoney(totalSpend)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        }
      </CARD>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedIds, setSelectedIds]   = useState(["cisa","nvd","talos","dfirreport","krebsonsec","crowdstrike","sans_isc","googletag","specterops","teamcymru"]);
  const [customFeeds, setCustomFeeds]   = useState([]);
  const [showAddFeed, setShowAddFeed]   = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("haiku45");

  const [datePreset, setDatePreset]     = useState(0);
  const today = toDateStr(new Date());
  const [customFrom, setCustomFrom]     = useState(subtractDays(7));
  const [customTo, setCustomTo]         = useState(today);

  const [query, setQuery]     = useState("General daily briefing — focus on ransomware, nation-state APTs, and critical infrastructure threats");
  const [report, setReport]   = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("sources");
  const [schedule, setSchedule]   = useState("daily");
  const [history, setHistory]     = useState([]);
  const [costLedger, setCostLedger] = useState([]);
  const [error, setError]         = useState("");
  const [feedSearch, setFeedSearch] = useState("");
  const [apiKey, setApiKey]         = useState(""); // kept in memory only — clears on any page reload
  const [showKey, setShowKey]       = useState(false);
  const [dbLoaded, setDbLoaded]     = useState(false);
  const [dbError, setDbError]       = useState("");
  const [disabledIds, setDisabledIds] = useState([]);
  const [deletedIds,  setDeletedIds]  = useState([]);
  const [feedOverrides, setFeedOverrides] = useState({}); // { [builtinFeedId]: {name,url,xmlUrl} }
  const [editingFeed, setEditingFeed] = useState(null);    // {id,name,url} | null
  const [maxTokens, setMaxTokens]     = useState(2048);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [sourceMap, setSourceMap] = useState({}); // { "1": {name, url}, ... } for current report
  const [customTokens, setCustomTokens] = useState("");
  const reportRef = useRef(null);

  // ── Hunting hypotheses ──────────────────────────────────────────────────────
  const [huntSelected, setHuntSelected] = useState([]);   // report ids picked for consolidation
  const [hypCounts, setHypCounts]       = useState({});   // { reportId: extractedCount }
  const [huntBusy, setHuntBusy]         = useState(null); // report id currently being extracted
  const [huntError, setHuntError]       = useState("");
  const [huntAuthMode, setHuntAuthMode] = useState("apikey"); // "apikey" | "subscription"
  const [huntGenerating, setHuntGenerating] = useState(false);     // batch extract+generate in progress
  const [huntForceReextract, setHuntForceReextract] = useState(false); // re-run extraction even if already done
  const [huntTheme, setHuntTheme] = useState("light"); // "light" | "dark" — consolidated HTML palette

  // ── History bulk export ─────────────────────────────────────────────────────
  const [historySelected, setHistorySelected] = useState([]);       // report ids picked for export
  const [historyExportFmt, setHistoryExportFmt] = useState("md");   // "md" | "html" | "pdf" | "docx"

  // ── Startup: load everything from DB ──────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // First check the server is reachable
      try {
        await fetch("http://localhost:3001/health");
      } catch (e) {
        setDbError("Cannot reach server at localhost:3001 — make sure \`node server.js\` is running.");
        setDbLoaded(true);
        return;
      }

      try {
        const cfg = await fetch("http://localhost:3001/api/config").then(r=>r.json()).catch(()=>({}));
        if (cfg.selectedIds)                setSelectedIds(cfg.selectedIds);
        if (cfg.selectedModelId)            setSelectedModelId(cfg.selectedModelId);
        if (cfg.query)                      setQuery(cfg.query);
        if (cfg.schedule)                   setSchedule(cfg.schedule);
        if (cfg.maxTokens)                  setMaxTokens(cfg.maxTokens);
        if (cfg.datePreset !== undefined)   setDatePreset(cfg.datePreset);
        if (cfg.customFrom)                 setCustomFrom(cfg.customFrom);
        if (cfg.customTo)                   setCustomTo(cfg.customTo);
        if (cfg.deletedIds)                 setDeletedIds(cfg.deletedIds);
        if (cfg.disabledIds)                setDisabledIds(cfg.disabledIds);
        if (cfg.feedOverrides)               setFeedOverrides(cfg.feedOverrides);
      } catch(e) { console.warn("Config load failed:", e.message); }

      try {
        const feeds = await fetch("http://localhost:3001/api/feeds/custom").then(r=>r.json()).catch(()=>[]);
        if (Array.isArray(feeds)) setCustomFeeds(feeds);
      } catch(e) { console.warn("Feeds load failed:", e.message); }

      try {
        const reports = await fetch("http://localhost:3001/api/reports").then(r=>r.json()).catch(()=>[]);
        if (Array.isArray(reports)) {
          setHistory(reports.map(r=>({
            id: r.id, timestamp: r.timestamp, query: r.query,
            dateFrom: r.date_from, dateTo: r.date_to,
            sources: r.sources, modelId: r.model_id, modelName: r.model_name,
            inputTokens: r.input_tokens, outputTokens: r.output_tokens,
            inputCost: r.input_cost, outputCost: r.output_cost, totalCost: r.total_cost,
            estInputTokens: r.est_input_tok, estOutputTokens: r.est_output_tok, estTotalCost: r.est_total_cost,
            report: null,
          })));
        }
      } catch(e) { console.warn("Reports load failed:", e.message); }

      try {
        const costs = await fetch("http://localhost:3001/api/costs").then(r=>r.json()).catch(()=>[]);
        if (Array.isArray(costs)) {
          setCostLedger(costs.map(r=>({
            id: r.id, timestamp: r.timestamp,
            sources: r.sources, modelId: r.model_id, modelName: r.model_name,
            inputTokens: r.input_tokens, outputTokens: r.output_tokens,
            inputCost: r.input_cost, outputCost: r.output_cost, totalCost: r.total_cost,
            estInputTokens: r.est_input_tok, estOutputTokens: r.est_output_tok, estTotalCost: r.est_total_cost,
          })));
        }
      } catch(e) { console.warn("Costs load failed:", e.message); }

      try {
        const counts = await fetch("http://localhost:3001/api/hypotheses/counts").then(r=>r.json()).catch(()=>({}));
        if (counts && typeof counts === "object") setHypCounts(counts);
      } catch(e) { console.warn("Hypothesis counts load failed:", e.message); }

      setDbLoaded(true);
    };
    load();
  }, []); // eslint-disable-line

  // ── Persist config — only after initial DB load, debounced 600ms ───────────
  // dbLoaded gates the effect so default state never overwrites saved config.
  useEffect(() => {
    if (!dbLoaded) return;                              // wait for load to finish
    const t = setTimeout(() => {
      fetch("http://localhost:3001/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIds, selectedModelId, query, schedule, maxTokens, datePreset, customFrom, customTo, disabledIds, deletedIds, feedOverrides })
      }).catch(e => console.warn("Config save failed:", e.message));
    }, 600);
    return () => clearTimeout(t);
  }, [dbLoaded, selectedIds, selectedModelId, query, schedule, maxTokens, datePreset, customFrom, customTo, disabledIds, deletedIds, feedOverrides]); // eslint-disable-line

  // Derived
  const allFeeds      = [...BUILTIN_FEEDS, ...customFeeds]
    .filter(f => !deletedIds.includes(f.id))
    .map(f => feedOverrides[f.id] ? { ...f, ...feedOverrides[f.id] } : f);
  const isCustom      = DATE_PRESETS[datePreset].days === null;
  const dateFrom      = isCustom ? customFrom : subtractDays(DATE_PRESETS[datePreset].days);
  const dateTo        = isCustom ? customTo : today;
  const windowLabel   = `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`;
  const selectedFeeds = allFeeds.filter(f=>selectedIds.includes(f.id));
  const categories    = [...new Set(allFeeds.map(s=>s.category))];
  const currentModel  = MODELS.find(m=>m.id===selectedModelId);

  const toggleSource     = id => setSelectedIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const addCustomFeed    = f  => {
    const feedToSave = { ...f, xmlUrl: f.xmlUrl || f.url || "" };
    setCustomFeeds(p=>[...p, feedToSave]);
    setSelectedIds(p=>[...p, feedToSave.id]);
    fetch("http://localhost:3001/api/feeds/custom", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(feedToSave) })
      .catch(e => console.warn("Feed save failed:", e.message));
  };
  const removeCustomFeed = id => {
    setCustomFeeds(p=>p.filter(f=>f.id!==id));
    setSelectedIds(p=>p.filter(x=>x!==id));
    fetch("http://localhost:3001/api/feeds/custom/"+id, { method:"DELETE" });
  };

  const deleteFeed = id => {
    const isCustom = customFeeds.some(f=>f.id===id);
    // Remove from custom_feeds table if it was a custom feed
    if (isCustom) {
      setCustomFeeds(p=>p.filter(f=>f.id!==id));
      fetch("http://localhost:3001/api/feeds/custom/"+id, { method:"DELETE" })
        .catch(e=>console.warn("Feed delete failed:", e.message));
    }
    // Track deletion for builtin feeds (persisted via config)
    setDeletedIds(p=>[...p, id]);
    setSelectedIds(p=>p.filter(x=>x!==id));
    setDisabledIds(p=>p.filter(x=>x!==id));
  };

  // Custom feeds are edited in place on their DB row; built-in feeds get a
  // per-id override merged onto BUILTIN_FEEDS (persisted via /api/config,
  // same mechanism as disabledIds/deletedIds — no schema change needed).
  const saveFeedEdit = ({ id, name, url }) => {
    if (customFeeds.some(f=>f.id===id)) {
      setCustomFeeds(p=>p.map(f=>f.id===id ? { ...f, name, url, xmlUrl:url } : f));
      fetch("http://localhost:3001/api/feeds/custom/"+id, {
        method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, url }),
      }).catch(e=>console.warn("Feed update failed:", e.message));
    } else {
      setFeedOverrides(p=>({ ...p, [id]: { name, url, xmlUrl:url } }));
    }
  };
  const resetFeedOverride = id => setFeedOverrides(p=>{ const n={...p}; delete n[id]; return n; });

  const saveApiKey = (val) => {
    setApiKey(val); // state only — never written to storage
  };

  const generateReport = async () => {
    if (!apiKey.trim()) { setError("API key required — add it in the CONFIG tab."); setActiveTab("sources"); return; }
    if (!selectedFeeds.length) { setError("Select at least one source."); return; }
    setError(""); setReport(""); setActiveTab("report");

    // ── Step 1: Fetch real articles from feeds ───────────────────────────────
    setLoading("fetching");
    let articles = [];
    let feedErrors = [];
    try {
      const fr = await fetch("http://localhost:3001/api/fetch-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeds: selectedFeeds, dateFrom, dateTo }),
      });
      const fd = await fr.json();
      articles   = fd.articles  || [];
      feedErrors = fd.errors    || [];
    } catch(e) {
      setError("Feed fetch error: " + e.message);
      setLoading(false);
      return;
    }

    if (articles.length === 0) {
      setError(`No articles found in the ${DATE_PRESETS[datePreset].label} window across ${selectedFeeds.length} feeds. Try a wider date range or check that feeds are reachable.`);
      setLoading(false);
      return;
    }

    // ── Step 2: Build prompt from real articles ──────────────────────────────
    setLoading("analyzing");
    const prompt = buildPrompt({ articles, feedErrors, query, dateFrom, dateTo });
    const currentSourceMap = buildSourceMap(articles);
    setSourceMap(currentSourceMap);

    const estInputTokens  = Math.round(prompt.length / 4);
    const estOutputTokens = maxTokens;

    let runRecord = null;

    try {
      const res = await fetch("http://localhost:3001/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey.trim() },
        body: JSON.stringify({ model: currentModel.apiId, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(errText);
      }
      const data = await res.json();
      // Rebuild References section authoritatively from sourceMap
      const text = rebuildReferences(
        (data.content||[]).map(b=>b.text||"").join("") || "No response received.",
        currentSourceMap
      );

      const actualInput  = (data.usage||{}).input_tokens  || estInputTokens;
      const actualOutput = (data.usage||{}).output_tokens || Math.round(text.length / 4);
      const costs = calcCost(actualInput, actualOutput, selectedModelId);

      setReport(text);

      const preEstInputTokens  = Math.round(prompt.length / 4);
      const preEstOutputTokens = maxTokens;
      const preEstCosts        = calcCost(preEstInputTokens, preEstOutputTokens, selectedModelId);
      const clientId = Date.now();

      runRecord = {
        id:              clientId,
        clientId:        clientId,
        timestamp:       new Date().toLocaleString(),
        sources:         selectedFeeds.length,
        articlesIngested: articles.length,
        modelId:         selectedModelId,
        modelName:       currentModel.name,
        query:           query.slice(0, 120),
        dateFrom,        dateTo,
        inputTokens:     actualInput,
        outputTokens:    actualOutput,
        inputCost:       costs.inputCost,
        outputCost:      costs.outputCost,
        totalCost:       costs.total,
        estInputTokens:  preEstInputTokens,
        estOutputTokens: preEstOutputTokens,
        estTotalCost:    preEstCosts.total,
        report:          text,
        saving:          true,
        sourceMap:       currentSourceMap,
      };

      setHistory(p => [runRecord, ...p]);
      setCostLedger(p => [...p, runRecord]);

    } catch(e) { setError("Claude API error: "+e.message); setLoading(false); return; }

    // ── Persist to DB ────────────────────────────────────────────────────────
    try {
      const res2 = await fetch("http://localhost:3001/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runRecord),
      });
      const saved = await res2.json();
      if (!res2.ok || !saved.id) {
        throw new Error(saved.error || "No id returned from server");
      }
      // Swap temp clientId → real DB integer id, clear saving flag
      const cid = runRecord.clientId;
      setHistory(p => p.map(r => r.clientId===cid ? {...r, id: saved.id, saving: false} : r));
      setCostLedger(p => p.map(r => r.clientId===cid ? {...r, id: saved.id, saving: false} : r));
    } catch(e) {
      const cid = runRecord.clientId;
      setError("Report generated but DB save failed: " + e.message);
      // Mark as save-failed so user knows
      setHistory(p => p.map(r => r.clientId===cid ? {...r, saving: false, saveFailed: true} : r));
    }
    setLoading(false);
  };

  // Fetch a saved report's full body + sourceMap, ask Claude to derive hunting
  // hypotheses from it, resolve citations against that report's own sourceMap,
  // and persist the result. Returns {ok:true} or {ok:false, error} — the
  // caller (generateConsolidated) owns user-facing error messaging so a batch
  // run can report one consolidated summary instead of overwriting itself
  // per item. huntAuthMode picks how the Claude call is made: a pasted API
  // key (metered, billed per token) or the local Claude Code CLI (subscription
  // auth, no key).
  const extractHypotheses = async (reportId) => {
    setHuntBusy(reportId);
    try {
      const full = await fetch(`http://localhost:3001/api/reports/${reportId}`).then(r=>r.json());
      if (full.error) throw new Error(full.error);
      let smap = {};
      try { smap = full.source_map ? JSON.parse(full.source_map) : {}; } catch(e) { /* empty */ }
      const body = rebuildReferences(full.body || "", smap);
      const prompt = buildHypothesisPrompt(body);

      let text;
      if (huntAuthMode === "subscription") {
        const res = await fetch("http://localhost:3001/api/analyze-cli", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        text = (data.content || []).map(b => b.text || "").join("");
      } else {
        const res = await fetch("http://localhost:3001/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey.trim() },
          body: JSON.stringify({
            model: currentModel.apiId,
            max_tokens: Math.max(maxTokens, 2048),
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const data = await res.json();
        text = (data.content || []).map(b => b.text || "").join("");
      }

      const rawHyps = parseHypothesisResponse(text);
      const hypotheses = rawHyps.map(h => resolveHypothesisRefs(h, smap));

      const save = await fetch(`http://localhost:3001/api/reports/${reportId}/hypotheses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hypotheses }),
      }).then(r => r.json());
      if (save.error) throw new Error(save.error);

      setHypCounts(p => ({ ...p, [reportId]: save.count }));
      return { ok: true };
    } catch(e) {
      return { ok: false, error: e.message };
    } finally {
      setHuntBusy(null);
    }
  };

  const toggleHuntSelected = (id) => setHuntSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  // Single entry point for the Hunt tab: extracts hypotheses for any selected
  // report that doesn't already have them (skips ones that do, unless the
  // user opted into a forced re-extract), then opens the consolidated HTML
  // for whichever selected reports ended up with hypotheses.
  const generateConsolidated = async () => {
    if (!huntSelected.length) return;
    const needsExtraction = huntSelected.some(id => huntForceReextract || (hypCounts[id]||0) === 0);
    if (needsExtraction && huntAuthMode === "apikey" && !apiKey.trim()) {
      setHuntError("API key required to extract the selected reports that don't have hypotheses yet — add it in the CONFIG tab, or switch to Claude Subscription mode.");
      return;
    }
    setHuntError("");
    setHuntGenerating(true);
    const failures = [];
    for (const id of huntSelected) {
      if ((hypCounts[id]||0) > 0 && !huntForceReextract) continue;
      const result = await extractHypotheses(id);
      if (!result.ok) failures.push({ id, error: result.error });
    }
    setHuntGenerating(false);

    const readyIds = huntSelected.filter(id => !failures.some(f => f.id === id));
    if (failures.length) {
      setHuntError(`${failures.length} report${failures.length===1?"":"s"} failed to extract (${failures.map(f=>"#"+f.id).join(", ")}) — ${readyIds.length ? `continuing with the remaining ${readyIds.length}.` : "nothing left to generate."}`);
    }
    if (!readyIds.length) return;

    // A plain <a> click is a real navigation (same-tab, since this always
    // downloads rather than opening a page to view), not a JS popup, so it
    // isn't subject to popup-blocker heuristics the way window.open() can be
    // — same pattern already used by the History tab's bulk export.
    const a = document.createElement("a");
    a.href = `http://localhost:3001/api/hypotheses/consolidated?reportIds=${readyIds.join(",")}&theme=${huntTheme}`;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const toggleHistorySelected = (id) => setHistorySelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  // Triggers one download per selected report in the chosen format. Downloads
  // are staggered (not fired all in the same tick) so browsers don't treat
  // them as a popup/download flood and block the later ones.
  const exportSelectedHistory = () => {
    historySelected.forEach((id, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = `http://localhost:3001/api/reports/${id}/export?format=${historyExportFmt}`;
        a.rel = "noreferrer";
        if (historyExportFmt === "pdf") a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 250);
    });
  };

  // Parse inline text: bold **x**, inline-code `x`, and citations [N]
  const renderInline = (text, smap) => {
    // Split on **bold**, `code`, and [N] citation tokens
    const parts = text.split(/(\*\*.*?\*\*|`[^`]+`|\[\d+\])/g);
    return parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={j} style={{color:"#e2eaf4"}}>{part.slice(2,-2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={j} style={{background:"#0d2137",color:"#00ff9d",padding:"0.1em 0.4em",borderRadius:"3px",fontSize:"0.88em",fontFamily:"inherit"}}>{part.slice(1,-1)}</code>;
      // Citation token [N]
      const citMatch = part.match(/^\[(\d+)\]$/);
      if (citMatch) {
        const n = citMatch[1];
        const src = (smap||{})[n];
        if (src) return (
          <a key={j} href={src.url} target="_blank" rel="noreferrer"
            title={src.name}
            style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
              background:"#4fc3f711",border:"1px solid #4fc3f744",color:"#4fc3f7",
              borderRadius:"3px",padding:"0 0.3em",fontSize:"0.7em",fontWeight:700,
              lineHeight:"1.5",marginLeft:"1px",textDecoration:"none",
              verticalAlign:"middle",cursor:"pointer",transition:"all 0.1s"}}
            onMouseEnter={function(e){e.currentTarget.style.background="#4fc3f733";e.currentTarget.style.borderColor="#4fc3f7";}}
            onMouseLeave={function(e){e.currentTarget.style.background="#4fc3f711";e.currentTarget.style.borderColor="#4fc3f744";}}>
            {n}
          </a>
        );
        // Unknown ref — render as plain dimmed text
        return <span key={j} style={{color:"#4a6a80",fontSize:"0.72em"}}>{part}</span>;
      }
      return part;
    });
  };

  const renderMarkdown = (text, smap) => {
    if (!text) return null;
    const lines = text.split("\n");
    const nodes = [];
    let i = 0;

    const isTableRow = l => l.trimStart().startsWith("|") && l.trimEnd().endsWith("|");
    const isSepRow   = l => /^\|[\s|:-]+\|$/.test(l.trim());

    while (i < lines.length) {
      const line = lines[i];

      // ── Table block ────────────────────────────────────────────────────────
      if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
        const headerCells = line.split("|").slice(1,-1).map(c=>c.trim());
        i += 2; // skip header + separator
        const bodyRows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          bodyRows.push(lines[i].split("|").slice(1,-1).map(c=>c.trim()));
          i++;
        }
        nodes.push(
          <div key={`t${i}`} style={{overflowX:"auto",marginTop:"0.8rem",marginBottom:"0.8rem"}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:"0.75rem",fontFamily:"inherit"}}>
              <thead>
                <tr>
                  {headerCells.map((h,ci)=>(
                    <th key={ci} style={{background:"#0a1929",color:"#4fc3f7",padding:"0.4rem 0.8rem",textAlign:"left",border:"1px solid #1a3a4a",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>
                      {renderInline(h, smap)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row,ri)=>(
                  <tr key={ri} style={{background:ri%2===0?"#060d14":"#0a1929"}}>
                    {row.map((cell,ci)=>{
                      const col = cell.includes("CRITICAL")?"#ef5350":cell.includes("HIGH")?"#ff9800":cell.includes("MEDIUM")?"#ffd700":"#b0bec5";
                      return <td key={ci} style={{padding:"0.35rem 0.8rem",border:"1px solid #1a3a4a",color:col,verticalAlign:"top"}}>{renderInline(cell,smap)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // ── Standard block elements ────────────────────────────────────────────
      if (line.startsWith("# "))
        nodes.push(<h1 key={i} style={{color:"#00ff9d",fontSize:"1.3rem",marginTop:"1.5rem"}}>{renderInline(line.slice(2),smap)}</h1>);
      else if (line.startsWith("## "))
        nodes.push(<h2 key={i} style={{color:"#4fc3f7",fontSize:"1rem",marginTop:"1.2rem",borderBottom:"1px solid #1a3a4a",paddingBottom:"4px"}}>{renderInline(line.slice(3),smap)}</h2>);
      else if (line.startsWith("### "))
        nodes.push(<h3 key={i} style={{color:"#ffd700",fontSize:"0.9rem",marginTop:"1rem"}}>{renderInline(line.slice(4),smap)}</h3>);
      else if (line.startsWith("- ")||line.startsWith("* ")) {
        const txt=line.slice(2);
        const col=txt.includes("CRITICAL")?"#ef5350":txt.includes("HIGH")?"#ff9800":txt.includes("MEDIUM")?"#ffd700":"#b0bec5";
        nodes.push(<li key={i} style={{color:col,margin:"0.3rem 0 0.3rem 1.2rem",lineHeight:1.6}}>{renderInline(txt,smap)}</li>);
      }
      else if (line.startsWith("> "))
        nodes.push(<blockquote key={i} style={{borderLeft:"3px solid #00ff9d",paddingLeft:"1rem",color:"#80cbc4",fontStyle:"italic",margin:"0.5rem 0"}}>{renderInline(line.slice(2),smap)}</blockquote>);
      else if (!line.trim())
        nodes.push(<br key={i}/>);
      else
        nodes.push(<p key={i} style={{color:"#b0bec5",margin:"0.3rem 0",lineHeight:1.7}}>{renderInline(line,smap)}</p>);

      i++;
    }
    return nodes;
  };

  const TABS = [
    {id:"sources", label:"⚙ CONFIG"},
    {id:"report",  label:"📋 REPORT"},
    {id:"cost",    label:"💰 COST & FORECAST"},
    {id:"history", label:"🗄 HISTORY"},
    {id:"hunt",    label:"🎯 HUNT"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#060d14",color:"#c9d8e8",fontFamily:"IBM Plex Mono, Courier New, monospace"}}>
      {showAddFeed && <FeedForm onSave={addCustomFeed} onClose={()=>setShowAddFeed(false)}/>}
      {editingFeed && <FeedForm initial={editingFeed} onSave={saveFeedEdit} onClose={()=>setEditingFeed(null)}/>}

      {/* ── Header ── */}
      <div style={{background:"linear-gradient(135deg,#0a1929 0%,#0d2137 50%,#091520 100%)",borderBottom:"1px solid #00ff9d33",padding:"1.2rem 2rem",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:"0 0 40px #00ff9d11"}}>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          <div style={{width:38,height:38,borderRadius:"8px",background:"linear-gradient(135deg,#00ff9d22,#4fc3f722)",border:"1px solid #00ff9d44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem"}}>⚡</div>
          <div>
            <div style={{color:"#00ff9d",fontSize:"1rem",fontWeight:"bold",letterSpacing:"0.1em"}}>THREAT INTEL AGENT</div>
            <div style={{color:"#4a6a80",fontSize:"0.6rem",letterSpacing:"0.2em"}}>AI-POWERED BRIEFING · COST TRACKING · FORECASTING</div>
          </div>
        </div>
        <div style={{display:"flex",gap:"1.5rem",fontSize:"0.7rem"}}>
          {[
            {label:"SOURCES", val:selectedFeeds.length,  col:"#00ff9d"},
            {label:"WINDOW",  val:DATE_PRESETS[datePreset].label, col:"#4fc3f7"},
            {label:"MODEL",   val:currentModel.name,      col:currentModel.color},
            {label:"SPENT",   val:fmtMoney(costLedger.reduce((s,r)=>s+r.totalCost,0)), col:"#ffd700"},
            {label:"REPORTS", val:costLedger.length,      col:"#e879f9"},
          ].map(x=>(
            <div key={x.label} style={{textAlign:"center"}}>
              <div style={{color:x.col,fontSize:"0.8rem",fontWeight:"bold"}}>{x.val}</div>
              <div style={{color:"#4a6a80",fontSize:"0.55rem",letterSpacing:"0.1em"}}>{x.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:"flex",borderBottom:"1px solid #0d2137",background:"#040b12",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:"0.75rem 1.3rem",background:activeTab===t.id?"#0a1929":"transparent",
            color:activeTab===t.id?(t.id==="cost"?"#ffd700":"#00ff9d"):"#4a6a80",
            border:"none",borderBottom:activeTab===t.id?`2px solid ${t.id==="cost"?"#ffd700":"#00ff9d"}`:"2px solid transparent",
            cursor:"pointer",fontSize:"0.72rem",letterSpacing:"0.08em",fontFamily:"inherit",whiteSpace:"nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:"1.5rem 2rem",maxWidth:"1300px",margin:"0 auto"}}>

        {/* DB status banner */}
        {dbError && (
          <div style={{marginBottom:"1rem",padding:"0.7rem 1rem",background:"#ef535018",border:"1px solid #ef535055",borderRadius:"6px",color:"#ef5350",fontSize:"0.72rem"}}>
            {"⚠"} {dbError}
          </div>
        )}
        {!dbLoaded && !dbError && (
          <div style={{marginBottom:"1rem",padding:"0.7rem 1rem",background:"#4fc3f710",border:"1px solid #4fc3f733",borderRadius:"6px",color:"#4fc3f7",fontSize:"0.72rem"}}>
            ⟳ Loading saved config from database…
          </div>
        )}

        {/* ── CONFIG ── */}
        {activeTab==="sources" && (
          <div>
          {/* Export / Import bar */}
          <div style={{display:"flex",gap:"0.6rem",marginBottom:"1.2rem",alignItems:"center"}}>
            <span style={{color:"#4a6a80",fontSize:"0.62rem",letterSpacing:"0.1em",flex:1}}>◈ CONFIG SNAPSHOT</span>
            <a href="http://localhost:3001/api/config/export"
               style={{padding:"0.35rem 0.8rem",background:"#4fc3f711",border:"1px solid #4fc3f744",color:"#4fc3f7",borderRadius:"4px",fontSize:"0.65rem",textDecoration:"none",fontFamily:"monospace",cursor:"pointer"}}>
              {"↓ Export config.json"}
            </a>
            <label style={{padding:"0.35rem 0.8rem",background:"#e879f911",border:"1px solid #e879f944",color:"#e879f9",borderRadius:"4px",fontSize:"0.65rem",fontFamily:"monospace",cursor:"pointer"}}>
              {"↑ Import config.json"}
              <input type="file" accept=".json" style={{display:"none"}} onChange={function(e){
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(ev){
                  try {
                    const snap = JSON.parse(ev.target.result);
                    const cfg = snap.config || snap;
                    const feeds = snap.customFeeds || [];
                    fetch("http://localhost:3001/api/config/import", {
                      method: "POST",
                      headers: {"Content-Type":"application/json"},
                      body: JSON.stringify({ config: cfg, customFeeds: feeds })
                    }).then(function(){
                      if (cfg.selectedIds)   setSelectedIds(cfg.selectedIds);
                      if (cfg.selectedModelId) setSelectedModelId(cfg.selectedModelId);
                      if (cfg.query)         setQuery(cfg.query);
                      if (cfg.schedule)      setSchedule(cfg.schedule);
                      if (cfg.maxTokens)     setMaxTokens(cfg.maxTokens);
                      if (cfg.datePreset !== undefined) setDatePreset(cfg.datePreset);
                      if (cfg.customFrom)    setCustomFrom(cfg.customFrom);
                      if (cfg.customTo)      setCustomTo(cfg.customTo);
                      if (feeds.length)      setCustomFeeds(feeds);
                      alert("Config imported successfully.");
                    }).catch(function(err){ alert("Import failed: "+err.message); });
                  } catch(err){ alert("Invalid JSON file: "+err.message); }
                };
                reader.readAsText(file);
                e.target.value = "";
              }}/>
            </label>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
            <div>
              {/* Date window */}
              <div style={{background:"#0a1929",border:"1px solid #1a3a4a",borderRadius:"8px",padding:"1.2rem",marginBottom:"1.5rem"}}>
                <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"1rem",display:"flex",justifyContent:"space-between"}}>
                  <span>🗓 DATA WINDOW</span>
                  <span style={{color:"#00ff9d",fontWeight:700}}>{windowLabel}</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem",marginBottom:"1rem"}}>
                  {DATE_PRESETS.map((p,i)=>(
                    <button key={p.label} onClick={()=>setDatePreset(i)} style={{padding:"0.35rem 0.7rem",background:datePreset===i?"#4fc3f722":"#060d14",border:`1px solid ${datePreset===i?"#4fc3f7":"#1a3a4a"}`,color:datePreset===i?"#4fc3f7":"#4a6a80",borderRadius:"4px",cursor:"pointer",fontSize:"0.68rem",fontFamily:"inherit"}}>{p.label}</button>
                  ))}
                </div>
                {isCustom && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.8rem"}}>
                    {[{l:"FROM",v:customFrom,s:setCustomFrom,max:customTo},{l:"TO",v:customTo,s:setCustomTo,min:customFrom,max:today}].map(f=>(
                      <div key={f.l}>
                        <div style={{color:"#4a6a80",fontSize:"0.6rem",letterSpacing:"0.15em",marginBottom:"0.3rem"}}>{f.l}</div>
                        <input type="date" value={f.v} min={f.min} max={f.max} onChange={e=>f.s(e.target.value)} style={{width:"100%",boxSizing:"border-box",background:"#060d14",border:"1px solid #1a3a4a",color:"#c9d8e8",padding:"0.5rem",borderRadius:"5px",fontFamily:"inherit",fontSize:"0.72rem",outline:"none",colorScheme:"dark"}}/>
                      </div>
                    ))}
                  </div>
                )}
                {DATE_PRESETS[datePreset].days>14&&<div style={{marginTop:"0.8rem",padding:"0.5rem 0.8rem",background:"#ffd70011",border:"1px solid #ffd70033",borderRadius:"4px",color:"#ffd700",fontSize:"0.63rem"}}>⚠ Wide window — increases cost & may dilute signal.</div>}
              </div>

              {/* API Key */}
              <div style={{marginBottom:"1.6rem"}}>
                <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"0.8rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>◈ API KEY</span>
                  <span style={{fontSize:"0.65rem", color: apiKey.trim() ? "#00ff9d" : "#ef5350", letterSpacing:"0.08em"}}>
                    {apiKey.trim() ? "🟢 KEY LOADED" : "🔴 NO KEY"}
                  </span>
                </div>
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={e=>saveApiKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    autoComplete="off"
                    spellCheck={false}
                    style={{flex:1,background:"#0a1929",border:`1px solid ${apiKey.trim()?"#00ff9d44":"#1a3a4a"}`,color:"#c9d8e8",padding:"0.5rem 0.8rem",fontSize:"0.75rem",borderRadius:"5px",outline:"none",letterSpacing:"normal",WebkitTextSecurity:showKey?"none":"disc",fontFamily:"Courier New, monospace"}}
                  />
                  <button onClick={()=>setShowKey(p=>!p)} title={showKey?"Hide":"Reveal"} style={{padding:"0.5rem 0.7rem",background:"#0a1929",border:"1px solid #1a3a4a",color:"#4a6a80",borderRadius:"5px",cursor:"pointer",fontSize:"0.75rem",fontFamily:"inherit"}}>
                    {showKey ? "🙈" : "👁"}
                  </button>
                  <button onClick={()=>saveApiKey("")} title="Clear key" style={{padding:"0.5rem 0.7rem",background:"#0a1929",border:"1px solid #1a3a4a",color:"#4a6a80",borderRadius:"5px",cursor:"pointer",fontSize:"0.75rem",fontFamily:"inherit"}}>✕</button>
                </div>
                <div style={{marginTop:"0.5rem",color:"#2a5a70",fontSize:"0.62rem",lineHeight:1.5}}>
                  Kept in memory only — cleared on every page reload. Never written to disk or any storage.
                </div>
              </div>

              {/* Sources list */}
              <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"0.8rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>◈ SOURCES</span>
                <span style={{color:"#4a6a80",fontSize:"0.65rem"}}>{selectedFeeds.length} selected / {allFeeds.length} total</span>
              </div>

              {/* Search + global controls */}
              <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem",alignItems:"center"}}>
                <input
                  value={feedSearch} onChange={e=>setFeedSearch(e.target.value)}
                  placeholder="filter feeds..."
                  style={{flex:1,background:"#0a1929",border:"1px solid #1a3a4a",color:"#c9d8e8",padding:"0.4rem 0.7rem",fontSize:"0.7rem",fontFamily:"inherit",borderRadius:"4px",outline:"none"}}
                />
                <button onClick={()=>setSelectedIds(allFeeds.map(f=>f.id))} style={{padding:"0.4rem 0.65rem",background:"#00ff9d11",border:"1px solid #00ff9d33",color:"#00ff9d",borderRadius:"4px",cursor:"pointer",fontSize:"0.62rem",fontFamily:"inherit",whiteSpace:"nowrap"}}>ALL</button>
                <button onClick={()=>setSelectedIds([])} style={{padding:"0.4rem 0.65rem",background:"#0a1929",border:"1px solid #1a3a4a",color:"#4a6a80",borderRadius:"4px",cursor:"pointer",fontSize:"0.62rem",fontFamily:"inherit",whiteSpace:"nowrap"}}>NONE</button>
              </div>

              {categories.map(cat=>{
                const inCat = allFeeds.filter(f=>f.category===cat && (feedSearch===""||f.name.toLowerCase().includes(feedSearch.toLowerCase())));
                if(!inCat.length) return null;
                const catIds = inCat.map(f=>f.id);
                const allCatSelected = catIds.every(id=>selectedIds.includes(id));
                return (
                  <div key={cat} style={{marginBottom:"1.2rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.4rem"}}>
                      <div style={{color:CATEGORY_COLORS[cat]||"#ccc",fontSize:"0.63rem",letterSpacing:"0.18em",opacity:0.85}}>{"▸"} {cat.toUpperCase()} <span style={{opacity:0.5}}>({inCat.length})</span></div>
                      <button onClick={()=>{
                        if(allCatSelected) setSelectedIds(prev=>prev.filter(id=>!catIds.includes(id)));
                        else setSelectedIds(prev=>[...new Set([...prev,...catIds])]);
                      }} style={{padding:"0.2rem 0.5rem",background:"transparent",border:`1px solid ${CATEGORY_COLORS[cat]||"#4a6a80"}44`,color:CATEGORY_COLORS[cat]||"#4a6a80",borderRadius:"3px",cursor:"pointer",fontSize:"0.58rem",fontFamily:"inherit",opacity:0.7}}>
                        {allCatSelected?"deselect all":"select all"}
                      </button>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem"}}>
                      {inCat.map(src=>{
                        const isDisabled = disabledIds.includes(src.id);
                        const isActive   = selectedIds.includes(src.id) && !isDisabled;
                        return (
                          <div key={src.id} style={{display:"flex",alignItems:"stretch",opacity:isDisabled?0.35:1,transition:"opacity 0.15s"}}>
                            <button onClick={()=>!isDisabled&&toggleSource(src.id)} style={{padding:"0.35rem 0.65rem",background:isActive?`${src.color}22`:"#0a1929",border:`1px solid ${isActive?src.color:"#1a3a4a"}`,borderRight:"none",borderRadius:"4px 0 0 4px",color:isActive?src.color:isDisabled?"#2a3a4a":"#4a6a80",cursor:isDisabled?"not-allowed":"pointer",fontSize:"0.68rem",fontFamily:"inherit",textDecoration:isDisabled?"line-through":"none"}}>
                              {src.isCustom&&<span style={{marginRight:"0.3rem",fontSize:"0.58rem"}}>✦</span>}{src.name}
                            </button>
                            <button
                              title="Edit feed name/URL"
                              onClick={()=>setEditingFeed({id:src.id, name:src.name, url: src.url || src.xmlUrl || ""})}
                              style={{padding:"0.35rem 0.4rem",background:"#0a1929",border:"1px solid #1a3a4a",borderLeft:"none",borderRight:"none",color:"#4a6a80",cursor:"pointer",fontSize:"0.6rem",fontFamily:"inherit",lineHeight:1}}>
                              {"✎"}
                            </button>
                            {feedOverrides[src.id] && (
                              <button
                                title="Reset to default (undo edit)"
                                onClick={()=>resetFeedOverride(src.id)}
                                style={{padding:"0.35rem 0.4rem",background:"#0a1929",border:"1px solid #1a3a4a",borderLeft:"none",borderRight:"none",color:"#ffd700",cursor:"pointer",fontSize:"0.6rem",fontFamily:"inherit",lineHeight:1}}>
                                {"↺"}
                              </button>
                            )}
                            <button
                              title={isDisabled?"Enable feed":"Disable feed"}
                              onClick={()=>setDisabledIds(prev=>isDisabled?prev.filter(id=>id!==src.id):[...prev,src.id])}
                              style={{padding:"0.35rem 0.4rem",background:"#0a1929",border:`1px solid ${isDisabled?"#ef535055":"#1a3a4a"}`,borderLeft:"1px solid #1a2a3a",borderRight:"none",color:isDisabled?"#ef5350":"#2a4a5a",cursor:"pointer",fontSize:"0.6rem",fontFamily:"inherit",lineHeight:1}}>
                              {isDisabled?"▶":"⊘"}
                            </button>
                            {confirmDeleteId===src.id ? (
                              <div style={{display:"flex",alignItems:"stretch"}}>
                                <button onClick={()=>{deleteFeed(src.id);setConfirmDeleteId(null);}}
                                  style={{padding:"0.35rem 0.5rem",background:"#ef535022",border:"1px solid #ef5350",borderLeft:"none",color:"#ef5350",cursor:"pointer",fontSize:"0.58rem",fontFamily:"inherit",lineHeight:1,whiteSpace:"nowrap"}}>
                                  {"del?"}
                                </button>
                                <button onClick={()=>setConfirmDeleteId(null)}
                                  style={{padding:"0.35rem 0.4rem",background:"#0a1929",border:"1px solid #1a3a4a",borderLeft:"none",borderRadius:"0 4px 4px 0",color:"#4a6a80",cursor:"pointer",fontSize:"0.58rem",fontFamily:"inherit",lineHeight:1}}>
                                  {"✕"}
                                </button>
                              </div>
                            ) : (
                              <button
                                title="Delete feed"
                                onClick={()=>setConfirmDeleteId(src.id)}
                                style={{padding:"0.35rem 0.4rem",background:"#0a1929",border:"1px solid #1a3a4a",borderLeft:"none",borderRadius:"0 4px 4px 0",color:"#2a3a4a",cursor:"pointer",fontSize:"0.6rem",fontFamily:"inherit",lineHeight:1,transition:"color 0.15s"}}
                                onMouseEnter={function(e){e.currentTarget.style.color="#ef5350";}}
                                onMouseLeave={function(e){e.currentTarget.style.color="#2a3a4a";}}>
                                {"🗑"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <button onClick={()=>setShowAddFeed(true)} style={{marginTop:"0.5rem",padding:"0.5rem 1rem",background:"#e879f911",border:"1px dashed #e879f955",color:"#e879f9",borderRadius:"5px",cursor:"pointer",fontSize:"0.7rem",fontFamily:"inherit"}}>✦ ADD CUSTOM FEED</button>
            </div>

            <div>
              {/* Model selector in config */}
              <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"0.8rem"}}>◈ MODEL</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"1.5rem"}}>
                {MODELS.map(m=>(
                  <button key={m.id} onClick={()=>setSelectedModelId(m.id)} style={{padding:"0.6rem 0.8rem",textAlign:"left",background:selectedModelId===m.id?`${m.color}18`:"#0a1929",border:`1px solid ${selectedModelId===m.id?m.color:"#1a3a4a"}`,borderRadius:"6px",cursor:"pointer",fontFamily:"inherit",position:"relative"}}>
                    {m.id==="haiku45"&&<span style={{position:"absolute",top:"4px",right:"6px",fontSize:"0.48rem",color:"#26c6da",opacity:0.7}}>DEFAULT</span>}
                    <div style={{color:selectedModelId===m.id?m.color:"#4a6a80",fontSize:"0.72rem",fontWeight:700}}>{m.name}</div>
                    <div style={{color:"#2a4a60",fontSize:"0.62rem",marginTop:"0.2rem"}}>${m.inputPer1M}/${m.outputPer1M} per 1M</div>
                  </button>
                ))}
              </div>

              {/* Max tokens control */}
              {(() => {
                const TOKEN_PRESETS = [
                  { value: 512,  label: "512",   hint: "pulse check" },
                  { value: 1024, label: "1k",    hint: "quick brief" },
                  { value: 2048, label: "2k",    hint: "standard ★" },
                  { value: 4096, label: "4k",    hint: "deep dive"   },
                  { value: 8192, label: "8k",    hint: "full report" },
                  { value: null, label: "custom", hint: null         },
                ];
                const isCustomMode = !TOKEN_PRESETS.slice(0,-1).some(p=>p.value===maxTokens);
                return (
                  <>
                    <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"0.8rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>◈ MAX TOKENS PER RESPONSE</span>
                      <span style={{color:maxTokens>=6000?"#ffd700":maxTokens>=2048?"#00ff9d":"#ef5350",fontWeight:700,fontSize:"0.75rem"}}>{maxTokens.toLocaleString()} tokens</span>
                    </div>
                    <div style={{display:"flex",gap:"0.4rem",marginBottom:"0.6rem",flexWrap:"wrap"}}>
                      {TOKEN_PRESETS.map(p=>{
                        const active = p.value===null ? isCustomMode : maxTokens===p.value && !isCustomMode;
                        return (
                          <button key={p.label} onClick={()=>{ if(p.value!==null){setMaxTokens(p.value);setCustomTokens("");} else {setCustomTokens(String(maxTokens));} }}
                            style={{padding:"0.4rem 0.7rem",background:active?"#4fc3f722":"#0a1929",border:`1px solid ${active?"#4fc3f7":"#1a3a4a"}`,color:active?"#4fc3f7":"#4a6a80",borderRadius:"4px",cursor:"pointer",fontSize:"0.65rem",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:"0.15rem"}}>
                            <span style={{fontWeight:700}}>{p.label}</span>
                            {p.hint&&<span style={{fontSize:"0.52rem",opacity:0.6}}>{p.hint}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {isCustomMode && (
                      <div style={{display:"flex",gap:"0.5rem",alignItems:"center",marginBottom:"0.6rem"}}>
                        <input
                          type="number" min={1} max={32000} step={256}
                          value={customTokens}
                          onChange={e=>{ setCustomTokens(e.target.value); const n=parseInt(e.target.value); if(!isNaN(n)&&n>0) setMaxTokens(n); }}
                          placeholder="e.g. 3000"
                          style={{width:"130px",background:"#0a1929",border:"1px solid #4fc3f744",color:"#c9d8e8",padding:"0.4rem 0.7rem",fontSize:"0.75rem",fontFamily:"monospace",borderRadius:"4px",outline:"none"}}
                        />
                        <span style={{color:"#2a5a70",fontSize:"0.62rem"}}>tokens (1 – 32 000)</span>
                      </div>
                    )}
                    <div style={{marginBottom:"1.5rem",padding:"0.5rem 0.8rem",background:"#0a1929",border:"1px solid #1a3a4a",borderRadius:"4px"}}>
                      {[
                        {range:[0,511],   color:"#ef5350", text:"⚠ Too low — reports will be truncated mid-section."},
                        {range:[512,1023], color:"#ff9800", text:"Suitable for a quick pulse check with few sources."},
                        {range:[1024,2047],color:"#ffd700", text:"Minimal briefing — expect condensed sections."},
                        {range:[2048,4095],color:"#00ff9d", text:"✓ Recommended for standard daily briefings (8 sections, 10+ sources)."},
                        {range:[4096,8191],color:"#4fc3f7", text:"Good for deep-dive analysis or large source sets."},
                        {range:[8192,Infinity],color:"#e879f9",text:"Maximum detail — use with Sonnet or Opus for complex reports."},
                      ].filter(({range})=>maxTokens>=range[0]&&maxTokens<=range[1]).map(({color,text})=>(
                        <span key={text} style={{color,fontSize:"0.65rem"}}>{text}</span>
                      ))}
                    </div>
                  </>
                );
              })()}

              <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"0.8rem"}}>◈ ANALYSIS FOCUS</div>
              <textarea value={query} onChange={e=>setQuery(e.target.value)} rows={4} style={{width:"100%",boxSizing:"border-box",background:"#0a1929",border:"1px solid #1a3a4a",color:"#c9d8e8",padding:"0.9rem",fontSize:"0.78rem",fontFamily:"inherit",borderRadius:"6px",resize:"vertical",lineHeight:1.6,outline:"none",marginBottom:"1.2rem"}} placeholder="Focus area..."/>

              <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"0.8rem"}}>◈ SCHEDULE</div>
              <div style={{display:"flex",gap:"0.5rem",marginBottom:"1.5rem"}}>
                {["hourly","daily","weekly"].map(sc=>(
                  <button key={sc} onClick={()=>setSchedule(sc)} style={{padding:"0.45rem 0.9rem",background:schedule===sc?"#00ff9d22":"#0a1929",border:`1px solid ${schedule===sc?"#00ff9d":"#1a3a4a"}`,color:schedule===sc?"#00ff9d":"#4a6a80",borderRadius:"4px",cursor:"pointer",fontSize:"0.68rem",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:"0.1em"}}>{sc}</button>
                ))}
              </div>

              {/* Summary */}
              <div style={{background:"#0a1929",border:"1px solid #1a3a4a",borderRadius:"6px",padding:"1rem",marginBottom:"1rem",fontSize:"0.7rem"}}>
                <div style={{color:"#4a6a80",fontSize:"0.62rem",letterSpacing:"0.15em",marginBottom:"0.6rem"}}>BRIEFING PARAMETERS</div>
                {[["Sources",selectedFeeds.length+" active / "+(disabledIds.length>0?disabledIds.length+" disabled":"none disabled"),"#00ff9d"],["Model",currentModel.name,currentModel.color],["Max tokens",maxTokens.toLocaleString()+" tokens","#4fc3f7"],["Window",windowLabel,"#4fc3f7"],["Est. cost/run",fmtMoneyFull(calcCost(800+selectedFeeds.length*300,maxTokens,selectedModelId).total),"#ffd700"]].map(([k,v,c])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"0.25rem 0",borderBottom:"1px solid #0d2137"}}>
                    <span style={{color:"#4a6a80"}}>{k}</span><span style={{color:c}}>{v}</span>
                  </div>
                ))}
              </div>

              {error&&<div style={{color:"#ef5350",fontSize:"0.72rem",marginBottom:"1rem",padding:"0.5rem",background:"#ef535011",border:"1px solid #ef535033",borderRadius:"4px"}}>{"⚠"} {error}</div>}
              <button onClick={generateReport} disabled={!!loading} style={{width:"100%",padding:"1rem",background:loading?"#0a1929":"linear-gradient(135deg,#00ff9d22,#4fc3f722)",border:`1px solid ${loading?"#1a3a4a":"#00ff9d"}`,color:loading?"#4a6a80":"#00ff9d",borderRadius:"6px",cursor:loading?"not-allowed":"pointer",fontSize:"0.82rem",fontFamily:"inherit",letterSpacing:"0.15em",fontWeight:"bold",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
                {loading==="fetching"
                  ? <><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>◌</span>{"FETCHING "}{selectedFeeds.length}{" FEEDS…"}</>
                  : loading==="analyzing"
                    ? <><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>◌</span>{"ANALYZING WITH AI…"}</>
                    : "⚡ GENERATE BRIEFING"}
              </button>
            </div>
          </div>
          </div>
        )}

        {/* ── REPORT ── */}
        {activeTab==="report" && (
          <div>
            {loading==="fetching"&&<div style={{textAlign:"center",padding:"4rem",color:"#4a6a80"}}><div style={{fontSize:"2rem",marginBottom:"1rem",animation:"pulse 1.5s ease-in-out infinite"}}>📡</div><div style={{color:"#4fc3f7",letterSpacing:"0.2em"}}>{"FETCHING "}{selectedFeeds.length}{" FEEDS…"}</div><div style={{fontSize:"0.7rem",marginTop:"0.4rem"}}>Downloading and parsing RSS/Atom articles for {windowLabel}</div></div>}
            {loading==="analyzing"&&<div style={{textAlign:"center",padding:"4rem",color:"#4a6a80"}}><div style={{fontSize:"2rem",marginBottom:"1rem",animation:"pulse 1.5s ease-in-out infinite"}}>⚡</div><div style={{color:"#00ff9d",letterSpacing:"0.2em"}}>ANALYZING WITH AI…</div><div style={{fontSize:"0.7rem",marginTop:"0.4rem"}}>Window: {windowLabel}</div></div>}
            {!loading&&!report&&<div style={{textAlign:"center",padding:"4rem",color:"#4a6a80"}}><div style={{fontSize:"3rem",marginBottom:"1rem",opacity:0.3}}>📋</div>No report generated yet.</div>}
            {report&&(
              <div ref={reportRef} style={{background:"#0a1929",border:"1px solid #1a3a4a",borderRadius:"8px",padding:"2rem",lineHeight:1.8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem",paddingBottom:"1rem",borderBottom:"1px solid #1a3a4a"}}>
                  <div>
                    <div style={{color:"#00ff9d",fontSize:"0.72rem",letterSpacing:"0.2em"}}>THREAT INTELLIGENCE BRIEFING</div>
                    <div style={{color:"#4a6a80",fontSize:"0.63rem"}}>{new Date().toUTCString()}{" · "}{selectedFeeds.length}{" sources · "}{currentModel.name}{" · "}{windowLabel}</div>
                  </div>
                  <div style={{display:"flex",gap:"0.5rem"}}>
                    <span style={{padding:"0.25rem 0.6rem",background:"#ef535022",border:"1px solid #ef535044",color:"#ef5350",borderRadius:"4px",fontSize:"0.62rem"}}>TLP:GREEN</span>
                    <span style={{padding:"0.25rem 0.6rem",background:"#ffd70022",border:"1px solid #ffd70044",color:"#ffd700",borderRadius:"4px",fontSize:"0.62rem"}}>AI-GENERATED</span>
                    {costLedger.length>0&&<span style={{padding:"0.25rem 0.6rem",background:"#00ff9d11",border:"1px solid #00ff9d33",color:"#00ff9d",borderRadius:"4px",fontSize:"0.62rem"}}>{fmtMoneyFull((costLedger[costLedger.length-1]||{totalCost:0}).totalCost)}</span>}
                  </div>
                </div>
                <div>{renderMarkdown(report, sourceMap)}</div>
              </div>
            )}
          </div>
        )}

        {/* ── COST & FORECAST ── */}
        {activeTab==="cost" && (
          <CostTab
            costLedger={costLedger}
            selectedFeeds={selectedFeeds}
            schedule={schedule}
            selectedModelId={selectedModelId}
            setSelectedModelId={setSelectedModelId}
            maxTokens={maxTokens}
            setMaxTokens={setMaxTokens}
            liveEstimate={calcCost(1200 + selectedFeeds.length * 1500, maxTokens, selectedModelId)}
          />
        )}

        {/* ── HISTORY ── */}
        {/* ── HISTORY ── */}
        {activeTab==="history" && (() => {
          const exportableIds = history
            .filter(h => !h.saving && !h.saveFailed && h.id && h.id < 1e12)
            .map(h => h.id);
          const allSelected = exportableIds.length>0 && exportableIds.every(id=>historySelected.includes(id));
          return (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
              <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em"}}>{"◈ REPORT HISTORY ("}{history.length}{")"}</div>
              {exportableIds.length>0 && (
                <div style={{display:"flex",gap:"0.4rem"}}>
                  <button onClick={()=>setHistorySelected(allSelected?[]:exportableIds)} style={{padding:"0.3rem 0.6rem",background:"#00ff9d11",border:"1px solid #00ff9d33",color:"#00ff9d",borderRadius:"4px",cursor:"pointer",fontSize:"0.6rem",fontFamily:"inherit"}}>{allSelected?"NONE":"ALL"}</button>
                </div>
              )}
            </div>
            {!history.length
              ? <div style={{textAlign:"center",padding:"3rem",color:"#4a6a80"}}>No reports yet.</div>
              : history.map(h=>{
                  const modelColor = (MODELS.find(function(m){return m.id===h.modelId;})||{color:"#4a6a80"}).color;
                  // dbId is valid once saving=false and id is a small integer (not a Date.now() timestamp)
                  const dbId = (!h.saving && !h.saveFailed && h.id && h.id < 1e12) ? h.id : null;
                  const isSelected = dbId && historySelected.includes(dbId);
                  return (
                    <div key={h.id}
                      onClick={function(){
                        var body=h.report;
                        if(!body&&h.id){
                          fetch("http://localhost:3001/api/reports/"+h.id).then(function(r){return r.json();}).then(function(full){
                            var sm = {}; try { sm = full.source_map ? JSON.parse(full.source_map) : (h.sourceMap||{}); } catch(e){}
                            setSourceMap(sm);
                            setReport(rebuildReferences(full.body||"", sm));
                            setActiveTab("report");
                          });
                        } else {
                          var sm = h.sourceMap||{};
                          setSourceMap(sm);
                          setReport(rebuildReferences(body||"", sm));
                          setActiveTab("report");
                        }
                      }}
                      style={{background:"#0a1929",border:`1px solid ${isSelected?"#e879f9":"#1a3a4a"}`,borderRadius:"6px",padding:"1rem 1.5rem",marginBottom:"0.8rem",cursor:"pointer",display:"flex",gap:"1rem",alignItems:"flex-start"}}
                    >
                      <input type="checkbox" checked={!!isSelected} disabled={!dbId}
                        onClick={function(e){e.stopPropagation();}}
                        onChange={()=>dbId && toggleHistorySelected(dbId)}
                        style={{marginTop:"0.2rem",accentColor:"#e879f9",cursor:dbId?"pointer":"not-allowed",flexShrink:0}}/>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flex:1}}>
                        <div>
                          <div style={{color:"#c9d8e8",fontSize:"0.78rem"}}>
                            {h.timestamp}
                            <span style={{color:modelColor,fontSize:"0.65rem"}}>{" · "}{h.modelName}</span>
                          </div>
                          <div style={{color:"#4a6a80",fontSize:"0.65rem",marginTop:"0.2rem"}}>{h.query}</div>
                          <div style={{color:"#4fc3f7",fontSize:"0.6rem",marginTop:"0.1rem"}}>{"Window: "}{fmtDate(h.dateFrom)}{" → "}{fmtDate(h.dateTo)}</div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"0.4rem"}}>
                          <div style={{color:"#00ff9d",fontSize:"0.72rem"}}>{h.sources}{" sources"}</div>
                          <div style={{color:"#ffd700",fontSize:"0.72rem",fontWeight:700}}>{fmtMoneyFull(h.totalCost)}</div>
                          <div style={{display:"flex",gap:"0.3rem",marginTop:"0.2rem"}} onClick={function(e){e.stopPropagation();}}>
                            {["md","html","pdf","docx"].map(function(fmt){
                              return dbId
                                ? <a key={fmt}
                                    href={"http://localhost:3001/api/reports/"+dbId+"/export?format="+fmt}
                                    target={fmt==="pdf"?"_blank":"_self"}
                                    rel="noreferrer"
                                    style={{padding:"0.2rem 0.4rem",background:"#0a1929",border:"1px solid #1a3a4a",color:"#4fc3f7",borderRadius:"3px",fontSize:"0.58rem",textDecoration:"none",fontFamily:"monospace"}}>
                                    {"↓"}{fmt.toUpperCase()}
                                  </a>
                                : <span key={fmt}
                                    title={h.saveFailed ? "DB save failed — report not persisted" : "Saving to DB..."}
                                    style={{padding:"0.2rem 0.4rem",background:"#0a1929",border:`1px solid ${h.saveFailed?"#ef535044":"#1a3a4a"}`,color:h.saveFailed?"#ef535066":"#2a4a60",borderRadius:"3px",fontSize:"0.58rem",fontFamily:"monospace",cursor:"not-allowed"}}>
                                    {"↓"}{fmt.toUpperCase()}
                                  </span>;
                            })}
                            <button
                              onClick={function(){
                                fetch("http://localhost:3001/api/reports/"+h.id,{method:"DELETE"});
                                setHistory(function(p){return p.filter(function(r){return r.id!==h.id;});});
                                setCostLedger(function(p){return p.filter(function(r){return r.id!==h.id;});});
                                setHistorySelected(function(p){return p.filter(function(id){return id!==h.id;});});
                              }}
                              style={{padding:"0.2rem 0.4rem",background:"#0a1929",border:"1px solid #ef535055",color:"#ef5350",borderRadius:"3px",fontSize:"0.58rem",cursor:"pointer",fontFamily:"inherit"}}>
                              {"✕"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
            }

            {exportableIds.length>0 && (
              <div style={{position:"sticky",bottom:0,marginTop:"1.5rem",padding:"1rem 1.5rem",background:"#0a1929",border:"1px solid #e879f933",borderRadius:"8px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"1rem"}}>
                <div style={{color:"#4a6a80",fontSize:"0.68rem"}}>
                  {historySelected.length ? `${historySelected.length} report${historySelected.length===1?"":"s"} selected` : "Select reports above to bulk-export."}
                </div>
                <div style={{display:"flex",gap:"1rem",alignItems:"center"}}>
                  <div style={{display:"flex",gap:"0.4rem"}}>
                    {["md","html","pdf","docx"].map(fmt=>(
                      <button key={fmt} onClick={()=>setHistoryExportFmt(fmt)} style={{
                        padding:"0.4rem 0.7rem",
                        background:historyExportFmt===fmt?"#e879f918":"#060d14",
                        border:`1px solid ${historyExportFmt===fmt?"#e879f9":"#1a3a4a"}`,
                        color:historyExportFmt===fmt?"#e879f9":"#4a6a80",
                        borderRadius:"5px",cursor:"pointer",fontFamily:"inherit",fontSize:"0.65rem",fontWeight:700,
                      }}>{fmt.toUpperCase()}</button>
                    ))}
                  </div>
                  <button onClick={exportSelectedHistory} disabled={!historySelected.length} style={{
                    padding:"0.6rem 1.2rem",
                    background:historySelected.length?"linear-gradient(135deg,#e879f922,#4fc3f722)":"#0a1929",
                    border:`1px solid ${historySelected.length?"#e879f9":"#1a3a4a"}`,
                    color:historySelected.length?"#e879f9":"#2a4a60",
                    borderRadius:"6px",cursor:historySelected.length?"pointer":"not-allowed",
                    fontSize:"0.75rem",fontFamily:"inherit",fontWeight:700,letterSpacing:"0.08em",
                  }}>
                    {`↓ EXPORT ${historySelected.length || ""} REPORT${historySelected.length===1?"":"S"}`}
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ── HUNT ── */}
        {activeTab==="hunt" && (() => {
          const extractable = history.filter(h => !h.saving && !h.saveFailed && h.id && h.id < 1e12);
          return (
            <div>
              <div style={{color:"#4fc3f7",fontSize:"0.72rem",letterSpacing:"0.15em",marginBottom:"0.6rem"}}>
                {"◈ HUNTING HYPOTHESES"}
              </div>
              <div style={{color:"#4a6a80",fontSize:"0.68rem",marginBottom:"1.2rem",lineHeight:1.6}}>
                Select saved reports below, then generate one consolidated interactive HTML dashboard — hypotheses are extracted automatically for any report that doesn't have them yet.
              </div>

              {/* Auth mode toggle */}
              <div style={{marginBottom:"1.2rem"}}>
                <div style={{color:"#4fc3f7",fontSize:"0.68rem",letterSpacing:"0.15em",marginBottom:"0.5rem"}}>◈ AUTH MODE</div>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  {[
                    {id:"apikey",       label:"API KEY",             sub:"metered · uses CONFIG key"},
                    {id:"subscription", label:"CLAUDE SUBSCRIPTION", sub:"local claude CLI · no key"},
                  ].map(m=>(
                    <button key={m.id} onClick={()=>setHuntAuthMode(m.id)} style={{
                      padding:"0.5rem 0.9rem",textAlign:"left",
                      background:huntAuthMode===m.id?"#e879f918":"#0a1929",
                      border:`1px solid ${huntAuthMode===m.id?"#e879f9":"#1a3a4a"}`,
                      borderRadius:"6px",cursor:"pointer",fontFamily:"inherit",
                    }}>
                      <div style={{color:huntAuthMode===m.id?"#e879f9":"#4a6a80",fontSize:"0.68rem",fontWeight:700}}>{m.label}</div>
                      <div style={{color:"#2a4a60",fontSize:"0.58rem",marginTop:"0.15rem"}}>{m.sub}</div>
                    </button>
                  ))}
                </div>
                {huntAuthMode==="subscription" && (
                  <div style={{marginTop:"0.6rem",color:"#4a6a80",fontSize:"0.62rem",lineHeight:1.5}}>
                    Runs the <code style={{background:"#0d2137",color:"#00ff9d",padding:"0.05em 0.35em",borderRadius:"3px"}}>claude</code> CLI on the machine running server.js — requires it installed and logged in (<code style={{background:"#0d2137",color:"#00ff9d",padding:"0.05em 0.35em",borderRadius:"3px"}}>claude login</code>) with a Claude Pro/Max subscription. No per-token cost is tracked for this mode.
                  </div>
                )}
              </div>

              {huntError && <div style={{color:"#ef5350",fontSize:"0.72rem",marginBottom:"1rem",padding:"0.5rem",background:"#ef535011",border:"1px solid #ef535033",borderRadius:"4px"}}>{"⚠"} {huntError}</div>}
              {huntAuthMode==="apikey" && !apiKey.trim() && <div style={{color:"#ffd700",fontSize:"0.68rem",marginBottom:"1rem",padding:"0.5rem 0.8rem",background:"#ffd70011",border:"1px solid #ffd70033",borderRadius:"4px"}}>{"⚠ API key required to extract hypotheses — add it in the CONFIG tab, or switch to Claude Subscription mode above."}</div>}

              {!extractable.length
                ? <div style={{textAlign:"center",padding:"3rem",color:"#4a6a80"}}>No saved reports yet — generate a briefing first.</div>
                : extractable.map(h => {
                    const count = hypCounts[h.id] || 0;
                    const isBusyNow = huntBusy === h.id;
                    const isSelected = huntSelected.includes(h.id);
                    return (
                      <div key={h.id} style={{background:"#0a1929",border:`1px solid ${isSelected?"#e879f9":"#1a3a4a"}`,borderRadius:"6px",padding:"1rem 1.5rem",marginBottom:"0.8rem"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"1rem"}}>
                          <label style={{display:"flex",alignItems:"flex-start",gap:"0.7rem",cursor:"pointer",flex:1}}>
                            <input type="checkbox" checked={isSelected}
                              onChange={()=>toggleHuntSelected(h.id)}
                              style={{marginTop:"0.2rem",accentColor:"#e879f9",cursor:"pointer"}}/>
                            <div>
                              <div style={{color:"#c9d8e8",fontSize:"0.78rem"}}>
                                {h.timestamp}
                                <span style={{color:(MODELS.find(m=>m.id===h.modelId)||{color:"#4a6a80"}).color,fontSize:"0.65rem"}}>{" · "}{h.modelName}</span>
                              </div>
                              <div style={{color:"#4a6a80",fontSize:"0.65rem",marginTop:"0.2rem"}}>{h.query}</div>
                              <div style={{color:"#4fc3f7",fontSize:"0.6rem",marginTop:"0.1rem"}}>{"Window: "}{fmtDate(h.dateFrom)}{" → "}{fmtDate(h.dateTo)}</div>
                            </div>
                          </label>
                          <div style={{flexShrink:0}}>
                            {isBusyNow
                              ? <span style={{padding:"0.25rem 0.6rem",background:"#e879f911",border:"1px solid #e879f944",color:"#e879f9",borderRadius:"4px",fontSize:"0.65rem",whiteSpace:"nowrap"}}><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>◌</span>{" EXTRACTING…"}</span>
                              : count>0
                                ? <span style={{padding:"0.25rem 0.6rem",background:"#00ff9d11",border:"1px solid #00ff9d33",color:"#00ff9d",borderRadius:"4px",fontSize:"0.65rem",whiteSpace:"nowrap"}}>{"✓ "}{count}{" hypotheses"}</span>
                                : <span style={{padding:"0.25rem 0.6rem",background:"#0a1929",border:"1px solid #1a3a4a",color:"#2a4a60",borderRadius:"4px",fontSize:"0.65rem",whiteSpace:"nowrap"}}>not yet extracted</span>
                            }
                          </div>
                        </div>
                      </div>
                    );
                  })
              }

              <div style={{position:"sticky",bottom:0,marginTop:"1.5rem",padding:"1rem 1.5rem",background:"#0a1929",border:"1px solid #e879f933",borderRadius:"8px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"1rem"}}>
                <div style={{color:"#4a6a80",fontSize:"0.68rem"}}>
                  {huntSelected.length
                    ? `${huntSelected.length} report${huntSelected.length===1?"":"s"} selected`
                    : "Select reports above, then generate."}
                </div>
                <div style={{display:"flex",gap:"1rem",alignItems:"center",flexWrap:"wrap"}}>
                  <label style={{display:"flex",alignItems:"center",gap:"0.4rem",cursor:"pointer",fontSize:"0.6rem",color:"#4a6a80",whiteSpace:"nowrap"}}>
                    <input type="checkbox" checked={huntForceReextract} onChange={()=>setHuntForceReextract(p=>!p)} style={{accentColor:"#e879f9",cursor:"pointer"}}/>
                    re-extract already processed
                  </label>
                  <div style={{display:"flex",gap:"0.3rem"}}>
                    {[{id:"light",label:"☀ LIGHT"},{id:"dark",label:"🌙 DARK"}].map(t=>(
                      <button key={t.id} onClick={()=>setHuntTheme(t.id)} style={{
                        padding:"0.4rem 0.7rem",
                        background:huntTheme===t.id?"#e879f918":"#060d14",
                        border:`1px solid ${huntTheme===t.id?"#e879f9":"#1a3a4a"}`,
                        color:huntTheme===t.id?"#e879f9":"#4a6a80",
                        borderRadius:"5px",cursor:"pointer",fontFamily:"inherit",fontSize:"0.6rem",fontWeight:700,
                      }}>{t.label}</button>
                    ))}
                  </div>
                  <button onClick={generateConsolidated} disabled={!huntSelected.length || huntGenerating} style={{
                    padding:"0.6rem 1.2rem",
                    background:(!huntSelected.length||huntGenerating)?"#0a1929":"linear-gradient(135deg,#e879f922,#4fc3f722)",
                    border:`1px solid ${(!huntSelected.length||huntGenerating)?"#1a3a4a":"#e879f9"}`,
                    color:(!huntSelected.length||huntGenerating)?"#2a4a60":"#e879f9",
                    borderRadius:"6px",cursor:(!huntSelected.length||huntGenerating)?"not-allowed":"pointer",
                    fontSize:"0.75rem",fontFamily:"inherit",fontWeight:700,letterSpacing:"0.08em",
                    display:"flex",alignItems:"center",gap:"0.4rem",whiteSpace:"nowrap",
                  }}>
                    {huntGenerating
                      ? <><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>◌</span>{"GENERATING…"}</>
                      : "⚡ GENERATE CONSOLIDATED HTML"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap');
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        *{scrollbar-width:thin;scrollbar-color:#1a3a4a #060d14}
        textarea:focus,input:focus{border-color:#00ff9d44!important}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);cursor:pointer}
        input[type=range]{height:3px;cursor:pointer}
      `}</style>
    </div>
  );
}
