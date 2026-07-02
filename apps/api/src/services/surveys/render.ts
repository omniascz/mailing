/**
 * Hosted survey/poll fill page (#16). Renders a shareable public page where a
 * recipient answers a survey and submits to POST /public/surveys/:id/submit.
 *
 * Previously surveys had a public submit API but no page that renders the
 * questions — so there was no way for a recipient to actually fill one in.
 */

import type { Survey, SurveyQuestion } from '../../db/schema/index.js';

function esc(v: string | undefined | null): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderQuestion(q: SurveyQuestion, idx: number): string {
  const qid = esc(q.id);
  const name = `q_${qid}`;
  const legend = `<legend class="sv-label">${idx + 1}. ${esc(q.label)}${q.required ? ' *' : ''}</legend>`;

  if (q.type === 'text') {
    return `<div class="sv-q">${legend}<textarea name="${name}" data-qid="${qid}" data-type="text"${q.required ? ' required' : ''}></textarea></div>`;
  }

  if (q.type === 'single' || q.type === 'multi') {
    const inputType = q.type === 'single' ? 'radio' : 'checkbox';
    const opts = (q.options ?? [])
      .map(
        (o, i) =>
          `<label class="sv-opt"><input type="${inputType}" name="${name}" value="${esc(o)}" data-qid="${qid}" data-type="${q.type}"${q.type === 'single' && q.required && i === 0 ? ' required' : ''} /> ${esc(o)}</label>`,
      )
      .join('');
    return `<fieldset class="sv-q">${legend}<div class="sv-opts">${opts}</div></fieldset>`;
  }

  // numeric scales: scale / rating / nps
  const min = q.type === 'nps' ? 0 : (q.min ?? 1);
  const max = q.type === 'nps' ? 10 : (q.max ?? 5);
  const buttons: string[] = [];
  for (let n = min; n <= max; n++) {
    buttons.push(
      `<label class="sv-scale-opt"><input type="radio" name="${name}" value="${n}" data-qid="${qid}" data-type="${q.type}"${q.required && n === min ? ' required' : ''} /><span>${n}</span></label>`,
    );
  }
  return `<fieldset class="sv-q">${legend}<div class="sv-scale">${buttons.join('')}</div></fieldset>`;
}

/** Full standalone hosted page for a survey. */
export function renderHostedSurveyPage(survey: Survey, apiBase: string): string {
  const questions = (survey.questions ?? []) as SurveyQuestion[];
  const title = esc(survey.name);
  const desc = survey.description ? `<p class="sv-desc">${esc(survey.description)}</p>` : '';
  const questionsHtml = questions.map(renderQuestion).join('\n');
  // Question type map for the client collector (id → type).
  const typeMap = Object.fromEntries(questions.map((q) => [q.id, q.type]));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;color:#111827;}
  .sv-wrap{max-width:560px;margin:48px auto;padding:0 16px;}
  .sv-card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1);}
  h1{font-size:22px;margin:0 0 8px;}
  .sv-desc{color:#6b7280;font-size:14px;margin:0 0 24px;}
  .sv-q{border:0;margin:0 0 22px;padding:0;}
  .sv-label{font-size:15px;font-weight:600;margin-bottom:10px;padding:0;}
  .sv-opts{display:flex;flex-direction:column;gap:8px;}
  .sv-opt{font-size:14px;display:flex;align-items:center;gap:8px;cursor:pointer;}
  textarea{width:100%;min-height:90px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;}
  .sv-scale{display:flex;flex-wrap:wrap;gap:6px;}
  .sv-scale-opt{display:inline-flex;flex-direction:column;align-items:center;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:13px;}
  .sv-scale-opt input{margin-bottom:4px;}
  .sv-submit{width:100%;padding:12px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:8px;}
  .sv-submit:disabled{opacity:.6;cursor:default;}
  .sv-msg{color:#dc2626;font-size:14px;margin-top:10px;min-height:18px;}
  .sv-success{padding:24px;text-align:center;font-size:16px;color:#065f46;}
  .sv-foot{text-align:center;margin-top:16px;font-size:12px;color:#9ca3af;}
</style>
</head>
<body>
<div class="sv-wrap">
  <div class="sv-card">
    <h1>${title}</h1>
    ${desc}
    <form id="sv-form">
      ${questionsHtml}
      <button type="submit" class="sv-submit" id="sv-submit">Submit</button>
      <div class="sv-msg" id="sv-msg"></div>
    </form>
  </div>
  <div class="sv-foot">Powered by ForgeMsg</div>
</div>
<script>
  var TYPES=${JSON.stringify(typeMap)};
  var ORG_ID=${JSON.stringify(survey.orgId)};
  var SURVEY_ID=${JSON.stringify(survey.id)};
  var form=document.getElementById('sv-form');
  var msg=document.getElementById('sv-msg');
  var btn=document.getElementById('sv-submit');
  function numeric(t){return t==='nps'||t==='scale'||t==='rating';}
  function collect(){
    var answers={};
    Object.keys(TYPES).forEach(function(qid){
      var t=TYPES[qid];
      var nodes=form.querySelectorAll('[name="q_'+qid+'"]');
      if(t==='multi'){
        var vals=[]; nodes.forEach(function(n){if(n.checked)vals.push(n.value);}); if(vals.length)answers[qid]=vals;
      } else if(t==='single'||t==='nps'||t==='scale'||t==='rating'){
        nodes.forEach(function(n){if(n.checked)answers[qid]=numeric(t)?Number(n.value):n.value;});
      } else {
        if(nodes[0]&&nodes[0].value.trim())answers[qid]=nodes[0].value;
      }
    });
    return answers;
  }
  form.addEventListener('submit',function(e){
    e.preventDefault(); btn.disabled=true; msg.textContent='';
    fetch('${apiBase}/public/surveys/'+SURVEY_ID+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgId:ORG_ID,answers:collect()})})
      .then(function(r){ if(r.ok){ form.innerHTML='<div class="sv-success">Thank you for your feedback!</div>'; } else { msg.textContent='Something went wrong, please try again.'; btn.disabled=false; } })
      .catch(function(){ msg.textContent='Network error, please try again.'; btn.disabled=false; });
  });
</script>
</body>
</html>`;
}
