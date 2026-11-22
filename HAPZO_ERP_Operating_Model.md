# HAPZO ERP + DPP operating model

Use this baseline when designing HAPZO screens, workflows, data models, integrations, and acceptance tests.

- HAPZO is a multi-company textile ERP and DPP SaaS platform. The shared architecture discussion prioritizes full in-house fibre-to-garment manufacturing.
- For buyer-order manufacturing, start from the buyer PO and its lines. Capture style, colour, size, quantities, delivery schedules, approved specifications, costing, and BOM revisions. Preserve approved revisions and the original buyer PO attachment.
- Use the order to plan materials, reserve stock or procure shortages, receive and inspect materials, and release production orders and job sheets. Use posted inventory and production transactions to record actual execution and derive order progress.
- Track material at the units used on the floor, including fibre and yarn lots, greige and finished fabric rolls, dye batches, cutting bundles, sewn garment lots, and packed cartons. Capture issues, consumption, outputs, waste, rejects, rework, and quality release. Where outside job work is used, record material sent, returned, and outstanding.
- Link actual inputs to outputs at each production step. Preserve lot splits, merges, quantities, and links across facilities. Keep order allocations by quantity so one PO line can be produced across several lots and one batch can serve several PO lines when appropriate.
- Follow the garment workflow through fabric inward, inspection and stores, cutting, bundle creation, optional embroidery or printing, stitching, quality check, finishing, final inspection, packing, warehouse, dispatch, and invoicing. Link packing and shipment records to PO lines and finished lots.
- Reuse the same posted records for costing, accounts, logistics, compliance evidence, and the DPP. Capture labour, machine, and resource data where applicable. Link IoT readings to the relevant machine and production run where attribution can be verified. Treat the 49 DPP points as the project mapping checklist and track regulatory applicability per field.
- Acceptance test. Fulfil one buyer PO line with two separately shipped lots. From either carton, trace back to its garment production, fabric, yarn, and fibre records. From any input lot, trace forward to all affected cartons and shipments.

Source: [Production Data Integration Mapping](https://chatgpt.com/share/6afee2e4-106c-83e8-9057-91adfbb1c859) and the follow-up HAPZO textile ERP discussion.
