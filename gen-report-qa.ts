import { generateReportBlob } from "@/services/solar-report-service";
import { sv } from "@/i18n/locales/sv";
const months=["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
const prod=[120,320,700,1100,1500,1700,1650,1350,900,450,180,90];
const cons=[520,480,430,360,300,260,250,270,330,420,500,560];
const result:any={location:{address:"Testgatan 1, Uppsala",latitude:59.85,longitude:17.63,countryCode:"SE",region:"SE"},
resource:{annualKwhPerKwp:960,monthlyKwhPerKwp:prod.map(v=>v/12),orientation:"south",azimuthDegrees:186,tiltDegrees:30,orientationAssumed:false,tiltAssumed:false,dataSource:"PVGIS SARAH3",calculationDate:new Date().toISOString()},
installedKwp:12.9,panelCount:30,sizingBasis:"consumption",inverterKw:10,maxAcPowerKw:13.8,dcAcRatio:1.29,oversizingPercent:29,
monthlyProductionKwh:prod,annualProductionKwh:10060,consumption:{annualKwh:4680,monthlyKwh:cons},
selfConsumption:{share:0.35,kwh:3521},exported:{share:0.65,kwh:6539},
economics:{currency:"SEK",selfConsumedValuePerKwh:1.5,exportValuePerKwh:0.6,selfConsumptionValue:5281,exportValue:3923,totalValue:9204},
mainFuseAmp:20,presentation:{annualProductionKwh:10060,selfConsumptionKwh:3521,exportedKwh:6539,selfConsumptionPercent:35,exportPercent:65,annualConsumptionKwh:4680,productionCoveragePercent:215,maxAcPowerKw:13.8,selfConsumptionValue:5281,exportValue:3923,annualSavings:9204},
calculationVersion:"1.0.0",calculatedAt:new Date().toISOString(),notes:[]};
const r:any=(sv as any).report;
const blob=generateReportBlob({result,locale:"sv-SE",labels:{title:r.title,appName:"Solenergikollen",summary:r.summary,sizing:r.sizing,production:r.production,consumption:r.consumption,economics:r.economics,assumptions:r.assumptions,disclaimer:r.disclaimer,generated:r.generated,months,rationale:"Anläggningen är dimensionerad efter din årsförbrukning.",coverageNote:"Detta är inte självförsörjningsgrad.",chartProduction:r.chartProduction,chartConsumption:r.chartConsumption,origin:r.origin,fields:r.fields}});
await Bun.write("/tmp/rep/out.pdf", await blob.arrayBuffer());
