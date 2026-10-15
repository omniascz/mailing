-- Z163. Michal, 15. 10. 19:40, point 1c a)+b)+c): the shop's informational
-- e-mails in a flow (order confirmation — of an unpaid order too — shipped,
-- delivered, the call to pay, the pickup code, the invoice) are transactional,
-- and the flows already made from the templates are migrated: only the
-- priority of their informational nodes is re-marked, nothing else.
--
-- The seven nodes are the ones workflow-templates/registry.ts marks with
-- `transactional(...)` (unit test registry-transactional.test.ts holds the two
-- lists equal): transactional-order-confirmation e1, post-purchase-cs e1–e3
-- (purchase_event), payment-pending-cs e1, pickup-invoice-cs e1, e2
-- (api_event). On payment_pending / pickup_ready the priority changes nothing
-- until those names join the trigger list (Z164; Michal, point 1d: a 403 for
-- the publishable key first) — measured in Z163. The hidden templates are not
-- here: four of their nodes send an informational subject with a marketing
-- body or the other way round (Z162), which waits on Michal; none of their
-- nodes matches a row below (registry-transactional.test.ts checks it).
--
-- A fork (POST /api/v1/workflow-templates/:slug/fork) keeps the template's
-- trigger, node ids, subjects and `builtInTemplateId`, and points `templateId`
-- at the organisation's copy of that built-in e-mail, which cloneBuiltInTemplate
-- finds again by name (no column records where a copy came from). So a node is
-- the template's node when ALL of these hold:
--   (i)   workflows.trigger_type is the template's trigger (api_event: and
--         trigger_config.eventName is the template's event name);
--   (ii)  the node has the template node's id and type send_email;
--   (iii) config.builtInTemplateId is that node's e-mail;
--   (iv)  config.subject is byte for byte the template node's subject;
--   (v)   config.templateId is a live template of the same organisation named
--         like that built-in e-mail and created no later than the flow — the
--         copy the fork made or reused. (The web editor cannot change
--         templateId; PUT /workflows can. A swap to another e-mail fails the
--         name, a swap to a row made after the fork fails the date.);
--   (vi)  config.priority is not set.
-- A flow is changed only when every informational node of its template holds
-- all six: a fork whose subject was edited, whose e-mail was swapped or whose
-- informational node was deleted is left exactly as it is, and so is a flow
-- that already has a priority on any of them, which makes this idempotent.
-- Nothing but the `priority` key of those nodes is written: no other key, no
-- other column (updated_at included).
--
-- No schema object changes, so drizzle's snapshot does not either (as 0006).
--
-- Locks: RowExclusiveLock on workflows and AccessShareLock on templates for
-- the migration transaction; row locks only on the flows it re-marks, which
-- hold off a concurrent UPDATE of those rows (the executor's run counters)
-- until commit. Reads are never blocked. Measured in Z163.
WITH info (slug, trigger_type, event_name, node_id, built_in_id, subject, email_name) AS (
  VALUES
    ('transactional-order-confirmation', 'purchase_event', NULL, 'e1', 'tx-001', 'Order #{{order.id}} — receipt + delivery ETA', 'Order Confirmation'),
    ('post-purchase-cs', 'purchase_event', NULL, 'e1', 'cs-order-confirm', 'Objednávka {{order.number|default:"č. —"}} přijata', 'Potvrzení objednávky'),
    ('post-purchase-cs', 'purchase_event', NULL, 'e2', 'cs-shipping-tracking', 'Zásilka {{shipment.tracking_number|default:"—"}} je na cestě', 'Zásilka je na cestě'),
    ('post-purchase-cs', 'purchase_event', NULL, 'e3', 'cs-delivered', 'Zásilka {{shipment.tracking_number|default:"—"}} je doručena', 'Zásilka doručena'),
    ('payment-pending-cs', 'api_event', 'payment_pending', 'e1', 'cs-payment-pending', 'Objednávka {{order.number|default:"—"}} čeká na zaplacení', 'Čeká na platbu převodem'),
    ('pickup-invoice-cs', 'api_event', 'pickup_ready', 'e1', 'cs-pickup-ready', 'Zásilka čeká na {{pickup.point_name|default:"výdejním místě"}}', 'Připraveno na výdejním místě'),
    ('pickup-invoice-cs', 'api_event', 'pickup_ready', 'e2', 'cs-invoice', 'Faktura {{invoice.number|default:"—"}} k objednávce {{order.number|default:"—"}}', 'Faktura — oznámení')
),
matched AS (
  SELECT w.id AS workflow_id, i.slug, i.node_id, n.ord
  FROM workflows w
  JOIN info i
    ON w.trigger_type::text = i.trigger_type
   AND (i.event_name IS NULL OR w.trigger_config ->> 'eventName' = i.event_name)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.nodes) = 'array' THEN w.nodes ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS n (node, ord)
  WHERE n.node ->> 'id' = i.node_id
    AND n.node ->> 'type' = 'send_email'
    AND jsonb_typeof(n.node -> 'config') = 'object'
    AND n.node -> 'config' ->> 'builtInTemplateId' = i.built_in_id
    AND n.node -> 'config' ->> 'subject' = i.subject
    AND NOT (n.node -> 'config' ? 'priority')
    AND EXISTS (
      SELECT 1
      FROM templates t
      WHERE t.id::text = n.node -> 'config' ->> 'templateId'
        AND t.org_id = w.org_id
        AND t.name = i.email_name
        AND t.deleted_at IS NULL
        AND t.created_at <= w.created_at
    )
),
whole AS (
  SELECT m.workflow_id, m.slug
  FROM matched m
  GROUP BY m.workflow_id, m.slug
  HAVING count(DISTINCT m.node_id) = (SELECT count(*) FROM info i WHERE i.slug = m.slug)
     AND count(*) = count(DISTINCT m.node_id)
)
UPDATE workflows w
SET nodes = (
  SELECT jsonb_agg(
           CASE
             WHEN n.ord IN (
               SELECT m.ord
               FROM matched m
               JOIN whole h ON h.workflow_id = m.workflow_id AND h.slug = m.slug
               WHERE m.workflow_id = w.id
             )
               THEN jsonb_set(n.node, '{config,priority}', '"transactional"')
             ELSE n.node
           END
           ORDER BY n.ord
         )
  FROM jsonb_array_elements(w.nodes) WITH ORDINALITY AS n (node, ord)
)
WHERE w.id IN (SELECT workflow_id FROM whole);
