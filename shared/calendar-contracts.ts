import { z } from 'zod';
import type { Paginated } from './property-contracts.js';
export const viewingStatusSchema=z.enum(['scheduled','completed','cancelled','no_show']);
export type ViewingStatus=z.infer<typeof viewingStatusSchema>;
const uuid=z.uuid(),date=z.iso.date(),requestKey=z.uuid();
const text=(max:number)=>z.string().trim().max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
export const viewingTimeZoneSchema=text(100).min(1).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true;}catch{return false;}});
const minutes=z.number().int().min(15).max(180).multipleOf(5);
const start=z.iso.datetime({offset:true}).refine(value=>/:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(value),'Use a whole-minute time with an explicit property-local UTC offset.');
const page={page:z.coerce.number().int().min(1).max(1000000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)};
export const calendarQuerySchema=z.object({...page,view:z.enum(['day','week','agenda']).default('week'),upcoming:z.enum(['true']).optional(),date:date.optional(),timeZone:viewingTimeZoneSchema.default('Africa/Lagos'),propertyId:uuid.optional(),ownerMembershipId:uuid.optional(),status:z.union([viewingStatusSchema,z.literal('all')]).default('all')}).strict();
export const calendarOptionsSchema=z.object({propertyId:uuid.optional(),leadId:uuid.optional(),propertySearch:text(200).default(''),leadSearch:text(200).default(''),ownerSearch:text(200).default('')}).strict();
export const calendarSlotsSchema=z.object({...page,propertyId:uuid,leadId:uuid,ownerMembershipId:uuid,unitId:uuid.nullable().optional(),date,days:z.coerce.number().int().min(1).max(7).default(1),durationMinutes:z.coerce.number().int().min(15).max(180).multipleOf(5).optional(),excludeViewingId:uuid.optional()}).strict();
export const calendarBookSchema=z.object({requestKey,leadId:uuid,propertyId:uuid,unitId:uuid.nullable().default(null),ownerMembershipId:uuid,startsAt:start,durationMinutes:minutes.optional(),location:text(500).optional()}).strict();
export const calendarRescheduleSchema=z.object({requestKey,version:z.number().int().positive(),ownerMembershipId:uuid,startsAt:start,durationMinutes:minutes.optional(),location:text(500).optional()}).strict();
export const calendarStatusSchema=z.object({requestKey,version:z.number().int().positive(),status:z.enum(['completed','cancelled','no_show']),reason:text(1000).default('')}).strict();
export const calendarSettingsSchema=z.object({version:z.number().int().positive(),enabled:z.boolean(),timeZone:viewingTimeZoneSchema,durationMinutes:minutes,bufferBeforeMinutes:z.number().int().min(0).max(60),bufferAfterMinutes:z.number().int().min(0).max(60),location:text(500).min(1),publicBookingEnabled:z.boolean()}).strict();
const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const calendarAvailabilitySchema=z.object({version:z.number().int().positive(),enabled:z.boolean(),windows:z.array(z.object({weekday:z.number().int().min(0).max(6),start:clock,end:clock}).strict().refine(value=>value.start<value.end)).max(28)}).strict();
export const calendarInvitationSchema=z.object({requestKey,leadId:uuid,propertyId:uuid,unitId:uuid.nullable().default(null),ownerMembershipId:uuid,durationMinutes:minutes.optional(),expiresInHours:z.number().int().min(1).max(168).default(72)}).strict();
export const calendarInvitationQuerySchema=z.object({...page,leadId:uuid.optional(),propertyId:uuid.optional()}).strict();
export const calendarRequestSchema=z.object({requestKey}).strict();
const token=z.string().regex(/^[a-f0-9]{64}$/);
export const publicCalendarReadSchema=z.object({...page,token,date:date.optional(),days:z.number().int().min(1).max(7).default(7),manage:z.boolean().default(false)}).strict();
export const publicCalendarBookSchema=z.object({token,requestKey,startsAt:start,slotKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const publicCalendarManageSchema=z.object({token,requestKey,version:z.number().int().positive(),action:z.enum(['reschedule','cancel']),startsAt:start.optional(),slotKey:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().refine(v=>v.action==='cancel'?!v.startsAt&&!v.slotKey:Boolean(v.startsAt&&v.slotKey));
export interface CalendarPerson {membershipId:string;name:string;role:string}
export interface CalendarWindow {weekday:number;start:string;end:string}
export interface CalendarAvailability {enabled:boolean;windows:CalendarWindow[];version:number}
export interface CalendarPropertySettings {configured:boolean;enabled:boolean;timeZone:string;durationMinutes:number;bufferBeforeMinutes:number;bufferAfterMinutes:number;location:string;publicBookingEnabled:boolean;version:number}
export interface CalendarViewing {
 id:string;property:{id:string;name:string};lead:{id:string;name:string};
 unit:{id:string;label:string}|null;owner:CalendarPerson|null;
 startsAt:string;endsAt:string|null;timeZone:string|null;durationMinutes:number|null;
 bufferBeforeMinutes:number|null;bufferAfterMinutes:number|null;location:string|null;
 status:ViewingStatus;version:number;managed:boolean;source:'staff'|'public'|'legacy';
 canManage:boolean;legacyNotice:string|null;
}
export interface CalendarEvent {id:string;kind:string;summary:string;actorLabel:string;origin:'staff'|'public';occurredAt:string;notification:'simulation'}
export interface CalendarDirectory extends Paginated<CalendarViewing> {range:{from:string;until:string;timeZone:string;view:'day'|'week'|'agenda'};access:{canManage:boolean}}
export interface CalendarOptions {
 properties:Paginated<{id:string;name:string}>;
 selectedProperty:{id:string;name:string}|null;settings:CalendarPropertySettings|null;
 owners:Array<CalendarPerson&{availability:CalendarAvailability}>;ownerTotal:number;
 leads:Paginated<{id:string;name:string;propertyId:string}>;
 units:Array<{id:string;label:string}>;unitTotal:number;
 access:{canManage:boolean;canConfigure:boolean;canManageOwnAvailability:boolean};
}
export interface CalendarSlot {startsAt:string;endsAt:string;utcOffset:string}
export interface CalendarSlots extends Paginated<CalendarSlot>{timeZone:string;durationMinutes:number;notice:string|null}
export interface CalendarInvitation {id:string;propertyId:string;leadId:string;expiresAt:string;revokedAt:string|null;booked:boolean;createdAt:string}
export interface CalendarIssuedInvitation {invitation:CalendarInvitation;token:string;bookingPath:string}
export interface PublicCalendarSlot extends CalendarSlot {slotKey:string}
export interface PublicCalendarInvitation {
 state:'available'|'booked';propertyLabel:string;location:string;timeZone:string;durationMinutes:number;
 slots:Paginated<PublicCalendarSlot>;notice:string|null;
 booking:{startsAt:string;endsAt:string;status:ViewingStatus;version?:number;canManage?:boolean}|null;
}
export interface PublicCalendarConfirmation {status:'booked';propertyLabel:string;location:string;timeZone:string;startsAt:string;endsAt:string;durationMinutes:number;notification:'simulation'}
