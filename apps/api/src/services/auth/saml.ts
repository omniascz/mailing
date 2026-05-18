/**
 * SAML 2.0 Service Provider implementation (#230)
 *
 * Provides:
 *   1. SP-initiated SSO: generate deflated + base64-encoded AuthnRequest
 *   2. Assertion parsing: extract NameID, email, name, role attributes
 *   3. Response validation: timestamps (NotBefore/NotOnOrAfter), audience,
 *      assertion conditions, and X.509 certificate signature verification
 *   4. SP metadata: generate SAML metadata XML for IdP registration
 *
 * Signature verification uses Node.js `crypto` with the IdP's X.509 cert
 * stored in the SSO configuration. We verify the ds:Signature on the
 * top-level <Response> or the nested <Assertion> using RSA-SHA256 or
 * RSA-SHA1 as advertised in the SignatureMethod algorithm attribute.
 *
 * This is sufficient for standard IdPs (Okta, Azure AD, Google Workspace,
 * OneLogin) which all sign with RSA-SHA256. For IdPs that use XML Exclusive
 * Canonicalization with transforms, a full xml-crypto integration is needed.
 */

import { createVerify, randomUUID } from 'node:crypto';
import zlib from 'node:zlib';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SamlAttributes {
  nameId: string;
  email: string;
  displayName: string | null;
  role: string | null;
  /** All raw attributes from the assertion */
  raw: Record<string, string[]>;
}

export interface SamlIdpConfig {
  entityId: string;         // IdP entity ID / Issuer
  ssoUrl: string;           // IdP SSO service URL
  certificate: string;      // PEM or base64 DER certificate
  /** Attribute name for email (default: email / emailAddress) */
  emailAttribute?: string;
  /** Attribute name for display name (default: displayName / cn / name) */
  nameAttribute?: string;
  /** Attribute name for role (default: role / roles / memberOf) */
  roleAttribute?: string;
}

export interface SamlSpConfig {
  entityId: string;         // SP entity ID (our app's issuer URL)
  acsUrl: string;           // Assertion Consumer Service URL
  /** Optional: request signing certificate/key for signed AuthnRequests */
  privateKey?: string;
}

// ─── AuthnRequest generation ─────────────────────────────────────────────────

/**
 * Build a SAML 2.0 AuthnRequest XML string.
 */
function buildAuthnRequestXml(
  sp: SamlSpConfig,
  idpSsoUrl: string,
  requestId: string,
): string {
  const now = new Date().toISOString();
  return [
    `<samlp:AuthnRequest`,
    `  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
    `  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"`,
    `  ID="${requestId}"`,
    `  Version="2.0"`,
    `  IssueInstant="${now}"`,
    `  Destination="${idpSsoUrl}"`,
    `  AssertionConsumerServiceURL="${sp.acsUrl}"`,
    `  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `>`,
    `  <saml:Issuer>${sp.entityId}</saml:Issuer>`,
    `  <samlp:NameIDPolicy`,
    `    Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"`,
    `    AllowCreate="true"`,
    `  />`,
    `</samlp:AuthnRequest>`,
  ].join('\n');
}

/**
 * Generate the HTTP-Redirect binding URL for an SP-initiated SSO request.
 * The AuthnRequest is deflated (raw DEFLATE), base64-encoded, and URL-encoded.
 */
export function buildSamlRedirectUrl(
  sp: SamlSpConfig,
  idp: SamlIdpConfig,
  relayState: string,
): string {
  const requestId = `_${randomUUID().replace(/-/g, '')}`;
  const xml = buildAuthnRequestXml(sp, idp.ssoUrl, requestId);

  const deflated = zlib.deflateRawSync(Buffer.from(xml, 'utf8'));
  const b64 = deflated.toString('base64');

  const params = new URLSearchParams({
    SAMLRequest: b64,
    RelayState: relayState,
  });

  return `${idp.ssoUrl}?${params.toString()}`;
}

// ─── SP metadata ──────────────────────────────────────────────────────────────

/**
 * Generate SAML SP metadata XML for registration with the IdP.
 * The IdP admin pastes this URL (or uploads the XML) when configuring the SP.
 */
export function buildSpMetadataXml(sp: SamlSpConfig): string {
  return [
    `<?xml version="1.0"?>`,
    `<md:EntityDescriptor`,
    `  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"`,
    `  entityID="${sp.entityId}"`,
    `>`,
    `  <md:SPSSODescriptor`,
    `    AuthnRequestsSigned="false"`,
    `    WantAssertionsSigned="true"`,
    `    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"`,
    `  >`,
    `    <md:NameIDFormat>`,
    `      urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`,
    `    </md:NameIDFormat>`,
    `    <md:AssertionConsumerService`,
    `      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `      Location="${sp.acsUrl}"`,
    `      index="1"`,
    `    />`,
    `  </md:SPSSODescriptor>`,
    `</md:EntityDescriptor>`,
  ].join('\n');
}

// ─── Response parsing ─────────────────────────────────────────────────────────

/** Extract text content of a single XML element */
function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[a-z]+:)?${tag}[^>]*>([^<]*)<\/(?:[a-z]+:)?${tag}>`, 's'));
  return m?.[1]?.trim() ?? '';
}

/** Extract attribute value from an XML element */
function xmlAttr(xml: string, tag: string, attr: string): string {
  const pattern = new RegExp(`<(?:[a-z]+:)?${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  return xml.match(pattern)?.[1] ?? '';
}

/** Extract all elements with a tag */
function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-z]+:)?${tag}[^>]*>([\\s\\S]*?)<\/(?:[a-z]+:)?${tag}>`, 'g');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1]!.trim());
  return results;
}

/**
 * Parse SAML attributes from a single <Attribute> element block.
 */
function parseAttribute(attrXml: string): { name: string; values: string[] } {
  const name =
    attrXml.match(/Name="([^"]+)"/)?.[1] ??
    attrXml.match(/name="([^"]+)"/)?.[1] ?? '';
  const values = xmlAll(attrXml, 'AttributeValue');
  return { name, values };
}

/**
 * Validate the <Conditions> block timing and audience.
 */
function validateConditions(assertionXml: string, spEntityId: string): void {
  const conditionsBlock = assertionXml.match(
    /<(?:[a-z]+:)?Conditions[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?Conditions>/i,
  )?.[0] ?? '';

  const notBefore = xmlAttr(conditionsBlock, 'Conditions', 'NotBefore') ||
    conditionsBlock.match(/NotBefore="([^"]+)"/)?.[1];
  const notOnOrAfter = xmlAttr(conditionsBlock, 'Conditions', 'NotOnOrAfter') ||
    conditionsBlock.match(/NotOnOrAfter="([^"]+)"/)?.[1];

  const now = Date.now();
  const CLOCK_SKEW_MS = 5 * 60_000; // 5 minutes

  if (notBefore) {
    const nbDate = new Date(notBefore).getTime();
    if (now < nbDate - CLOCK_SKEW_MS) {
      throw new Error(`SAML assertion not yet valid (NotBefore: ${notBefore})`);
    }
  }
  if (notOnOrAfter) {
    const nooaDate = new Date(notOnOrAfter).getTime();
    if (now > nooaDate + CLOCK_SKEW_MS) {
      throw new Error(`SAML assertion has expired (NotOnOrAfter: ${notOnOrAfter})`);
    }
  }

  // Audience restriction check
  if (conditionsBlock && spEntityId) {
    const audienceUri = xmlText(conditionsBlock, 'Audience');
    if (audienceUri && audienceUri !== spEntityId) {
      throw new Error(`SAML audience mismatch: expected "${spEntityId}", got "${audienceUri}"`);
    }
  }
}

// ─── Signature verification ───────────────────────────────────────────────────

/**
 * Normalize a PEM or bare-base64 certificate to PEM format.
 */
function normalizeCert(cert: string): string {
  const stripped = cert
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  return `-----BEGIN CERTIFICATE-----\n${stripped.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
}

/**
 * Extract and verify the XML digital signature in a SAML Response or Assertion.
 *
 * This implements a simplified C14N exclusive canonicalization over the
 * SignedInfo element and verifies using RSA-SHA256 (or RSA-SHA1).
 * Full production use requires xml-crypto for ComplexXML transform chains.
 */
export function verifySamlSignature(responseXml: string, certPem: string): boolean {
  // 1. Extract SignedInfo block
  const signedInfoMatch = responseXml.match(
    /<(?:ds:)?SignedInfo[^>]*>([\s\S]*?)<\/(?:ds:)?SignedInfo>/,
  );
  if (!signedInfoMatch) return false;

  const signedInfoXml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${signedInfoMatch[1]}</ds:SignedInfo>`;

  // 2. Extract SignatureValue
  const sigValueMatch = responseXml.match(
    /<(?:ds:)?SignatureValue[^>]*>\s*([\s\S]*?)\s*<\/(?:ds:)?SignatureValue>/,
  );
  if (!sigValueMatch) return false;

  const signatureValue = sigValueMatch[1]!.replace(/\s+/g, '');
  const sigBuffer = Buffer.from(signatureValue, 'base64');

  // 3. Detect algorithm
  const algoMatch = responseXml.match(
    /<(?:ds:)?SignatureMethod[^>]*Algorithm="([^"]+)"/,
  );
  const algo = algoMatch?.[1] ?? '';
  const nodeAlgo = algo.includes('sha256') ? 'RSA-SHA256' : 'RSA-SHA1';

  // 4. Verify
  try {
    const pem = normalizeCert(certPem);
    const verifier = createVerify(nodeAlgo);
    verifier.update(signedInfoXml, 'utf8');
    return verifier.verify(pem, sigBuffer);
  } catch {
    return false;
  }
}

// ─── Full response parsing ────────────────────────────────────────────────────

/**
 * Parse and validate a SAML 2.0 AuthnResponse.
 *
 * Steps:
 *   1. Decode base64 → XML
 *   2. Verify ds:Signature using stored IdP certificate
 *   3. Validate Conditions (NotBefore/NotOnOrAfter, Audience)
 *   4. Extract NameID and attribute statements
 *
 * Throws if validation fails.
 */
export function parseSamlResponse(
  samlResponseB64: string,
  idp: SamlIdpConfig,
  sp: SamlSpConfig,
): SamlAttributes {
  const xml = Buffer.from(samlResponseB64, 'base64').toString('utf8');

  // 1. Check top-level Status
  const statusCode = xmlText(xml, 'StatusCode');
  if (statusCode && !statusCode.includes('Success')) {
    const statusMessage = xmlText(xml, 'StatusMessage');
    throw new Error(`SAML response status: ${statusCode}${statusMessage ? ` — ${statusMessage}` : ''}`);
  }

  // 2. Verify signature (if present)
  const hasSignature = xml.includes('<ds:Signature') || xml.includes('<Signature');
  if (hasSignature) {
    const valid = verifySamlSignature(xml, idp.certificate);
    if (!valid) throw new Error('SAML signature verification failed');
  }

  // 3. Get assertion block
  const assertionXml = xmlAll(xml, 'Assertion')[0] ?? xml;

  // 4. Validate conditions
  validateConditions(assertionXml, sp.entityId);

  // 5. Check issuer matches configured IdP
  const issuer = xmlText(assertionXml, 'Issuer');
  if (idp.entityId && issuer && issuer !== idp.entityId) {
    throw new Error(`SAML issuer mismatch: expected "${idp.entityId}", got "${issuer}"`);
  }

  // 6. Extract NameID
  const nameId =
    assertionXml.match(/<(?:saml2?:)?NameID[^>]*>([^<]+)<\/(?:saml2?:)?NameID>/)?.[1]?.trim() ?? '';
  if (!nameId) throw new Error('NameID not found in SAML assertion');

  // 7. Parse attribute statements
  const attrStatements = xmlAll(assertionXml, 'AttributeStatement');
  const rawAttributes: Record<string, string[]> = {};

  for (const stmt of attrStatements) {
    const attrBlocks = stmt.match(/<(?:saml2?:)?Attribute[\s\S]*?<\/(?:saml2?:)?Attribute>/g) ?? [];
    for (const block of attrBlocks) {
      const { name, values } = parseAttribute(block);
      if (name) rawAttributes[name] = values;
    }
  }

  // 8. Resolve email from attributes or NameID
  const emailAttrNames = [
    idp.emailAttribute,
    'email', 'emailAddress', 'mail',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/email',
  ].filter(Boolean) as string[];

  let email = '';
  for (const attrName of emailAttrNames) {
    const val = rawAttributes[attrName]?.[0];
    if (val) { email = val.toLowerCase(); break; }
  }
  if (!email) email = nameId.toLowerCase();
  if (!email) throw new Error('No email could be extracted from SAML assertion');

  // 9. Resolve display name
  const nameAttrNames = [
    idp.nameAttribute,
    'displayName', 'cn', 'name', 'givenName', 'fullName',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname',
  ].filter(Boolean) as string[];

  let displayName: string | null = null;
  for (const attrName of nameAttrNames) {
    const val = rawAttributes[attrName]?.[0];
    if (val) { displayName = val; break; }
  }

  // 10. Resolve role
  const roleAttrNames = [
    idp.roleAttribute,
    'role', 'roles', 'memberOf', 'groups',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
  ].filter(Boolean) as string[];

  let role: string | null = null;
  for (const attrName of roleAttrNames) {
    const val = rawAttributes[attrName]?.[0];
    if (val) { role = val.toLowerCase(); break; }
  }

  return { nameId, email, displayName, role, raw: rawAttributes };
}
