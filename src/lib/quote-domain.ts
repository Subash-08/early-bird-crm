import { z } from 'zod';

const short=z.string().trim().max(300).default('');
const long=z.string().trim().max(10000).default('');
const money=z.string().trim().regex(/^\d{0,9}(\.\d{1,2})?$/,'Use a positive amount with up to two decimals.').default('0');
const isoDate=z.union([z.literal(''),z.iso.date()]).default('');
export const quoteStatuses=['Requested','Needs information','Draft','Approved','Sent','Accepted','Rejected','Changes requested','Expired','Superseded'] as const;
export const serviceTypes=['Accommodation','Car / transfer','Flight coordination','Train coordination','Bus coordination','Ferry / boat','Activities','Visa / permit assistance','Other'] as const;
export const responsibilities=['Agency arranged','Customer booked','Third-party arranged','Not required'] as const;

export const quoteRequestSchema=z.object({
 enquiryId:z.string().min(1),requestNote:long,requestedDueAt:z.iso.datetime(),
}).strict();

const itineraryItem=z.object({id:z.string(),day:z.number().int().min(1).max(120),date:isoDate,title:short,city:short,activities:long,transfers:long,stay:short,meals:short,notes:long}).strict();
const stayItem=z.object({id:z.string(),optionId:z.string().default(''),city:short,property:short,checkIn:isoDate,checkOut:isoDate,roomType:short,rooms:z.number().int().min(0).max(99).default(0),occupancy:short,mealPlan:short,extraBed:short,notes:long}).strict();
const transportItem=z.object({id:z.string(),optionId:z.string().default(''),mode:z.enum(['Car','Flight','Train','Bus','Ferry / boat','Other']),responsibility:z.enum(responsibilities),from:short,to:short,date:isoDate,time:short,timeZone:short,provider:short,reference:short,passengers:short,details:long,chargeIncluded:z.boolean().default(true)}).strict();
const quoteOption=z.object({id:z.string(),name:z.string().trim().min(1).max(120),description:long,hotel:short,mealPlan:short,priceBasis:z.enum(['Total package','Per person','Per couple']),quantity:z.number().min(.01).max(10000),unitPrice:money,discount:money,taxLabel:short,taxAmount:money,internalCost:money,notes:long}).strict();
const optionalExtra=z.object({id:z.string(),name:z.string().trim().min(1).max(160),description:long,price:money,priceBasis:z.enum(['Total','Per person','Per unit']),included:z.boolean().default(false)}).strict();

export const quoteContentSchema=z.object({
 title:z.string().trim().max(200).default(''),summary:long,destinations:short,dateScope:z.enum(['Exact','Indicative']),startDate:isoDate,endDate:isoDate,dateLabel:short,
 adults:z.number().int().min(0).max(999).default(0),childrenAges:short,infants:z.number().int().min(0).max(99).default(0),services:z.array(z.enum(serviceTypes)).max(serviceTypes.length).default([]),
 itinerary:z.array(itineraryItem).max(120).default([]),stays:z.array(stayItem).max(100).default([]),transport:z.array(transportItem).max(100).default([]),options:z.array(quoteOption).max(12).default([]),optionalExtras:z.array(optionalExtra).max(50).default([]),
 inclusions:z.array(z.string().trim().min(1).max(500)).max(100).default([]),exclusions:z.array(z.string().trim().min(1).max(500)).max(100).default([]),currency:z.string().trim().regex(/^[A-Z]{3}$/).default('INR'),
 advanceAmount:money,advanceDue:short,balanceTerms:long,validUntil:isoDate,cancellationTerms:long,customerNotes:long,internalNotes:long,
}).strict();

export const templateSchema=z.object({id:z.string().optional(),name:z.string().trim().min(2).max(160),destination:z.string().trim().max(300),active:z.boolean().default(true),content:quoteContentSchema,version:z.number().optional()}).strict();

export function minor(value:string){const input=String(value||'0');if(!/^\d{1,12}(\.\d{1,2})?$/.test(input))throw new Error('Use a non-negative amount with at most two decimals.');const [whole='0',decimal='']=input.split('.');const amount=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Amount is too large.');return Number(amount);}
export function displayMinor(value:number,currency='INR'){return new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(value/100)}
export function optionAmounts(option:z.infer<typeof quoteOption>){const unit=minor(option.unitPrice),discount=minor(option.discount),tax=minor(option.taxAmount),cost=minor(option.internalCost);const subtotal=Math.round(unit*option.quantity);const total=subtotal-discount+tax;if(total<0)throw new Error(`Option ${option.name}: discount cannot exceed subtotal plus tax.`);return {unitPriceMinor:unit,discountMinor:discount,taxAmountMinor:tax,internalCostMinor:cost,subtotalMinor:subtotal,totalMinor:total,estimatedMarginMinor:total-cost};}
export function assertApproverReady(content:z.infer<typeof quoteContentSchema>){
 const issues:string[]=[];
 if(!content.title)issues.push('quotation title');if(!content.destinations)issues.push('destination');if(!content.adults&&!content.childrenAges&&!content.infants)issues.push('traveller count');if(!content.services.length)issues.push('services');
 if(content.dateScope==='Exact'){if(!content.startDate||!content.endDate||content.endDate<content.startDate)issues.push('valid exact start and end dates');}else if(!content.dateLabel)issues.push('clearly labelled indicative dates');
 if(content.services.includes('Accommodation')&&!content.stays.length)issues.push('at least one stay');if(content.services.includes('Accommodation')&&content.stays.some(s=>!s.property||!s.checkIn||!s.checkOut||s.checkOut<=s.checkIn||!s.rooms))issues.push('complete hotel dates, rooms and property');
 if(content.services.some(x=>['Car / transfer','Flight coordination','Train coordination','Bus coordination','Ferry / boat'].includes(x))&&!content.transport.length)issues.push('transport responsibility and route');
 if(!content.options.length)issues.push('at least one priced option');if(content.options.some(x=>!x.name||minor(x.unitPrice)<=0))issues.push('valid option names and prices');if(!content.inclusions.length)issues.push('inclusions');if(!content.exclusions.length)issues.push('exclusions');if(!content.advanceDue)issues.push('advance schedule');if(!content.balanceTerms)issues.push('balance terms');if(!content.validUntil)issues.push('valid-until date');if(content.validUntil&&content.validUntil<new Date().toISOString().slice(0,10))issues.push('a future validity date');if(!content.cancellationTerms)issues.push('cancellation terms');
 const optionIds=new Set(content.options.map(x=>x.id));if(content.stays.some(x=>x.optionId&&!optionIds.has(x.optionId))||content.transport.some(x=>x.optionId&&!optionIds.has(x.optionId)))issues.push('valid option links');
 if(content.transport.some(x=>x.responsibility==='Customer booked'&&x.chargeIncluded))issues.push('customer-booked transport excluded from agency price');
 if(issues.length)throw new Error(`Cannot approve yet. Add or correct: ${[...new Set(issues)].join(', ')}.`);
}

export type QuoteContent=z.infer<typeof quoteContentSchema>;
export function publicQuoteForRole(q:any,role:string){if(role==='owner')return q;const clean=structuredClone(q);const hide=(content:any)=>{if(!content)return content;content.internalNotes='';for(const option of content.options||[]){delete option.internalCost;delete option.internalCostMinor;delete option.estimatedMarginMinor;}return content};clean.content=hide(clean.content);if(clean.snapshot)clean.snapshot.content=hide(clean.snapshot.content);if(clean.acceptedSnapshot)clean.acceptedSnapshot.content=hide(clean.acceptedSnapshot.content);delete clean.internalCostTotalMinor;delete clean.estimatedMarginTotalMinor;return clean;}
