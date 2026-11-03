import { describe,expect,it } from 'vitest';
import { customerSchema,enquirySchema,normalizePhone,safeCell } from '../src/lib/domain';

describe('domain validation',()=>{
 it('normalizes valid international phone numbers',()=>expect(normalizePhone('+91 98765 43210')).toBe('+919876543210'));
 it('rejects a local phone without country code',()=>expect(()=>normalizePhone('9876543210')).toThrow(/country code/));
 it('requires a reason for lost enquiries',()=>{const base={customerId:'c',destination:'Goa',source:'Phone',assigneeId:'s',stage:'Lost',firstContactAt:new Date().toISOString(),dateMode:'Unknown',departure:'',returnDate:'',travelPreference:'',adults:null,childrenAges:'',infants:0,budget:'',budgetBasis:'Unknown',services:'',serviceResponsibility:'',hotelPreference:'',rooms:'',pickup:'',dropoff:'',specialRequirements:'',notes:'',reason:'',nextAction:'',nextFollowUp:'',contactOutcome:'Connected',reviewNeeded:false};expect(enquirySchema.safeParse(base).success).toBe(false)});
 it('rejects reversed exact travel dates',()=>{const data:any={customerId:'c',destination:'Goa',source:'Phone',assigneeId:'s',stage:'New',firstContactAt:new Date().toISOString(),dateMode:'Exact',departure:'2027-04-08',returnDate:'2027-04-01',travelPreference:'',adults:2,childrenAges:'',infants:0,budget:'',budgetBasis:'Total',services:'',serviceResponsibility:'',hotelPreference:'',rooms:'',pickup:'',dropoff:'',specialRequirements:'',notes:'',reason:'',nextAction:'',nextFollowUp:'',contactOutcome:'Connected',reviewNeeded:false};expect(enquirySchema.safeParse(data).success).toBe(false)});
 it('allows a review-needed imported customer without contact',()=>expect(customerSchema.safeParse({name:'Legacy customer',reviewNeeded:true}).success).toBe(true));
 it.each(['=1+1','+cmd','-2+3','@SUM(A1)'])(`neutralizes spreadsheet formula input %s`,value=>expect(safeCell(value).startsWith("'")).toBe(true));
});
