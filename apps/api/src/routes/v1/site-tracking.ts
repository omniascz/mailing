/**
 * Site tracking routes (#201)
 *
 * Public endpoints (no auth — called by the JS snippet):
 *   POST /t/pv       — page view
 *   POST /t/ev       — custom event
 *   POST /t/id       — identify visitor (link to contact)
 *   GET  /t/script   — serve the tracker JS snippet (with site token substituted)
 *
 * Authenticated management endpoints:
 *   GET/POST/PUT/DELETE /api/v1/sites
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../services/tracking/site-tracker.js';
import { recordVisitorFingerprint } from '../../services/identity-resolution/index.js';
import { buildFingerprint } from '../../services/identity-resolution/pure.js';

const TRACKER_JS = /* javascript */ `
(function(w,d,t){
  'use strict';
  var FM = w.__fm = w.__fm || {};
  FM._q = FM._q || [];
  FM.siteToken = t;

  function getCookie(n){var m=document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)'));return m?m[2]:null;}
  function setCookie(n,v,days){var e=new Date();e.setTime(e.getTime()+days*864e5);document.cookie=n+'='+v+';expires='+e.toUTCString()+';path=/;SameSite=Lax';}
  function uuid(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c=='x'?r:(r&3|8)).toString(16)});}

  var VID_KEY='_fm_vid';
  var SID_KEY='_fm_sid';
  FM.visitorId = getCookie(VID_KEY) || (function(){var id=uuid();setCookie(VID_KEY,id,365);return id;})();
  FM.sessionId = getCookie(SID_KEY) || (function(){var id=uuid();setCookie(SID_KEY,id,1);return id;})();

  var BASE = '__API_BASE__';

  function send(path,data){
    var body=JSON.stringify(Object.assign({siteToken:FM.siteToken,visitorId:FM.visitorId,sessionId:FM.sessionId},data));
    if(navigator.sendBeacon){navigator.sendBeacon(BASE+path,new Blob([body],{type:'application/json'}));}
    else{fetch(BASE+path,{method:'POST',body:body,keepalive:true,headers:{'Content-Type':'application/json'}}).catch(function(){});}
  }

  FM.page = function(props){
    send('/t/pv',Object.assign({url:location.href,path:location.pathname,referrer:document.referrer,title:document.title},props||{}));
  };

  FM.track = function(event,props){
    send('/t/ev',{eventName:event,properties:props||{}});
  };

  FM.identify = function(email,traits){
    send('/t/id',{email:email,traits:traits||{}});
  };

  FM.revenue = function(orderId,amount,currency,items){
    send('/t/rev',{orderId:orderId,amount:amount,currency:currency||'USD',items:items||[]});
  };

  // Auto page view
  FM.page();

  // Expose global
  w.ForgeMsg = FM;
})(window,document,'__SITE_TOKEN__');
`;

const idParam = z.object({ id: z.string().uuid() });
const pageViewBody = z.object({
  siteToken: z.string().min(1),
  visitorId: z.string().min(1),
  sessionId: z.string().optional(),
  url: z.string().url(),
  path: z.string().optional(),
  referrer: z.string().optional(),
  title: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  contactId: z.string().uuid().optional(),
});

const eventBody = z.object({
  siteToken: z.string().min(1),
  visitorId: z.string().min(1),
  eventName: z.string().min(1).max(255),
  properties: z.record(z.unknown()).optional(),
  contactId: z.string().uuid().optional(),
});

const revenueBody = z.object({
  siteToken: z.string().min(1),
  visitorId: z.string().min(1),
  orderId: z.string().max(128).optional(),
  amount: z.number().nonnegative().max(10_000_000),
  currency: z.string().length(3).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().max(128),
        name: z.string().max(255),
        qty: z.number().int().min(1),
        price: z.number().nonnegative(),
      }),
    )
    .max(500)
    .optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  contactId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

const identifyBody = z.object({
  siteToken: z.string().min(1),
  visitorId: z.string().min(1),
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  traits: z.record(z.unknown()).optional(),
});

export default async function siteTrackingRoutes(app: FastifyInstance) {
  // ─── Public tracker endpoints (no auth) ──────────────────────────────────────

  app.post(
    '/t/pv',
    { schema: { tags: ['SiteTracking'], summary: 'Record page view' } },
    async (req, reply) => {
      try {
        const body = pageViewBody.parse(req.body);
        const result = await svc.recordPageView(body);

        // L3 fingerprint capture — best-effort, non-blocking. Extracts
        // non-PII features from request headers and stashes them onto
        // the anonymous_profiles row for the visitor so probabilistic
        // matching has something to compare against.
        const site = await svc.getSiteByToken(body.siteToken).catch(() => null);
        if (site) {
          const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
            ?? req.ip;
          const fp = buildFingerprint({
            ip,
            userAgent: req.headers['user-agent'],
            acceptLanguage: req.headers['accept-language'],
          });
          recordVisitorFingerprint(site.orgId, body.visitorId, fp).catch(() => {});
        }

        return reply.code(202).send(result);
      } catch {
        return reply.code(202).send({ ok: true }); // Never fail — 202 always
      }
    },
  );

  app.post(
    '/t/ev',
    { schema: { tags: ['SiteTracking'], summary: 'Record custom event' } },
    async (req, reply) => {
      try {
        const body = eventBody.parse(req.body);
        await svc.recordEvent(body);
      } catch {
        /* noop */
      }
      return reply.code(202).send({ ok: true });
    },
  );

  app.post(
    '/t/rev',
    { schema: { tags: ['SiteTracking'], summary: 'Record revenue event' } },
    async (req, reply) => {
      try {
        const body = revenueBody.parse(req.body);
        const result = await svc.recordRevenueEvent(body);
        return reply.code(202).send(result);
      } catch {
        return reply.code(202).send({ ok: true });
      }
    },
  );

  app.post(
    '/t/id',
    { schema: { tags: ['SiteTracking'], summary: 'Identify visitor' } },
    async (req, reply) => {
      try {
        const body = identifyBody.parse(req.body);
        const result = await svc.identifyVisitor(body);
        return reply.code(200).send(result);
      } catch {
        return reply.code(200).send({ contactId: null });
      }
    },
  );

  app.get(
    '/t/script/:siteToken',
    { schema: { tags: ['SiteTracking'], summary: 'Serve tracker JS for a site token' } },
    async (req, reply) => {
      const { siteToken } = z.object({ siteToken: z.string() }).parse(req.params);
      const apiBase = process.env.API_PUBLIC_URL ?? '';
      const js = TRACKER_JS.replace('__SITE_TOKEN__', siteToken).replace('__API_BASE__', apiBase);
      // Cache 5 min at the edge + browser. Updates roll out within 5 min
      // of a backend deploy without forcing every page-load to re-fetch.
      return reply
        .type('application/javascript')
        .header('Cache-Control', 'public, max-age=300, s-maxage=300')
        .send(js);
    },
  );

  // ─── Authenticated site management ────────────────────────────────────────────

  const createSiteSchema = z.object({
    domain: z.string().min(1).max(253),
    name: z.string().max(255).optional(),
    crossDomainSync: z.boolean().optional(),
  });

  const updateSiteSchema = z.object({
    name: z.string().max(255).optional(),
    trackingEnabled: z.boolean().optional(),
    crossDomainSync: z.boolean().optional(),
  });

  app.get(
    '/api/v1/sites',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteTracking'], summary: 'List tracked sites' },
    },
    async (req) => ({ data: await svc.listSites(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/sites',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteTracking'], summary: 'Add tracked site' },
    },
    async (req, reply) => {
      const body = createSiteSchema.parse(req.body);
      return reply.code(201).send({ data: await svc.createSite(req.user!.orgId, body) });
    },
  );

  app.put(
    '/api/v1/sites/:id',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteTracking'], summary: 'Update tracked site' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.updateSite(req.user!.orgId, id, updateSiteSchema.parse(req.body)) };
    },
  );

  app.delete(
    '/api/v1/sites/:id',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteTracking'], summary: 'Delete tracked site' },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteSite(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/contacts/:contactId/page-views',
    {
      preHandler: app.requireAuth,
      schema: { tags: ['SiteTracking'], summary: 'Get contact page views' },
    },
    async (req) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return { data: await svc.getContactPageViews(req.user!.orgId, contactId) };
    },
  );
}
