import type { components } from './generated/schema';

/** All API schemas, e.g. `Schemas['ChildResponse']`. */
export type Schemas = components['schemas'];

export type MeResponse = Schemas['MeResponse'];
export type ConsentPurpose = Schemas['ConsentInput']['purpose'];
export type ChildResponse = Schemas['ChildResponse'];
export type ChildRequest = Schemas['ChildRequest'];
export type AddressResponse = Schemas['AddressResponse'];
export type AddressRequest = Schemas['AddressRequest'];
export type GeoPoint = Schemas['GeoPoint'];
export type SchoolSummary = Schemas['SchoolSummaryResponse'];
export type PlanResponse = Schemas['PlanResponse'];
export type CheckoutResponse = Schemas['CheckoutResponse'];
export type SubscriptionResponse = Schemas['SubscriptionResponse'];
export type LeaveDayResponse = Schemas['LeaveDayResponse'];
export type OrderResponse = Schemas['OrderResponse'];
export type OrderDetailResponse = Schemas['OrderDetailResponse'];
export type OrderStatus = Schemas['OrderResponse']['status'];
export type PickupCodeResponse = Schemas['PickupCodeResponse'];
export type TrackingSnapshot = Schemas['TrackingSnapshotResponse'];
export type NotificationResponse = Schemas['NotificationResponse'];
export type PaymentResponse = Schemas['PaymentResponse'];
export type InvoiceResponse = Schemas['InvoiceResponse'];

export type PartnerMe = Schemas['PartnerMeResponse'];
export type ShiftResponse = Schemas['ShiftResponse'];
export type TodayRoute = Schemas['TodayRouteResponse'];
export type StopView = Schemas['StopView'];
export type UploadUrlResponse = Schemas['UploadUrlResponse'];
export type EarningsSummary = Schemas['EarningsSummaryResponse'];
export type PayoutResponse = Schemas['PayoutResponse'];
export type PingInput = Schemas['PingInput'];
export type IssueType = Schemas['IssueRequest']['type'];

export type AdminOrder = Schemas['AdminOrderResponse'];
export type AdminPartner = Schemas['AdminPartnerResponse'];
export type SchoolResponse = Schemas['SchoolResponse'];
export type SchoolRequest = Schemas['SchoolRequest'];
export type DashboardResponse = Schemas['DashboardResponse'];

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
