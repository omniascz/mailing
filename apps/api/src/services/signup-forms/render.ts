/**
 * Signup-form rendering: the embed loader.js and the hosted standalone page.
 *
 * Previously the embed snippet pointed at /public/forms/loader.js which was
 * never served, and /public/forms/:id returned JSON only — so forms could not
 * actually render anywhere. This module supplies:
 *   - buildLoaderScript(apiBase): the served loader.js (client-renders any form)
 *   - renderHostedFormPage(form, apiBase): a full standalone HTML page (a
 *     shareable hosted form URL, like Constant Contact's hosted sign-up page)
 */

import type { FormField, FormConfig, SignupForm } from '../../db/schema/index.js';

function esc(v: string | undefined | null): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Server-render a single field to HTML (used by the hosted page). */
function renderFieldHtml(field: FormField): string {
  const name = esc(field.name);
  const label = esc(field.label);
  const ph = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : '';
  const req = field.required ? ' required' : '';
  const def = field.defaultValue ? ` value="${esc(field.defaultValue)}"` : '';

  if (field.type === 'hidden') {
    return `<input type="hidden" name="${name}"${def} />`;
  }
  const labelHtml = `<label class="fm-label" for="fm-${name}">${label}${field.required ? ' *' : ''}</label>`;

  if (field.type === 'select') {
    const opts = (field.options ?? [])
      .map((o) => `<option value="${esc(o)}">${esc(o)}</option>`)
      .join('');
    return `<div class="fm-field">${labelHtml}<select id="fm-${name}" name="${name}"${req}><option value="">—</option>${opts}</select></div>`;
  }
  if (field.type === 'checkbox') {
    return `<div class="fm-field fm-checkbox"><label><input type="checkbox" id="fm-${name}" name="${name}" value="true"${req} /> ${label}</label></div>`;
  }
  if (field.type === 'textarea') {
    return `<div class="fm-field">${labelHtml}<textarea id="fm-${name}" name="${name}"${ph}${req}></textarea></div>`;
  }
  const inputType =
    field.type === 'email'
      ? 'email'
      : field.type === 'phone'
        ? 'tel'
        : field.type === 'number'
          ? 'number'
          : field.type === 'date'
            ? 'date'
            : 'text';
  return `<div class="fm-field">${labelHtml}<input type="${inputType}" id="fm-${name}" name="${name}"${ph}${def}${req} /></div>`;
}

/** Shared client-side submit handler as a JS string (used by loader + hosted). */
function submitScript(apiBase: string): string {
  return `function fmSubmit(formEl, formId, cfg, msgEl, btnEl){
    var data={}; new FormData(formEl).forEach(function(v,k){ data[k]=(v==='on'?'true':v); });
    btnEl.disabled=true;
    fetch('${apiBase}/public/forms/'+formId+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
      .then(function(res){
        if(res.ok){ if(cfg.redirectUrl){location.href=cfg.redirectUrl;return;}
          formEl.innerHTML='<div class="fm-success">'+ (cfg.successMessage? String(cfg.successMessage).replace(/[<>&]/g,'') : 'Thanks for subscribing!') +'</div>';
        } else { msgEl.textContent=(res.b&&res.b.message)||'Please check your details and try again.'; btnEl.disabled=false; }
      }).catch(function(){ msgEl.textContent='Network error, please try again.'; btnEl.disabled=false; });
  }`;
}

/**
 * The served /public/forms/loader.js — reads its own data-form-id, fetches the
 * form definition, honours targeting (should-show) for popup/slide/floating
 * forms, renders the fields client-side, and wires submission.
 */
export function buildLoaderScript(apiBase: string): string {
  return `/* ForgeMsg signup-form loader */
(function(){
  var s = document.currentScript;
  if(!s) return;
  var formId = s.getAttribute('data-form-id');
  if(!formId) return;
  var container = document.getElementById('fm-form-'+formId+'-container');
  ${submitScript(apiBase)}
  function esc(v){var d=document.createElement('div');d.textContent=(v==null?'':String(v));return d.innerHTML;}
  function buildField(f){
    if(f.type==='hidden'){ var h=document.createElement('input'); h.type='hidden'; h.name=f.name; if(f.defaultValue)h.value=f.defaultValue; return h; }
    var wrap=document.createElement('div'); wrap.className='fm-field';
    var lbl=document.createElement('label'); lbl.textContent=f.label+(f.required?' *':'');
    var input;
    if(f.type==='select'){ input=document.createElement('select'); var e0=document.createElement('option'); e0.value='';e0.textContent='—'; input.appendChild(e0); (f.options||[]).forEach(function(o){var op=document.createElement('option');op.value=o;op.textContent=o;input.appendChild(op);}); }
    else if(f.type==='textarea'){ input=document.createElement('textarea'); }
    else if(f.type==='checkbox'){ input=document.createElement('input'); input.type='checkbox'; input.value='true'; wrap.className='fm-field fm-checkbox'; }
    else { input=document.createElement('input'); input.type=(f.type==='email'?'email':f.type==='phone'?'tel':f.type==='number'?'number':f.type==='date'?'date':'text'); }
    input.name=f.name; if(f.required)input.required=true; if(f.placeholder)input.placeholder=f.placeholder; if(f.defaultValue&&f.type!=='checkbox')input.value=f.defaultValue;
    if(f.type==='checkbox'){ var cl=document.createElement('label'); cl.appendChild(input); cl.appendChild(document.createTextNode(' '+f.label)); wrap.appendChild(cl); }
    else { wrap.appendChild(lbl); wrap.appendChild(input); }
    return wrap;
  }
  function render(form){
    if(!container){ container=document.createElement('div'); container.id='fm-form-'+formId+'-container'; document.body.appendChild(container); }
    var cfg=form.config||{};
    var el=document.createElement('form'); el.className='fm-form';
    (form.fields||[]).forEach(function(f){ el.appendChild(buildField(f)); });
    if(cfg.honeypotField){ var hp=document.createElement('input'); hp.type='text'; hp.name=cfg.honeypotField; hp.tabIndex=-1; hp.autocomplete='off'; hp.style.position='absolute'; hp.style.left='-9999px'; el.appendChild(hp); }
    var msg=document.createElement('div'); msg.className='fm-msg';
    var btn=document.createElement('button'); btn.type='submit'; btn.className='fm-submit'; btn.textContent=cfg.submitButtonText||'Subscribe';
    el.appendChild(btn); el.appendChild(msg);
    el.addEventListener('submit',function(e){ e.preventDefault(); fmSubmit(el,formId,cfg,msg,btn); });
    container.appendChild(el);
  }
  var device = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  fetch('${apiBase}/public/forms/'+formId).then(function(r){return r.json();}).then(function(res){
    var form=res.data; if(!form) return;
    fetch('${apiBase}/public/forms/'+formId+'/view').catch(function(){});
    var cfg=form.config||{};
    if(cfg.targeting){
      var key='fm_seen_'+formId;
      var seen=parseInt(localStorage.getItem(key)||'0',10);
      var q='?url='+encodeURIComponent(location.href)+'&device='+device+'&impressionCount='+seen;
      fetch('${apiBase}/public/forms/'+formId+'/should-show'+q).then(function(r){return r.json();}).then(function(d){
        if(d.data&&d.data.show){ localStorage.setItem(key,String(seen+1)); render(form); }
      }).catch(function(){ render(form); });
    } else { render(form); }
  }).catch(function(){});
})();`;
}

/**
 * Full standalone hosted page for a form (a shareable URL). Server-renders the
 * fields (works without JS for content) and progressively enhances submission.
 */
export function renderHostedFormPage(form: SignupForm, apiBase: string): string {
  const cfg = (form.config ?? {}) as FormConfig;
  const fields = (form.fields ?? []) as FormField[];
  const styles = cfg.styles ?? {};
  const accent = styles['accentColor'] ?? '#2563eb';
  const fieldsHtml = fields.map(renderFieldHtml).join('\n');
  const honeypot = cfg.honeypotField
    ? `<input type="text" name="${esc(cfg.honeypotField)}" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />`
    : '';
  const submitText = esc(cfg.submitButtonText ?? 'Subscribe');
  const title = esc(form.name);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<style>
  :root{--fm-accent:${esc(accent)};}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;color:#111827;}
  .fm-wrap{max-width:480px;margin:48px auto;padding:0 16px;}
  .fm-card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1);}
  h1{font-size:22px;margin:0 0 20px;}
  .fm-field{margin-bottom:16px;}
  .fm-label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151;}
  input,select,textarea{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;}
  input:focus,select,textarea:focus{outline:none;border-color:var(--fm-accent);}
  .fm-checkbox label{font-weight:400;font-size:14px;}
  .fm-checkbox input{width:auto;margin-right:8px;}
  .fm-submit{width:100%;padding:12px;border:0;border-radius:8px;background:var(--fm-accent);color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:8px;}
  .fm-submit:disabled{opacity:.6;cursor:default;}
  .fm-msg{color:#dc2626;font-size:14px;margin-top:10px;min-height:18px;}
  .fm-success{padding:24px;text-align:center;font-size:16px;color:#065f46;}
  .fm-foot{text-align:center;margin-top:16px;font-size:12px;color:#9ca3af;}
</style>
</head>
<body>
<div class="fm-wrap">
  <div class="fm-card">
    <h1>${title}</h1>
    <form class="fm-form" id="fm-form">
      ${fieldsHtml}
      ${honeypot}
      <button type="submit" class="fm-submit" id="fm-submit">${submitText}</button>
      <div class="fm-msg" id="fm-msg"></div>
    </form>
  </div>
  <div class="fm-foot">Powered by ForgeMsg</div>
</div>
<script>
  ${submitScript(apiBase)}
  fetch('${apiBase}/public/forms/${form.id}/view').catch(function(){});
  var el=document.getElementById('fm-form');
  var cfg=${JSON.stringify({
    submitButtonText: cfg.submitButtonText,
    successMessage: cfg.successMessage,
    redirectUrl: cfg.redirectUrl,
  })};
  el.addEventListener('submit',function(e){e.preventDefault();fmSubmit(el,'${form.id}',cfg,document.getElementById('fm-msg'),document.getElementById('fm-submit'));});
</script>
</body>
</html>`;
}
