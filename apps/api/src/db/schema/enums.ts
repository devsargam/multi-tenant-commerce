import { pgEnum } from "drizzle-orm/pg-core";

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

export const inventoryMovementReason = pgEnum("inventory_movement_reason", [
  "purchase",
  "sale",
  "adjustment",
  "return",
  "transfer",
]);

export const cartStatus = pgEnum("cart_status", [
  "active",
  "abandoned",
  "converted",
]);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "fulfilled",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "authorized",
  "paid",
  "partially_refunded",
  "refunded",
  "failed",
]);

export const fulfillmentStatus = pgEnum("fulfillment_status", [
  "unfulfilled",
  "partial",
  "fulfilled",
]);

export const paymentRecordStatus = pgEnum("payment_record_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
]);

export const paymentMethod = pgEnum("payment_method", [
  "card",
  "paypal",
  "bank",
  "cod",
  "other",
]);

export const shipmentStatus = pgEnum("shipment_status", [
  "pending",
  "in_transit",
  "delivered",
  "returned",
]);

export const shippingRateType = pgEnum("shipping_rate_type", [
  "flat",
  "weight",
  "price_based",
]);

export const discountType = pgEnum("discount_type", [
  "percentage",
  "fixed_amount",
  "free_shipping",
]);

export const discountAppliesTo = pgEnum("discount_applies_to", [
  "all",
  "products",
  "categories",
]);

export const reviewStatus = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);

export const adminRole = pgEnum("admin_role", [
  "owner",
  "admin",
  "manager",
  "staff",
]);

export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
]);

export const orderEventType = pgEnum("order_event_type", [
  "created",
  "paid",
  "fulfilled",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "note",
]);
