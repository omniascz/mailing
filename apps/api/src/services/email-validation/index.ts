/**
 * Email Validation Service
 *
 * Performs multi-layer validation and returns a score (0–100):
 *   - Syntax check (fatal if fails)
 *   - Disposable domain detection (-50)
 *   - Role-based prefix detection (-20)
 *   - MX record lookup (-30 if missing, optional, 3 s timeout)
 */

import dns from 'node:dns/promises';

// Representative sample of disposable / throwaway email domains.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '10minutemail.org',
  '20minutemail.com', 'guerrillamail.com', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.info', 'guerrillmail.com', 'sharklasers.com',
  'spam4.me', 'grr.la', 'guerrillamailblock.com', 'yopmail.com',
  'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc',
  'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf',
  'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'mailnull.com', 'spamgourmet.com', 'spamgourmet.net',
  'spamgourmet.org', 'throwam.com', 'throwam.net',
  'throwam.org', 'trashmail.com', 'trashmail.at', 'trashmail.io',
  'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmail.xyz',
  'dispostable.com', 'disposableemailaddresses.com', 'disposeamail.com',
  'mailinator.com', 'mailinator.net', 'mailinator.org',
  'mailinator2.com', 'trashdevil.com', 'trashdevil.de',
  'mailin8r.com', 'mailnew.com', 'mailnew.org',
  'tempail.com', 'tempr.email', 'temp-mail.org', 'temp-mail.ru',
  'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmail.org',
  'discard.email', 'discardmail.com', 'discardmail.de',
  'spamex.com', 'spamfree24.org', 'spamfree.eu', 'fakeinbox.com',
  'fakeinbox.net', 'fakemail.net', 'fakemail.org', 'throwam.com',
  'mailforspam.com', 'spamkill.info', 'spam.la', 'antispam.de',
  'bspam.mobi', 'killmail.com', 'killmail.net', 'klzlk.com',
  'maildrop.cc', 'maildrops.cc', 'mailfall.com', 'mailfreeonline.com',
  'mailhazard.com', 'mailimate.com', 'mailinater.com', 'mailme.lv',
  'mailme24.com', 'mailmetrash.com', 'mailmoat.com', 'mailnesia.com',
  'mailnull.com', 'mailpick.biz', 'mailproxsy.com', 'mailquack.com',
  'mailrock.biz', 'mailseal.de', 'mailshell.com', 'mailsiphon.com',
  'mailslapping.com', 'mailslite.com', 'mailspam.me', 'mailspam.xyz',
  'mailspot.xyz', 'mailtothis.com', 'mailzilla.com', 'mailzilla.org',
  'makemetheking.com', 'moncourrier.fr.nf', 'monemail.fr.nf',
  'monmail.fr.nf', 'moza.pl', 'mt2009.com', 'mt2014.com',
  'myspamless.com', 'mytrashmail.com', 'netmails.com', 'netmails.net',
  'netzidiot.de', 'nnot.net', 'no-spam.ws', 'nobulk.com',
  'noclickemail.com', 'nogmailspam.info', 'nomail.pw',
  'nospam.ze.tc', 'nospamfor.us', 'nospammail.net', 'notmailinator.com',
  'objectmail.com', 'obobbo.com', 'oneoffmail.com', 'onewaymail.com',
  'pjjkp.com', 'plexolan.de', 'pookmail.com', 'powered.name',
  'privacy.net', 'proxymail.eu', 'prtnx.com', 'punkass.com',
  'putthisinyourspamdatabase.com', 'qq.com', 'quickinbox.com',
  'rcpt.at', 'reallymymail.com', 'recode.me', 'recursor.net',
  'reliable-mail.com', 'rid.me', 'risingsuntouch.com', 'rklips.com',
  'rmqkr.net', 'ro.lt', 'runbox.com', 's0ny.net', 'safe-mail.net',
  'safetymail.info', 'safetypost.de', 'samy.pl', 'sandelf.de',
  'saynotospams.com', 'schafmail.de', 'schrott-email.de',
  'schwarzmail.de', 'seaprice.co.uk', 'secretemail.de', 'secure-mail.biz',
  'seekapps.com', 'sendingspecialflyers.com', 'sesmail.com',
  'sharedmailbox.org', 'sharklasers.com', 'shiftmail.com',
  'shhmail.com', 'shieldedmail.com', 'shieldemail.com', 'shitmail.de',
  'shitmail.me', 'shitmail.org', 'shitware.nl', 'shmeriously.com',
  'shortmail.net', 'shot.com.ua', 'sibmail.com', 'sinnlos-mail.de',
  'slapsfromlastnight.com', 'slaskpost.se', 'slavapim.com',
  'slopsbox.com', 'smellfear.com', 'smwg.info', 'snakemail.com',
  'sneakemail.com', 'sneakmail.de', 'snkmail.com', 'socam.me',
  'sofort-mail.de', 'sogetthis.com', 'sohai.ml', 'sohu.com',
  'soisz.com', 'solar-impact.pro', 'soon.it', 'sovsoplya.com',
  'spacebazzar.ru', 'spam.care', 'spam.dk',
  'spamavert.com', 'spambog.com', 'spambog.de', 'spambog.ru',
  'spambox.info', 'spambox.irishspringrealty.com', 'spambox.us',
  'spamcannon.com', 'spamcannon.net', 'spamcero.com', 'spamcon.org',
  'spamcorptastic.com', 'spamcowboy.com', 'spamcowboy.net',
  'spamcowboy.org', 'spamday.com', 'spamdecoy.net', 'spame.com',
  'spamex.com', 'spamfree.eu', 'spamfree24.org', 'spamgoes.in',
  'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'spamherelots.com', 'spamhereplease.com', 'spamhole.com',
  'spamify.com', 'spaminator.de', 'spamkill.info', 'spaml.com',
  'spaml.de', 'spammotel.com', 'spammy.host', 'spamoff.de',
  'spamslicer.com', 'spamspot.com', 'spamstack.net', 'spamthis.co.uk',
  'spamthisplease.com', 'spamtrail.com', 'spamtroll.net',
  'spamwc.de', 'spamwc.net', 'spamwc.org',
  'speedymail.org', 'spikio.com', 'spoofmail.de', 'spotiters.com',
  'sry.li', 'ssl-mail.com', 'suicidesquad.lol', 'super-auswahl.de',
  'supergreatmail.com', 'supermailer.jp', 'superrito.com',
  'superstachel.de', 'suremail.info', 'svk.jp',
]);

// Role/function account prefixes that are unlikely to be personal inboxes.
const ROLE_PREFIXES = new Set([
  'abuse', 'accounting', 'accounts', 'admin', 'administrator', 'ads',
  'alert', 'alerts', 'all', 'billing', 'bounce', 'bounces', 'bulk',
  'business', 'career', 'careers', 'ceo', 'cfm', 'cfo', 'cio', 'cmo',
  'contact', 'contacts', 'coo', 'cto', 'cust-serv', 'customer-service',
  'customercare', 'customersupport', 'customerservice', 'demo',
  'devnull', 'do-not-reply', 'do.not.reply', 'donotreply',
  'email', 'errors', 'events', 'everybody',  'faq', 'feedback',
  'finance', 'forum', 'general', 'helo', 'hello', 'help', 'helpdesk',
  'hostmaster', 'hr', 'info', 'inquiries', 'inquiry', 'it',
  'jobs', 'junk', 'legal', 'list', 'listmaster', 'lists',
  'mail', 'maildaemon', 'mailer', 'mailer-daemon', 'mailerdaemon',
  'marketing', 'media', 'members', 'memberservices', 'news',
  'newsletter', 'newsletters', 'no.reply', 'no_reply', 'nobody',
  'noc', 'noreply', 'notify', 'null', 'office', 'operator',
  'orders', 'owner', 'partner', 'partners', 'partnerships',
  'postbox', 'postmaster', 'press', 'privacy', 'pr', 'purchasing',
  'recruitment', 'registrar', 'registration', 'reply',
  'root', 'sales', 'security', 'service', 'services', 'shop',
  'signup', 'spam', 'staff', 'store', 'support', 'sysadmin',
  'team', 'tech', 'techsupport', 'test', 'testing', 'unsubscribe',
  'usenet', 'uucp', 'web', 'webmaster', 'webteam', 'www',
]);

export interface EmailValidationResult {
  score: number;
  reasons: string[];
  isValid: boolean;
  isDisposable: boolean;
  isRoleBased: boolean;
  hasMx: boolean | null;
}

export interface ValidateEmailOpts {
  /** Perform MX DNS lookup. Default: true. */
  checkMx?: boolean;
}

export async function validateEmail(
  email: string,
  opts: ValidateEmailOpts = {},
): Promise<EmailValidationResult> {
  const checkMx = opts.checkMx !== false;
  const reasons: string[] = [];

  // 1. Syntax check — fast, synchronous, fatal if invalid.
  const syntaxOk =
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) &&
    email.length <= 254;

  if (!syntaxOk) {
    return { score: 0, reasons: ['invalid_syntax'], isValid: false, isDisposable: false, isRoleBased: false, hasMx: null };
  }

  const [localPart, domain] = email.toLowerCase().split('@') as [string, string];

  let score = 100;
  let isDisposable = false;
  let isRoleBased = false;
  let hasMx: boolean | null = null;

  // 2. Disposable domain check.
  if (DISPOSABLE_DOMAINS.has(domain)) {
    isDisposable = true;
    score -= 50;
    reasons.push('disposable_domain');
  }

  // 3. Role-based prefix check.
  if (ROLE_PREFIXES.has(localPart)) {
    isRoleBased = true;
    score -= 20;
    reasons.push('role_based');
  }

  // 4. MX lookup (optional, async, 3 s timeout).
  if (checkMx && !isDisposable) {
    try {
      const records = await Promise.race([
        dns.resolveMx(domain),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000),
        ),
      ]);
      hasMx = Array.isArray(records) && records.length > 0;
      if (!hasMx) {
        score -= 30;
        reasons.push('no_mx_record');
      }
    } catch {
      hasMx = false;
      score -= 30;
      reasons.push('mx_lookup_failed');
    }
  }

  const finalScore = Math.max(0, score);
  return {
    score: finalScore,
    reasons,
    isValid: finalScore > 0,
    isDisposable,
    isRoleBased,
    hasMx,
  };
}

/**
 * Synchronous-only validation (syntax + disposable + role).
 * Use this for batch operations where MX lookups are too slow.
 */
export function validateEmailSync(email: string): Omit<EmailValidationResult, 'hasMx'> & { hasMx: null } {
  const reasons: string[] = [];

  const syntaxOk =
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) &&
    email.length <= 254;

  if (!syntaxOk) {
    return { score: 0, reasons: ['invalid_syntax'], isValid: false, isDisposable: false, isRoleBased: false, hasMx: null };
  }

  const [localPart, domain] = email.toLowerCase().split('@') as [string, string];

  let score = 100;
  let isDisposable = false;
  let isRoleBased = false;

  if (DISPOSABLE_DOMAINS.has(domain)) {
    isDisposable = true;
    score -= 50;
    reasons.push('disposable_domain');
  }

  if (ROLE_PREFIXES.has(localPart)) {
    isRoleBased = true;
    score -= 20;
    reasons.push('role_based');
  }

  return { score: Math.max(0, score), reasons, isValid: score > 0, isDisposable, isRoleBased, hasMx: null };
}
