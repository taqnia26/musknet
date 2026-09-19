UPDATE "storefront_order_items" AS oi
SET "cost_snapshot" = movement."unit_cost"
FROM "inventory_movements" AS movement
WHERE oi."order_id"::text = movement."source_id"
  AND movement."source_type" = 'order'
  AND movement."event_key" = concat('sale-fulfillment:', oi."order_id", ':', oi."product_id")
  AND movement."unit_cost" IS NOT NULL
  AND oi."cost_snapshot" = 0;