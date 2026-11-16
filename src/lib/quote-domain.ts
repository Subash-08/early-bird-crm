import { z } from 'zod';
import { indiaInput } from './workspace-time';

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
type QuoteOption = z.infer<typeof quoteOption>;
type OptionPrice = Pick<QuoteOption, 'name' | 'unitPrice' | 'discount' | 'taxAmount' | 'quantity'>;

export function quoteOptionPrice(option: OptionPrice) {
  const unitPriceMinor = minor(option.unitPrice);
  const discountMinor = minor(option.discount);
  const taxAmountMinor = minor(option.taxAmount);
  const subtotalMinor = Math.round(unitPriceMinor * option.quantity);
  const totalMinor = subtotalMinor - discountMinor + taxAmountMinor;
  if (totalMinor < 0) throw new Error(`Option ${option.name}: discount cannot exceed subtotal plus tax.`);
  return { unitPriceMinor, discountMinor, taxAmountMinor, subtotalMinor, totalMinor };
}

export function optionAmounts(option: QuoteOption) {
  const price = quoteOptionPrice(option);
  const internalCostMinor = minor(option.internalCost);
  return { ...price, internalCostMinor, estimatedMarginMinor: price.totalMinor - internalCostMinor };
}

export function quoteApprovalIssues(content: QuoteContent) {
  const issues: { section: string; message: string }[] = [];
  const add = (section: string, message: string) => issues.push({ section, message });
  if (!content.title) add("overview", "Add a quotation title.");
  if (!content.destinations) add("overview", "Add a destination.");
  if (!content.adults && !content.childrenAges && !content.infants) add("overview", "Add the traveller count.");
  if (!content.services.length) add("overview", "Choose at least one service.");
  if (content.dateScope === "Exact") {
    if (!content.startDate || !content.endDate || content.endDate < content.startDate)
      add("overview", "Enter valid trip start and end dates.");
  } else if (!content.dateLabel) add("overview", "Describe the indicative travel dates.");
  if (content.services.includes("Accommodation") && !content.stays.length) add("stays", "Add at least one stay.");
  if (content.services.includes("Accommodation")) {
    content.stays.forEach((stay, index) => {
      const label = stay.property ? `Stay ${index + 1} (${stay.property})` : `Stay ${index + 1}`;
      const missing = [!stay.property && "property name", !stay.rooms && "number of rooms", !stay.checkIn && "check-in date", !stay.checkOut && "check-out date"].filter(Boolean);
      if (missing.length) add("stays", `${label} needs ${missing.join(", ")}.`);
      if (stay.checkIn && stay.checkOut && stay.checkOut <= stay.checkIn) add("stays", `${label} must check out after check-in.`);
    });
  }
  if (content.services.some((service) => ['Car / transfer', 'Flight coordination', 'Train coordination', 'Bus coordination', 'Ferry / boat'].includes(service)) && !content.transport.length)
    add("transport", "Add the transport route and who is arranging it.");
  if (!content.options.length) add("pricing", "Add at least one priced option.");
  for (const option of content.options) {
    try {
      if (quoteOptionPrice(option).unitPriceMinor <= 0) add("pricing", `Enter a price for ${option.name}.`);
    } catch (error) {
      const message = (error as Error).message;
      add("pricing", message.startsWith("Option ") ? message : `${option.name}: ${message}`);
    }
  }
  if (!content.inclusions.length) add("terms", "List what is included.");
  if (!content.exclusions.length) add("terms", "List what is excluded.");
  if (!content.validUntil) add("terms", "Set a valid-until date for the quotation.");
  else if (content.validUntil < indiaInput(new Date().toISOString()).slice(0, 10)) add("terms", "The valid-until date has passed. Choose today or a later date.");
  if (!content.cancellationTerms) add("terms", "Add the cancellation terms.");
  const optionIds = new Set(content.options.map((option) => option.id));
  if (content.stays.some((stay) => stay.optionId && !optionIds.has(stay.optionId))) add("stays", "Link each stay to an existing option or to all options.");
  if (content.transport.some((leg) => leg.optionId && !optionIds.has(leg.optionId))) add("transport", "Link each transport leg to an existing option or to all options.");
  if (content.transport.some((leg) => leg.responsibility === "Customer booked" && leg.chargeIncluded))
    add("transport", "Keep customer-booked transport out of the package price.");
  return issues;
}

export function assertApproverReady(content: QuoteContent) {
  const issues = quoteApprovalIssues(content);
  if (issues.length) throw new Error(`Cannot approve yet. ${issues.map(({ message }) => message).join(" ")}`);
}

export type QuoteContent=z.infer<typeof quoteContentSchema>;
export function publicQuoteForRole(q:any,role:string){if(role==='owner')return q;const clean=structuredClone(q);const hide=(content:any)=>{if(!content)return content;content.internalNotes='';for(const option of content.options||[]){delete option.internalCost;delete option.internalCostMinor;delete option.estimatedMarginMinor;}return content};clean.content=hide(clean.content);if(clean.snapshot)clean.snapshot.content=hide(clean.snapshot.content);if(clean.acceptedSnapshot)clean.acceptedSnapshot.content=hide(clean.acceptedSnapshot.content);delete clean.internalCostTotalMinor;delete clean.estimatedMarginTotalMinor;return clean;}
