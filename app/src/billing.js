// app/src/billing.js
import express from "express";

export default function setupBilling(app, q, stripe) {
  // --- Checkout: create Stripe subscription session ---
  app.post("/billing/checkout", async (req, res) => {
    try {
      const planReq = (req.body?.plan || "pro").toLowerCase();
      const priceId =
        planReq === "pro_plus"
          ? process.env.STRIPE_PRICE_PRO_PLUS
          : process.env.STRIPE_PRICE_PRO;

      if (!priceId) {
        return res.status(500).json({ ok: false, error: "price not configured" });
      }

      // Load or create Stripe customer for this tenant
      const cur = await q(
        `SELECT stripe_customer_id FROM tenants WHERE tenant_id=$1`,
        [req.user.tenant_id]
      );
      let customer = cur.rows?.[0]?.stripe_customer_id || null;

      if (!customer) {
        const c = await stripe.customers.create({
          name: req.user?.tenant_id || "Tenant",
          metadata: { tenant_id: req.user.tenant_id },
        });
        customer = c.id;
        await q(
          `UPDATE tenants SET stripe_customer_id=$2 WHERE tenant_id=$1`,
          [req.user.tenant_id, customer]
        );
      }

      const base = (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "").replace(/\/$/, "");
      const success = `${base || ""}/billing/success`;
      const cancel  = `${base || ""}/billing/cancel`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        success_url: success || undefined,
        cancel_url: cancel || undefined,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { tenant_id: req.user.tenant_id, plan: planReq },
      });

      return res.json({ ok: true, url: session.url });
    } catch (e) {
      console.error("checkout failed", e);
      return res.status(500).json({ ok: false, error: "checkout failed" });
    }
  });

  // --- Billing Portal: manage subscription ---
  app.get("/billing/portal", async (req, res) => {
    try {
      const cur = await q(
        `SELECT stripe_customer_id FROM tenants WHERE tenant_id=$1`,
        [req.user.tenant_id]
      );
      let customer = cur.rows?.[0]?.stripe_customer_id || null;

      if (!customer) {
        const c = await stripe.customers.create({
          name: req.user?.tenant_id || "Tenant",
          metadata: { tenant_id: req.user.tenant_id },
        });
        customer = c.id;
        await q(
          `UPDATE tenants SET stripe_customer_id=$2 WHERE tenant_id=$1`,
          [req.user.tenant_id, customer]
        );
      }

      const returnUrl = (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "").replace(/\/$/, "") + "/billing";
      const sess = await stripe.billingPortal.sessions.create({
        customer,
        return_url: returnUrl || undefined,
      });

      return res.json({ ok: true, url: sess.url });
    } catch (e) {
      console.error("portal failed", e);
      return res.status(500).json({ ok: false, error: "portal failed" });
    }
  });

  // --- Webhook: Stripe subscription events ---
  // NOTE: This route must receive the raw body. index.js should avoid JSON parsing for this path.
  app.post(
    "/billing/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const sig = req.headers["stripe-signature"];
      let event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        console.error("webhook bad signature", err?.message || err);
        return res.status(400).send("bad signature");
      }

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const sess = event.data.object;
            const tenantId = sess.metadata?.tenant_id;
            const customerId = sess.customer;
            if (tenantId && customerId) {
              await q(
                `UPDATE tenants SET stripe_customer_id=$2 WHERE tenant_id=$1`,
                [tenantId, customerId]
              );
            }
            break;
          }
          case "customer.subscription.created":
          case "customer.subscription.updated":
          case "customer.subscription.deleted": {
            const sub = event.data.object;
            const customerId = sub.customer;
            const status = sub.status;
            // Try to map tenant via customer metadata (fallback via DB)
            let tenantRow = null;
            try {
              const c = await stripe.customers.retrieve(customerId);
              const tid = c?.metadata?.tenant_id;
              if (tid) {
                tenantRow = { tenant_id: tid };
              }
            } catch (_e) {}

            if (!tenantRow) {
              const r = await q(
                `SELECT tenant_id FROM tenants WHERE stripe_customer_id=$1 LIMIT 1`,
                [customerId]
              );
              tenantRow = r.rows?.[0];
            }

            if (tenantRow?.tenant_id) {
              await q(
                `UPDATE tenants SET billing_status=$2 WHERE tenant_id=$1`,
                [tenantRow.tenant_id, status]
              );
            }
            break;
          }
          default:
            // Ignore other events for now
            break;
        }
        return res.json({ received: true });
      } catch (e) {
        console.error("webhook handler error", e);
        return res.status(500).send("webhook error");
      }
    }
  );

  // --- Admin sync: super users can backfill billing state ---
  app.post("/admin/billing/sync", async (req, res) => {
    try {
      const tid = req.user.tenant_id;
      const cur = await q(
        `SELECT stripe_customer_id FROM tenants WHERE tenant_id=$1`,
        [tid]
      );
      const customer = cur.rows?.[0]?.stripe_customer_id;
      if (!customer) {
        return res
          .status(400)
          .json({ ok: false, error: "no stripe_customer_id on tenant" });
      }

      const subs = await stripe.subscriptions.list({
        customer,
        status: "all",
        limit: 1,
      });

      if (!subs.data?.length) {
        return res.json({ ok: true, updated: false });
      }

      const sub = subs.data[0];
      const status = sub.status;
      const priceId = sub.items?.data?.[0]?.price?.id || null;

      await q(`UPDATE tenants SET billing_status=$2 WHERE tenant_id=$1`, [
        tid,
        status,
      ]);

      return res.json({ ok: true, billing_status: status, price_id: priceId });
    } catch (e) {
      console.error("admin billing sync failed", e);
      return res.status(500).json({ ok: false, error: "sync failed" });
    }
  });
}