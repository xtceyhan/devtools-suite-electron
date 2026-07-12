'use strict';

// ─────────────────────────────────────────────────────
// WINDOW CONTROLS
// ─────────────────────────────────────────────────────
document.getElementById('bMin').onclick   = () => window.api?.minimize();
document.getElementById('bMax').onclick   = () => window.api?.maximize();
document.getElementById('bClose').onclick = () => window.api?.close();

// ─────────────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  };
});

// ─────────────────────────────────────────────────────
// SHARED UTILITIES
// ─────────────────────────────────────────────────────
function toast(msg, color) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.color = color || 'var(--teal)';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1900);
}

function lineNums(ta, container, errLines = []) {
  const n = (ta.value.match(/\n/g) || []).length + 1;
  container.innerHTML = Array.from({length: n}, (_, i) =>
    `<div class="${errLines.includes(i+1) ? 'err-ln' : ''}">${i+1}</div>`
  ).join('');
  container.scrollTop = ta.scrollTop;
}

function syncScroll(ta, nums) {
  ta.addEventListener('scroll', () => { nums.scrollTop = ta.scrollTop; });
}

function stats(text, el) {
  if (!text.trim()) { el.textContent = ''; return; }
  el.textContent = text.split('\n').length + ' satır · ' + text.length.toLocaleString() + ' kar';
}

async function copyToClipboard(text) {
  if (window.api?.clipboardWrite) {
    try { await window.api.clipboardWrite(text); return true; } catch {}
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatXML(xml, ind) {
  let f = xml.trim().replace(/>\s+</g,'><').replace(/\s+/g,' ');
  let result='', depth=0, i=0;
  const len = f.length;
  while (i < len) {
    if (f[i] !== '<') {
      let j = f.indexOf('<', i);
      if (j<0) j=len;
      const t = f.substring(i,j).trim();
      if (t) { if(result)result+='\n'; result+=ind.repeat(depth)+t; }
      i=j; continue;
    }
    let j = f.indexOf('>', i);
    if (j<0) j=len-1;
    const tag = f.substring(i,j+1);
    const isClose = tag.startsWith('</');
    const isSelf  = tag.endsWith('/>');
    const isPI    = tag.startsWith('<?')||tag.startsWith('<!');
    if (isClose) { depth=Math.max(0,depth-1); if(result)result+='\n'; result+=ind.repeat(depth)+tag; }
    else if (isSelf||isPI) { if(result)result+='\n'; result+=ind.repeat(depth)+tag; }
    else {
      const rest = f.substring(j+1);
      const nx = rest.indexOf('<');
      if (nx>0) {
        const tc = rest.substring(0,nx);
        const cl = rest.substring(nx).match(/^<\/[^>]+>/);
        if (cl && !tc.includes('\n')) { if(result)result+='\n'; result+=ind.repeat(depth)+tag+tc+cl[0]; i=j+1+nx+cl[0].length; continue; }
      }
      if(result)result+='\n'; result+=ind.repeat(depth)+tag; depth++;
    }
    i=j+1;
  }
  return result;
}

// ═══════════════════════════════════════════════════
// MODULE: FORMATTER
// ═══════════════════════════════════════════════════
const FMT = (() => {
  let mode = 'auto';

  const $ = id => document.getElementById(id);
  const input   = $('f-input');
  const output  = $('f-output');
  const inNums  = $('f-inNums');
  const outNums = $('f-outNums');
  const inStats = $('f-inStats');
  const outStats= $('f-outStats');
  const errPanel= $('f-errPanel');
  const errInner= $('f-errInner');

  function validateXMLTags(text) {
    const errors = [];
    const stack  = [];
    let i = 0, line = 1, lineStart = 0;

    while (i < text.length) {
      if (text[i] === '\n') { line++; lineStart = i + 1; i++; continue; }
      if (text[i] !== '<') { i++; continue; }

      const tLine = line, tCol = i - lineStart + 1;

      if (text.startsWith('<?', i)) {
        const e = text.indexOf('?>', i);
        if (e < 0) { errors.push({type:'error',line:tLine,col:tCol,message:'Kapatılmamış processing instruction'}); break; }
        for (let k=i;k<e+2;k++) if(text[k]==='\n'){line++;lineStart=k+1;}
        i = e + 2; continue;
      }
      if (text.startsWith('<!--', i)) {
        const e = text.indexOf('-->', i);
        if (e < 0) { errors.push({type:'error',line:tLine,col:tCol,message:'Kapatılmamış yorum bloğu'}); break; }
        for (let k=i;k<e+3;k++) if(text[k]==='\n'){line++;lineStart=k+1;}
        i = e + 3; continue;
      }
      if (text.startsWith('<![CDATA[', i)) {
        const e = text.indexOf(']]>', i);
        if (e < 0) { errors.push({type:'error',line:tLine,col:tCol,message:'Kapatılmamış CDATA'}); break; }
        for (let k=i;k<e+3;k++) if(text[k]==='\n'){line++;lineStart=k+1;}
        i = e + 3; continue;
      }
      if (text.startsWith('<!', i)) {
        let d=0, j=i;
        while(j<text.length){if(text[j]==='<')d++;else if(text[j]==='>'){d--;if(!d)break;}if(text[j]==='\n'){line++;lineStart=j+1;}j++;}
        i = j + 1; continue;
      }

      let j = i + 1, inQ = null;
      while (j < text.length) {
        if (!inQ && (text[j]==='"'||text[j]==="'")) inQ = text[j];
        else if (inQ && text[j]===inQ) inQ = null;
        else if (!inQ && text[j]==='>') break;
        if (text[j]==='\n'){line++;lineStart=j+1;}
        j++;
      }
      if (j >= text.length) { errors.push({type:'error',line:tLine,col:tCol,message:"'>' ile kapatılmamış tag"}); break; }

      const inner = text.substring(i+1, j).trim();
      if (inner.endsWith('/')) { i = j+1; continue; }

      if (inner.startsWith('/')) {
        const rawClose = inner.substring(1).trim().split(/[\s>]/)[0];
        if (!stack.length) {
          errors.push({type:'error',line:tLine,col:tCol,message:`Beklenmeyen kapanış </${rawClose}>`});
        } else {
          const top = stack.pop();
          if (top.name !== rawClose) {
            errors.push({type:'error',line:tLine,col:tCol,
              message:`Tag uyuşmazlığı: <${top.name}> (Ln ${top.line}) açıldı, </${rawClose}> ile kapatıldı`});
          }
        }
        i = j + 1; continue;
      }

      const rawOpen = inner.trim().split(/[\s\/]/)[0];
      if (rawOpen) stack.push({name:rawOpen,line:tLine,col:tCol});
      i = j + 1;
    }

    while (stack.length) {
      const u = stack.pop();
      errors.push({type:'error',line:u.line,col:u.col,message:`Kapatılmamış tag: <${u.name}>`});
    }
    return errors;
  }

  function validateXML(text) {
    const stackErrs = validateXMLTags(text);
    if (stackErrs.length) return stackErrs;
    const errors = [];
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const pe = doc.querySelector('parsererror') || doc.querySelector('parseerror');
    if (pe) {
      const msg = pe.textContent || '';
      const lm = msg.match(/[Ll]ine[: ]+(\d+)/);
      const cm = msg.match(/[Cc]ol(?:umn)?[: ]+(\d+)/);
      let clean = msg.replace(/This page.*?\n/g,'').replace(/error on line.*?:/i,'').replace(/Below is.*/i,'').trim().split('\n')[0].trim();
      errors.push({type:'error',line:lm?+lm[1]:null,col:cm?+cm[1]:null,message:clean||'Geçersiz XML'});
    }
    return errors;
  }

  function validateJSON(text) {
    try { JSON.parse(text); return []; }
    catch(e) {
      const msg = e.message;
      const pm = msg.match(/position (\d+)/i)||msg.match(/at (\d+)/);
      let line=null,col=null;
      if (pm) {
        const pos = +pm[1];
        const lines = text.substring(0,pos).split('\n');
        line = lines.length; col = lines[lines.length-1].length+1;
      }
      let friendly = msg;
      if (msg.includes('Unexpected token')) friendly = 'Beklenmeyen karakter: ' + (msg.match(/Unexpected token (.)/)?.[1]||'');
      else if (msg.includes('Unexpected end')) friendly = 'Beklenmeyen dosya sonu — kapanmamış parantez/tırnak';
      else if (msg.includes('Unexpected string')) friendly = 'Beklenmeyen string — virgül unutulmuş olabilir';
      else if (msg.includes('Unexpected number')) friendly = 'Beklenmeyen sayı — virgül unutulmuş olabilir';
      return [{type:'error',line,col,message:friendly}];
    }
  }

  function detectType(text) {
    const t = text.trim();
    if (!t) return null;
    if (t.startsWith('<')) return 'xml';
    if (t.startsWith('{')||t.startsWith('[')) return 'json';
    try { JSON.parse(t); return 'json'; } catch {}
    const d = new DOMParser().parseFromString(t,'application/xml');
    if (!d.querySelector('parsererror')&&!d.querySelector('parseerror')) return 'xml';
    return null;
  }

  function getIndent() {
    const v = $('f-indent').value;
    return v === 'tab' ? '\t' : ' '.repeat(+v);
  }

  function formatJSON(text) {
    const v = $('f-indent').value;
    return JSON.stringify(JSON.parse(text), null, v==='tab'?'\t':+v);
  }

  function minifyXML(t) { return t.replace(/>\s+</g,'><').replace(/\s+/g,' ').trim(); }
  function minifyJSON(t) { return JSON.stringify(JSON.parse(t)); }

  function showErrors(errors, type) {
    const stSt = $('f-stStatus');
    const stTy = $('f-stType');
    const outDot= $('f-outDot');

    if (!errors.length) {
      errPanel.className='error-panel';
      errInner.innerHTML='';
      stSt.className='st ok';
      stSt.innerHTML=`<div class="st-dot"></div><span>Geçerli ${type||''}</span>`;
      outDot.style.background='var(--teal)';
      outDot.style.color='var(--teal)';
      stTy.innerHTML=`<span>${type?type.toUpperCase():'—'}</span>`;
      return;
    }

    errPanel.className='error-panel has-errors';
    const ec = errors.filter(e=>e.type==='error').length;
    let html = `<div class="ep-title err">${ec} hata</div><div class="ep-list">`;
    errors.forEach(e=>{
      const loc = e.line?`Ln ${e.line}${e.col?', Col '+e.col:''}`:' ';
      html+=`<div class="ep-item"><span class="ep-badge">HATA</span><span class="ep-loc">${loc}</span><span class="ep-msg">${e.message}</span></div>`;
    });
    html+='</div>';
    errInner.innerHTML=html;
    stSt.className='st err';
    stSt.innerHTML=`<div class="st-dot"></div><span>${ec} hata</span>`;
    outDot.style.background='var(--red)';
    outDot.style.color='var(--red)';
    if(type) stTy.innerHTML=`<span>${type.toUpperCase()}</span>`;
  }

  function doFormat() {
    const text = input.value;
    if (!text.trim()) { showErrors([],null); return; }
    const ind  = getIndent();
    const type = mode==='auto' ? detectType(text) : mode;
    if (!type) { showErrors([{type:'error',message:'Format tanınamadı'}],null); return; }

    let errors=[], formatted='';
    if (type==='xml') {
      errors = validateXML(text);
      if (!errors.length) { try { formatted=formatXML(text,ind); } catch(e){ errors.push({type:'error',message:e.message}); } }
    } else {
      errors = validateJSON(text);
      if (!errors.length) { try { formatted=formatJSON(text); } catch(e){ errors.push({type:'error',message:e.message}); } }
    }

    const errLines = errors.filter(e=>e.line).map(e=>e.line);
    lineNums(input, inNums, errLines);
    showErrors(errors, type);

    if (formatted) {
      output.value = formatted;
      lineNums(output, outNums);
      stats(formatted, outStats);
    } else {
      output.value = '';
      lineNums(output, outNums);
      stats('', outStats);
    }
  }

  document.querySelectorAll('.mode-tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.mode-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      mode = t.dataset.mode;
      const dot=$('f-inDot'), lbl=$('f-inLabel');
      const colorMap = { xml: 'var(--coral)', json: 'var(--amber)', auto: 'var(--accent)' };
      const c = colorMap[mode] || colorMap.auto;
      dot.style.background = c;
      dot.style.color = c;
      lbl.textContent = 'INPUT — '+mode.toUpperCase();
    };
  });

  $('f-format').onclick   = doFormat;
  $('f-validate').onclick = () => {
    const text=input.value, type=mode==='auto'?detectType(text):mode;
    if (!text.trim()||!type) return;
    const errs = type==='xml'?validateXML(text):validateJSON(text);
    lineNums(input,inNums,errs.filter(e=>e.line).map(e=>e.line));
    showErrors(errs,type);
  };
  $('f-minify').onclick = () => {
    const text=input.value, type=mode==='auto'?detectType(text):mode;
    if (!text.trim()||!type) return;
    const errs = type==='xml'?validateXML(text):validateJSON(text);
    if (errs.length){showErrors(errs,type);return;}
    try {
      const m = type==='xml'?minifyXML(text):minifyJSON(text);
      output.value=m; lineNums(output,outNums); stats(m,outStats); showErrors([],type);
    } catch(e){showErrors([{type:'error',message:e.message}],type);}
  };
  $('f-clear').onclick = () => {
    input.value=''; output.value='';
    lineNums(input,inNums); lineNums(output,outNums);
    stats('',inStats); stats('',outStats);
    errPanel.className='error-panel'; errInner.innerHTML='';
    $('f-stStatus').className='st'; $('f-stStatus').innerHTML='<div class="st-dot"></div><span>Hazır</span>';
    $('f-stType').innerHTML='<span>—</span>';
    $('f-outDot').style.background='var(--t3)';
    $('f-outDot').style.color='var(--t3)';
  };
  $('f-copyIn').onclick  = async () => { if(input.value && await copyToClipboard(input.value)) toast('✓ Input kopyalandı'); };
  $('f-copyOut').onclick = async () => { if(output.value && await copyToClipboard(output.value)) toast('✓ Output kopyalandı'); };

  input.addEventListener('input', () => {
    lineNums(input,inNums);
    stats(input.value,inStats);
  });
  input.addEventListener('keydown', e => {
    if (e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();doFormat();}
    if (e.key==='Tab'){e.preventDefault();const s=e.target.selectionStart,en=e.target.selectionEnd;e.target.value=e.target.value.substring(0,s)+'  '+e.target.value.substring(en);e.target.selectionStart=e.target.selectionEnd=s+2;lineNums(input,inNums);}
  });
  input.addEventListener('keyup', () => {
    const pos=input.selectionStart, before=input.value.substring(0,pos), lines=before.split('\n');
    $('f-stCursor').textContent=`Ln ${lines.length}, Col ${lines[lines.length-1].length+1}`;
  });
  input.addEventListener('click', () => {
    const pos=input.selectionStart, before=input.value.substring(0,pos), lines=before.split('\n');
    $('f-stCursor').textContent=`Ln ${lines.length}, Col ${lines[lines.length-1].length+1}`;
  });
  input.addEventListener('paste', ()=>{ setTimeout(()=>{ lineNums(input,inNums); stats(input.value,inStats); if(input.value.trim())doFormat(); },50); });
  syncScroll(input,inNums);
  syncScroll(output,outNums);

  (() => {
    const div=$('f-div'), left=$('f-left');
    let drag=false, startX=0, startW=0;
    div.addEventListener('mousedown',e=>{drag=true;startX=e.clientX;startW=left.getBoundingClientRect().width;div.classList.add('drag');e.preventDefault();});
    document.addEventListener('mousemove',e=>{
      if(!drag)return;
      const delta=e.clientX-startX;
      const area=$('f-mainArea').getBoundingClientRect();
      const newW=Math.min(Math.max(startW+delta, area.width*0.2), area.width*0.8);
      left.style.flex='none'; left.style.width=newW+'px';
    });
    document.addEventListener('mouseup',()=>{drag=false;div.classList.remove('drag');});
  })();

  lineNums(input,inNums);
  lineNums(output,outNums);
})();


// ═══════════════════════════════════════════════════
// MODULE: XSL GENERATOR
// ═══════════════════════════════════════════════════
const GEN = (() => {
  let parsedWSDL = null;
  let currentOp  = null;
  let paramList  = [];
  let activeTypeIdx = -1;

  const $ = id => document.getElementById(id);

  class WSDLParser {
    constructor(text) {
      this.text=text; this.doc=null; this.typeReg={}; this.elemReg={};
      this.operations=[]; this.targetNS=''; this._parse();
    }
    _byLocal(root,ln){return Array.from((root||this.doc).getElementsByTagName('*')).filter(e=>e.localName===ln);}
    _kids(el,ln){return Array.from(el.children).filter(e=>e.localName===ln);}
    _strip(s){return s?(s.includes(':')?s.split(':').pop():s):'';}
    _isPrim(t){const p=['string','integer','int','long','float','double','boolean','date','dateTime','decimal','anyURI','base64Binary'];const b=this._strip(t).toLowerCase();return p.some(x=>b===x);}
    _parse(){
      this.doc=new DOMParser().parseFromString(this.text,'application/xml');
      if(this.doc.querySelector('parsererror')||this.doc.querySelector('parseerror')) throw new Error('Geçersiz XML/WSDL');
      const defs=this._byLocal(this.doc,'definitions')[0]||this._byLocal(this.doc,'description')[0];
      this.targetNS=defs?.getAttribute('targetNamespace')||'';
      this._buildTypeReg();
      this._extractOps();
    }
    _buildTypeReg(){
      this._byLocal(this.doc,'complexType').forEach(ct=>{
        const n=ct.getAttribute('name'); if(!n)return;
        this.typeReg[n]=this._analyzeCT(ct);
      });
      this._byLocal(this.doc,'schema').forEach(sc=>{
        this._kids(sc,'element').forEach(el=>{
          const n=el.getAttribute('name'); if(!n)return;
          const ict=this._byLocal(el,'complexType')[0];
          const tr=this._strip(el.getAttribute('type')||'');
          if(ict) this.elemReg[n]=this._analyzeCT(ict);
          else if(tr&&this.typeReg[tr]) this.elemReg[n]=this.typeReg[tr];
        });
      });
    }
    _analyzeCT(ct){
      const all=this._byLocal(ct,'element');
      const item=all.find(e=>e.getAttribute('name')==='item');
      if(item){
        const itype=this._strip(item.getAttribute('type')||'');
        if(itype&&this.typeReg[itype]){
          const d=this.typeReg[itype];
          if(d.kind==='RANGE')return{kind:'RANGE',fields:[]};
          return{kind:'TABLE',fields:d.fields||[]};
        }
        const ict=this._byLocal(item,'complexType')[0];
        if(ict){
          const ff=this._getFields(ict);
          const names=ff.map(f=>f.name);
          if(['SIGN','OPTION','LOW','HIGH'].every(n=>names.includes(n))) return{kind:'RANGE',fields:[]};
          return{kind:'TABLE',fields:ff};
        }
        return{kind:'TABLE',fields:[]};
      }
      const ff=this._getFields(ct);
      if(!ff.length) return{kind:'SIMPLE',fields:[]};
      return{kind:'STRUCT',fields:ff};
    }
    _reanalyze(){
      Object.keys(this.typeReg).forEach(n=>{
        const d=this.typeReg[n];
        if(d.kind==='TABLE'&&!d.fields.length){
          const ct=this._byLocal(this.doc,'complexType').find(e=>e.getAttribute('name')===n);
          if(!ct)return;
          const item=this._byLocal(ct,'element').find(e=>e.getAttribute('name')==='item');
          if(!item)return;
          const itype=this._strip(item.getAttribute('type')||'');
          const r=this.typeReg[itype];
          if(!r)return;
          if(r.kind==='RANGE'||['SIGN','OPTION','LOW','HIGH'].every(x=>r.fields?.map(f=>f.name).includes(x)))
            this.typeReg[n]={kind:'RANGE',fields:[]};
          else this.typeReg[n]={kind:'TABLE',fields:r.fields||[]};
        }
      });
    }
    _getFields(ct){
      const ff=[];
      this._byLocal(ct,'element').forEach(el=>{
        const n=el.getAttribute('name'); if(!n||n==='item')return;
        ff.push({name:n,type:this._strip(el.getAttribute('type')||'xsd:string')});
      });
      return ff;
    }
    _extractOps(){
      this._reanalyze();
      const ops=[];
      this._byLocal(this.doc,'portType').forEach(pt=>{
        this._byLocal(pt,'operation').forEach(op=>{
          const n=op.getAttribute('name'); if(!n)return;
          ops.push({name:n,inputMsg:this._strip(op.querySelector?op.querySelector('[localName="input"]')?.getAttribute('message')||'':''),
            inputEl:this._byLocal(op,'input')[0],outputEl:this._byLocal(op,'output')[0]});
        });
      });
      ops.forEach(op=>{
        op.inputMsg=this._strip(op.inputEl?.getAttribute('message')||'');
        op.outputMsg=this._strip(op.outputEl?.getAttribute('message')||'');
      });
      if(!ops.length){
        this._byLocal(this.doc,'operation').forEach(op=>{
          const n=op.getAttribute('name');
          if(n&&!ops.find(o=>o.name===n)) ops.push({name:n,inputMsg:n,outputMsg:n+'Response'});
        });
      }
      this.operations=[...new Map(ops.map(o=>[o.name,o])).values()];
    }
    _msgToElem(msgName){
      const m=this._byLocal(this.doc,'message').find(x=>x.getAttribute('name')===msgName);
      if(!m)return null;
      const p=this._byLocal(m,'part')[0]; if(!p)return null;
      return{elemRef:this._strip(p.getAttribute('element')||''),typeRef:this._strip(p.getAttribute('type')||'')};
    }
    getInputParams(opName){
      const op=this.operations.find(o=>o.name===opName);
      if(!op)return[];
      const ref=this._msgToElem(op.inputMsg);
      if(ref?.elemRef) return this._paramsFromElem(ref.elemRef);
      if(ref?.typeRef) return this._paramsFromType(ref.typeRef);
      return this._paramsFromElem(opName);
    }
    _paramsFromElem(name){
      let el=null;
      this._byLocal(this.doc,'schema').forEach(sc=>{
        this._kids(sc,'element').forEach(e=>{ if(e.getAttribute('name')===name)el=e; });
      });
      if(!el)return[];
      const ict=this._byLocal(el,'complexType')[0];
      if(ict)return this._paramsFromCT(ict);
      const tr=this._strip(el.getAttribute('type')||'');
      return tr?this._paramsFromType(tr):[];
    }
    _paramsFromType(name){
      const ct=this._byLocal(this.doc,'complexType').find(e=>e.getAttribute('name')===name);
      return ct?this._paramsFromCT(ct):[];
    }
    _paramsFromCT(ct){
      const seq=this._byLocal(ct,'sequence')[0]||this._byLocal(ct,'all')[0]||ct;
      const els=this._byLocal(seq,'element').filter(el=>['sequence','all','choice'].includes(el.parentElement?.localName));
      return els.map(el=>{
        const name=el.getAttribute('name'); if(!name)return null;
        const tr=this._strip(el.getAttribute('type')||'');
        let kind='SIMPLE',fields=[];
        if(!tr||this._isPrim(tr)){kind='SIMPLE';}
        else{
          const d=this.typeReg[tr];
          if(d){kind=d.kind;fields=d.fields||[];}
          else{
            const ict=this._byLocal(el,'complexType')[0];
            if(ict){const a=this._analyzeCT(ict);kind=a.kind;fields=a.fields||[];}
            else kind=this._guessKind(name);
          }
        }
        return{name,kind,fields};
      }).filter(Boolean);
    }
    _guessKind(n){
      if(n.toUpperCase().endsWith('RANGE')||/^M[TR][A-Z]/.test(n))return'RANGE';
      if(/^I[TE][A-Z]|^E[TE][A-Z]|^T[TE][A-Z]|^C[TE][A-Z]/.test(n))return'TABLE';
      if(/^IS[A-Z]|^ES[A-Z]|^CS[A-Z]/.test(n))return'STRUCT';
      return'SIMPLE';
    }
  }

  function parseSoapSample(text) {
    const doc=new DOMParser().parseFromString(text,'application/xml');
    function byL(r,ln){return Array.from(r.getElementsByTagName('*')).filter(e=>e.localName===ln);}
    function guess(n){
      if(!n)return'SIMPLE';
      if(n.toUpperCase().endsWith('RANGE')||/^M[TR][A-Z]/.test(n))return'RANGE';
      if(/^I[TE][A-Z]|^E[TE][A-Z]|^T[TE][A-Z]/.test(n))return'TABLE';
      if(/^IS[A-Z]|^ES[A-Z]/.test(n))return'STRUCT';
      return'SIMPLE';
    }
    const body=byL(doc,'Body')[0]; if(!body)throw new Error('SOAP Body bulunamadı');
    const func=Array.from(body.children).find(e=>e.nodeType===1); if(!func)throw new Error('Fonksiyon bulunamadı');
    const funcName=func.localName;
    const env=byL(doc,'Envelope')[0];
    let urn='';
    if(env){
      Array.from(env.attributes).forEach(a=>{
        if(a.value.includes('sap-com:document')||a.value.includes('sap:soap:functions'))urn=a.value;
        else if(!urn&&a.name.startsWith('xmlns:')&&!a.value.includes('xmlsoap.org')&&!a.value.includes('w3.org'))urn=a.value;
      });
    }
    const params=[];
    Array.from(func.childNodes).forEach(node=>{
      if(node.nodeType!==1)return;
      const name=node.localName;
      const ch=Array.from(node.children).filter(c=>c.nodeType===1);
      if(ch.length){
        const fn=ch[0]?.localName;
        if(fn==='item'){
          const iNames=Array.from(ch[0].children).map(c=>c.localName);
          const isRange=['SIGN','OPTION','LOW','HIGH'].every(n=>iNames.includes(n));
          params.push({name,kind:isRange?'RANGE':'TABLE',fields:isRange?[]:iNames.map(n=>({name:n,type:'xsd:string'}))});
        } else {
          const fields=ch.map(c=>({name:c.localName,type:'xsd:string'}));
          const isRange=['SIGN','OPTION','LOW','HIGH'].every(n=>fields.map(f=>f.name).includes(n));
          params.push({name,kind:isRange?'RANGE':'STRUCT',fields:isRange?[]:fields});
        }
      } else {
        params.push({name,kind:guess(name),fields:[]});
      }
    });
    return{funcName,params,urn};
  }

  function detectFormat(text) {
    const t=text.trim();
    const rm=t.match(/^<([^\s>?!]+)/);
    if(!rm)return'unknown';
    const rl=rm[1].split(':').pop().toLowerCase();
    if(rl==='definitions'||rl==='description')return'wsdl';
    if(rl==='envelope')return'soap';
    if(t.includes('portType')||t.includes('wsdl:operation'))return'wsdl';
    if(t.includes(':Envelope')||t.includes(':Body>'))return'soap';
    return'unknown';
  }

  function getCfg() {
    const iv=$('cfg-indent').value;
    const ind=iv==='tab'?'\t':' '.repeat(+iv);
    return{
      matchRoot:$('cfg-matchRoot').value.trim()||currentOp,
      funcName: $('cfg-funcName').value.trim() ||currentOp,
      urn:      $('cfg-urn').value.trim()      ||'urn:sap-com:document:sap:soap:functions:mc-style',
      soapPfx:  $('cfg-soapPfx').value.trim()  ||'soapenv',
      indent:ind,
      rangeMode:$('cfg-rangeMode').value,
      sign:     $('cfg-sign').value,
      option:   $('cfg-option').value,
      comments: $('cfg-comments').dataset.on==='true',
    };
  }

  function genXSL(params,cfg){
    const{indent:I,soapPfx:sp,matchRoot:mr,funcName:fn,urn,sign,option,comments}=cfg;
    const I2=I+I,I3=I2+I,I4=I3+I,I5=I4+I;
    const lines=[];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<xsl:stylesheet version="1.0"`);
    lines.push(`${I}xmlns:xsl="http://www.w3.org/1999/XSL/Transform"`);
    lines.push(`${I}xmlns:${sp}="http://schemas.xmlsoap.org/soap/envelope/"`);
    lines.push(`${I}xmlns:urn="${urn}"`);
    lines.push(`${I}exclude-result-prefixes="xsl">`);
    lines.push('');
    lines.push(`${I}<xsl:output method="xml" indent="yes" encoding="UTF-8"/>`);
    lines.push('');
    lines.push(`${I}<xsl:template match="/${mr}">`);
    lines.push(`${I2}<${sp}:Envelope>`);
    lines.push(`${I3}<${sp}:Header/>`);
    lines.push(`${I3}<${sp}:Body>`);
    lines.push(`${I4}<urn:${fn}>`);
    lines.push('');
    const en=params.filter(p=>p.enabled!==false);
    en.forEach((p,i)=>{ lines.push(...genParam(p,I5,I,{sign,option,comments})); if(i<en.length-1)lines.push(''); });
    lines.push('');
    lines.push(`${I4}</urn:${fn}>`);
    lines.push(`${I3}</${sp}:Body>`);
    lines.push(`${I2}</${sp}:Envelope>`);
    lines.push(`${I}</xsl:template>`);
    lines.push('');
    lines.push('</xsl:stylesheet>');
    return lines.join('\n');
  }

  function genParam(p,base,I,{sign,option,comments}){
    const{name,kind,fields,rangeMode}=p;
    const ls=[];
    switch(kind){
      case'SIMPLE':
        if(comments)ls.push(`${base}<!-- SIMPLE: ${name} -->`);
        ls.push(`${base}<${name}>`);
        ls.push(`${base}${I}<xsl:value-of select="${name}"/>`);
        ls.push(`${base}</${name}>`);
        break;
      case'RANGE':
        if(rangeMode==='foreach'){
          if(comments)ls.push(`${base}<!-- RANGE (çoklu): ${name} -->`);
          ls.push(`${base}<${name}>`);
          ls.push(`${base}${I}<xsl:for-each select="${name}">`);
          ls.push(`${base}${I}${I}<item>`);
          ls.push(`${base}${I}${I}${I}<SIGN>${sign}</SIGN>`);
          ls.push(`${base}${I}${I}${I}<OPTION>${option}</OPTION>`);
          ls.push(`${base}${I}${I}${I}<LOW><xsl:value-of select="."/></LOW>`);
          ls.push(`${base}${I}${I}${I}<HIGH/>`);
          ls.push(`${base}${I}${I}</item>`);
          ls.push(`${base}${I}</xsl:for-each>`);
          ls.push(`${base}</${name}>`);
        } else {
          if(comments)ls.push(`${base}<!-- RANGE (tek): ${name} -->`);
          ls.push(`${base}<${name}>`);
          ls.push(`${base}${I}<item>`);
          ls.push(`${base}${I}${I}<SIGN>${sign}</SIGN>`);
          ls.push(`${base}${I}${I}<OPTION>${option}</OPTION>`);
          ls.push(`${base}${I}${I}<LOW><xsl:value-of select="${name}"/></LOW>`);
          ls.push(`${base}${I}${I}<HIGH/>`);
          ls.push(`${base}${I}</item>`);
          ls.push(`${base}</${name}>`);
        }
        break;
      case'TABLE':
        if(comments)ls.push(`${base}<!-- TABLE: ${name} -->`);
        ls.push(`${base}<${name}>`);
        ls.push(`${base}${I}<xsl:for-each select="${name}/item">`);
        ls.push(`${base}${I}${I}<item>`);
        if(fields?.length) fields.forEach(f=>ls.push(`${base}${I}${I}${I}<${f.name}><xsl:value-of select="${f.name}"/></${f.name}>`));
        else ls.push(`${base}${I}${I}${I}<!-- Alanlar bulunamadı -->`);
        ls.push(`${base}${I}${I}</item>`);
        ls.push(`${base}${I}</xsl:for-each>`);
        ls.push(`${base}</${name}>`);
        break;
      case'STRUCT':
        if(comments)ls.push(`${base}<!-- STRUCT: ${name} -->`);
        ls.push(`${base}<${name}>`);
        if(fields?.length) fields.forEach(f=>ls.push(`${base}${I}<${f.name}><xsl:value-of select="${name}/${f.name}"/></${f.name}>`));
        else ls.push(`${base}${I}<!-- Alanlar bulunamadı -->`);
        ls.push(`${base}</${name}>`);
        break;
      default:
        ls.push(`${base}<${name}><!-- ${kind} --></${name}>`);
    }
    return ls;
  }

  function renderTree(){
    const tree=$('gen-paramTree'), empty=$('g-treeEmpty');
    if(!paramList.length){ empty.style.display='flex'; Array.from(tree.querySelectorAll('.param-item')).forEach(c=>c.remove()); return; }
    empty.style.display='none';
    Array.from(tree.querySelectorAll('.param-item')).forEach(c=>c.remove());

    paramList.forEach((p,idx)=>{
      const hasF=p.fields&&p.fields.length>0;
      const expand=p.kind==='RANGE'||hasF;
      const item=document.createElement('div'); item.className='param-item'; item.dataset.idx=idx;
      const hdr=document.createElement('div'); hdr.className='param-header';

      const chk=document.createElement('div');
      chk.className='p-chk'+(p.enabled!==false?' on':'');
      chk.innerHTML='<i class="ti ti-check"></i>';
      chk.onclick=e=>{e.stopPropagation();paramList[idx].enabled=paramList[idx].enabled===false;renderTree();};

      const nm=document.createElement('div'); nm.className='p-name'+(p.enabled===false?' off':''); nm.textContent=p.name;
      const badge=document.createElement('span'); badge.className=`type-badge badge-${p.kind}`; badge.textContent=p.kind;
      badge.onclick=e=>{e.stopPropagation();showTypePopup(e,idx);};

      hdr.appendChild(chk); hdr.appendChild(nm); hdr.appendChild(badge);

      if(expand){
        const arr=document.createElement('div'); arr.className='p-arr';
        arr.innerHTML='<i class="ti ti-chevron-right"></i>';
        const flds=document.createElement('div'); flds.className='p-fields';
        if(p.kind==='RANGE'){
          const cfg=getCfg();
          flds.innerHTML=`<div class="range-info">Mod: ${p.rangeMode||cfg.rangeMode}</div>`+
            ['SIGN','OPTION','LOW','HIGH'].map(n=>`<div class="fi"><div class="fi-dot"></div><span class="fi-name">${n}</span></div>`).join('');
        } else if(hasF){
          p.fields.forEach(f=>{
            const fi=document.createElement('div'); fi.className='fi';
            fi.innerHTML=`<div class="fi-dot"></div><span class="fi-name">${f.name}</span><span class="fi-type">${f.type||''}</span>`;
            flds.appendChild(fi);
          });
        }
        hdr.appendChild(arr);
        hdr.onclick=()=>{ const o=flds.classList.toggle('open'); arr.classList.toggle('open',o); };
        item.appendChild(hdr); item.appendChild(flds);
      } else {
        item.appendChild(hdr);
      }
      tree.appendChild(item);
    });

    const c={SIMPLE:0,RANGE:0,TABLE:0,STRUCT:0};
    paramList.forEach(p=>{if(c[p.kind]!==undefined)c[p.kind]++;});
    const parts=[];
    if(c.SIMPLE)parts.push(`<span style="color:var(--accent)">${c.SIMPLE} Simple</span>`);
    if(c.RANGE) parts.push(`<span style="color:var(--coral)">${c.RANGE} Range</span>`);
    if(c.TABLE) parts.push(`<span style="color:var(--pink)">${c.TABLE} Table</span>`);
    if(c.STRUCT)parts.push(`<span style="color:var(--teal)">${c.STRUCT} Struct</span>`);
    $('g-stCounts').innerHTML=parts.join(' · ');
  }

  function showTypePopup(e,idx){
    e.stopPropagation(); activeTypeIdx=idx;
    const p=$('typePopup');
    p.style.left=e.clientX+'px'; p.style.top=(e.clientY+4)+'px';
    p.classList.add('show');
  }

  $('typePopup').querySelectorAll('.tp-item').forEach(item=>{
    item.onclick=e=>{
      e.stopPropagation();
      if(activeTypeIdx>=0){paramList[activeTypeIdx].kind=item.dataset.type;renderTree();}
      $('typePopup').classList.remove('show'); activeTypeIdx=-1;
    };
  });
  document.addEventListener('click',()=>$('typePopup').classList.remove('show'));

  function setStatus(msg,cls){
    const el=$('g-stStatus');
    el.className='st'+(cls?' '+cls:'');
    el.innerHTML=`<div class="st-dot"></div><span>${msg}</span>`;
  }

  function loadParams(params,funcName,urn){
    if(urn) $('cfg-urn').value=urn;
    const sel=$('g-opSel');
    sel.innerHTML='';
    const opt=document.createElement('option'); opt.value=funcName; opt.textContent=funcName; sel.appendChild(opt);
    sel.disabled=false;
    parsedWSDL=null; currentOp=funcName;
    $('cfg-matchRoot').value=funcName; $('cfg-funcName').value=funcName;
    const cfg=getCfg();
    paramList=params.map(p=>({...p,enabled:true,rangeMode:p.kind==='RANGE'?cfg.rangeMode:undefined}));
    $('g-midTitle').textContent='PARAMETRELER \u2014 '+funcName;
    $('g-stOp').textContent=funcName;
    $('g-generate').disabled=false;
    renderTree();
  }

  function doParse(){
    const text=$('g-wsdl').value.trim();
    if(!text){toast('WSDL girişi boş','var(--red)');return;}
    const fmt=detectFormat(text);

    if(fmt==='soap'){
      try {
        const{funcName,params,urn}=parseSoapSample(text);
        loadParams(params,funcName,urn);
        setStatus(`SOAP sample: ${params.length} parametre`,'ok');
        toast(`\u2713 SOAP sample — ${params.length} parametre`);
      } catch(e){ setStatus('Hata: '+e.message,'err'); toast('\u274c '+e.message,'var(--red)'); }
      return;
    }

    try {
      parsedWSDL=new WSDLParser(text);
      if(!parsedWSDL.operations.length){
        try {
          const{funcName,params,urn}=parseSoapSample(text);
          loadParams(params,funcName,urn);
          setStatus(`SOAP sample: ${params.length} parametre`,'ok');
          toast(`\u2713 SOAP sample modunda — ${params.length} parametre`);
        } catch { setStatus('Operasyon bulunamadı','warn'); toast('\u26a0 Operasyon bulunamadı','var(--amber)'); }
        return;
      }
      if(parsedWSDL.targetNS) $('cfg-urn').value=parsedWSDL.targetNS;
      const sel=$('g-opSel');
      sel.innerHTML='<option value="">— Operasyon seçin —</option>';
      parsedWSDL.operations.forEach(op=>{ const o=document.createElement('option'); o.value=op.name; o.textContent=op.name; sel.appendChild(o); });
      sel.disabled=false;
      setStatus(`${parsedWSDL.operations.length} operasyon`,'ok');
      if(parsedWSDL.operations.length===1){ sel.value=parsedWSDL.operations[0].name; sel.dispatchEvent(new Event('change')); }
      toast(`\u2713 ${parsedWSDL.operations.length} operasyon ayrıştırıldı`);
    } catch(e){ setStatus('Hata: '+e.message,'err'); toast('\u274c '+e.message,'var(--red)'); parsedWSDL=null; }
  }

  $('g-opSel').addEventListener('change',function(){
    currentOp=this.value; if(!currentOp)return;
    if(!$('cfg-matchRoot').value) $('cfg-matchRoot').value=currentOp;
    if(!$('cfg-funcName').value)  $('cfg-funcName').value=currentOp;
    $('g-midTitle').textContent='PARAMETRELER \u2014 '+currentOp;
    $('g-stOp').textContent=currentOp;
    $('g-generate').disabled=false;
    if(!parsedWSDL){renderTree();return;}
    const cfg=getCfg();
    paramList=parsedWSDL.getInputParams(currentOp).map(p=>({...p,enabled:true,rangeMode:p.kind==='RANGE'?cfg.rangeMode:undefined}));
    renderTree(); setStatus(paramList.length+' parametre','ok');
    if(paramList.length) doGenerate();
  });

  // ── URL'den WSDL Getir & Otomatik Oluştur ──
  $('g-wsdlToggle').onclick = () => {
    const open = $('g-wsdlBody').classList.toggle('open');
    $('g-wsdlToggle').classList.toggle('open', open);
  };

  $('g-wsdlFetch').onclick = async () => {
    const url  = $('g-wsdlUrl').value.trim();
    const user = $('g-wsdlUser').value.trim();
    const pass = $('g-wsdlPass').value;

    if (!url)  { toast('✗ WSDL URL boş olamaz', 'var(--red)'); return; }
    if (!user) { toast('✗ Kullanıcı adı boş olamaz', 'var(--red)'); return; }

    const btn = $('g-wsdlFetch');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i>Getiriliyor...';

    try {
      const r = await window.api?.fetchWsdl({ url, username: user, password: pass });
      if (!r) { toast('✗ API bağlantısı kurulamadı', 'var(--red)'); return; }
      if (r.error) { toast('✗ ' + r.error, 'var(--red)'); return; }

      $('g-wsdl').value = formatXML(r.xml, '  ');
      toast('✓ WSDL alındı, ayrıştırılıyor...');
      doParse();
      $('g-wsdlBody').classList.remove('open');
      $('g-wsdlToggle').classList.remove('open');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-plug-connected"></i>Getir, Ayrıştır &amp; Oluştur';
    }
  };

  [$('g-wsdlUrl'), $('g-wsdlUser'), $('g-wsdlPass')].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') $('g-wsdlFetch').click(); });
  });

  function doGenerate(){
    if(!currentOp||!paramList.length)return;
    const cfg=getCfg();
    const pm=paramList.map(p=>({...p,rangeMode:p.rangeMode||cfg.rangeMode}));
    const xsl=genXSL(pm,cfg);
    const out=$('g-xslOut'); out.value=xsl;
    lineNums(out,$('g-xslNums'));
    $('g-xslStats').textContent=xsl.split('\n').length+' satır';
    $('g-copyXsl').disabled=false;
    $('g-saveXsl').disabled=false;
    $('g-outDot').style.background='var(--teal)';
    $('g-outDot').style.color='var(--teal)';

    // MIP Paketi sekmesindeki XSL alanını da güncel tut
    const mipXsl=document.getElementById('mip-xsl');
    if(mipXsl){
      mipXsl.value=xsl;
      lineNums(mipXsl,document.getElementById('mip-xslNums'));
      const mipName=document.getElementById('mip-xslName');
      if(mipName && !mipName.value.trim()) mipName.value=currentOp+'.xsl';
    }

    setStatus('XSL oluşturuldu','ok');
    toast('\u2713 XSL oluşturuldu');
  }

  $('g-load').onclick=async()=>{
    const r=await window.api?.openWSDL();
    if(!r)return;
    if(r.error){toast('\u274c '+r.error,'var(--red)');return;}
    $('g-wsdl').value=r.content;
    toast('\u2713 '+r.path.split(/[\\\/]/).pop()); doParse();
  };
  $('g-parse').onclick    = doParse;
  $('g-generate').onclick = doGenerate;
  $('g-copyXsl').onclick  = async ()=>{ const t=$('g-xslOut').value; if(t && await copyToClipboard(t)) toast('\u2713 XSL kopyalandı'); };
  $('g-selAll').onclick   = ()=>{ paramList.forEach(p=>p.enabled=true);  renderTree(); };
  $('g-selNone').onclick  = ()=>{ paramList.forEach(p=>p.enabled=false); renderTree(); };
  $('g-applySettings').onclick=()=>{ const cfg=getCfg(); paramList.filter(p=>p.kind==='RANGE').forEach(p=>{if(!p.rangeMode)p.rangeMode=cfg.rangeMode;}); renderTree(); if(currentOp)doGenerate(); $('settingsDrawer').classList.remove('open'); };
  $('g-settings').onclick = ()=>$('settingsDrawer').classList.toggle('open');
  $('sdClose').onclick    = ()=>$('settingsDrawer').classList.remove('open');
  $('g-clearWsdl').onclick= ()=>{
    $('g-wsdl').value=''; parsedWSDL=null; currentOp=null; paramList=[];
    $('g-opSel').innerHTML='<option value="">— Operasyon seçin —</option>'; $('g-opSel').disabled=true;
    $('g-generate').disabled=true; $('g-copyXsl').disabled=true; $('g-saveXsl').disabled=true;
    $('g-xslOut').value=''; lineNums($('g-xslOut'),$('g-xslNums'));
    $('g-stCounts').innerHTML=''; $('g-stOp').textContent=''; $('g-midTitle').textContent='PARAMETRELER';
    $('cfg-matchRoot').value=''; $('cfg-funcName').value='';
    $('g-outDot').style.background='var(--t3)';
    $('g-outDot').style.color='var(--t3)';
    renderTree(); setStatus('Hazır');
  };

  document.querySelectorAll('.tog').forEach(t=>{
    t.onclick=()=>{ const o=t.dataset.on==='true'; t.dataset.on=String(!o); t.classList.toggle('on',!o); };
  });

  const wsdlArea=$('g-wsdl'), drop=$('g-drop');
  wsdlArea.parentElement.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('show');});
  wsdlArea.parentElement.addEventListener('dragleave',()=>drop.classList.remove('show'));
  wsdlArea.parentElement.addEventListener('drop',e=>{
    e.preventDefault(); drop.classList.remove('show');
    const file=e.dataTransfer.files[0]; if(!file)return;
    const r=new FileReader(); r.onload=ev=>{wsdlArea.value=ev.target.result;toast('\u2713 '+file.name);doParse();}; r.readAsText(file);
  });

  function makeDivider(divId, leftId, minPx, maxPx) {
    const div = $(divId), left = $(leftId);
    let drag = false, startX = 0, startW = 0;
    div.addEventListener('mousedown', e => {
      drag = true;
      startX = e.clientX;
      startW = left.getBoundingClientRect().width;
      div.classList.add('drag');
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      const delta = e.clientX - startX;
      const newW = Math.min(Math.max(startW + delta, minPx), maxPx);
      left.style.flex = 'none';
      left.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => { drag = false; div.classList.remove('drag'); });
  }
  makeDivider('g-div1', 'g-left', 180, 600);
  makeDivider('g-div2', 'g-mid',  150, 500);

  syncScroll($('g-xslOut'),$('g-xslNums'));
  lineNums($('g-xslOut'),$('g-xslNums'));
  renderTree();

  // MIP sekmesinin WSDL'den otomatik XSL üretebilmesi için dışa açık arayüz
  window.GEN = {
    doParse,
    getXslText:  () => $('g-xslOut').value,
    getFuncName: () => currentOp,
  };
})();


// ═══════════════════════════════════════════════════
// MODULE: XSL → REQUEST
// ═══════════════════════════════════════════════════
const REQ = (() => {
  let rmode = 'json';
  const $ = id => document.getElementById(id);

  // ── XSL PARSER ──
  // XSL'den parametre listesini çıkarır
  // Her parametrenin tipini (RANGE/TABLE/STRUCT/SIMPLE) ve alanlarını tespit eder
  function parseXSL(xslText) {
    const doc = new DOMParser().parseFromString(xslText, 'application/xml');
    if (doc.querySelector('parsererror') || doc.querySelector('parseerror'))
      throw new Error('Geçersiz XML/XSL');

    function byL(root, ln) {
      return Array.from(root.getElementsByTagName('*')).filter(e => e.localName === ln);
    }

    // xsl:template match="/FuncName" → fonksiyon adını al
    const tmpl = byL(doc, 'template')[0];
    const matchAttr = tmpl?.getAttribute('match') || '';
    const funcName = matchAttr.replace(/^\//, '');

    // urn namespace → SOAP body tag
    const styleEl = doc.documentElement;
    let urnNs = '';
    Array.from(styleEl.attributes).forEach(a => {
      if (a.value.includes('sap-com:document') || a.value.includes('sap:soap:functions')) urnNs = a.value;
    });

    // soap prefix
    let soapPfx = 'soapenv';
    Array.from(styleEl.attributes).forEach(a => {
      if (a.value.includes('xmlsoap.org/soap/envelope')) soapPfx = a.localName === 'xmlns' ? '' : a.name.split(':')[1] || 'soapenv';
    });

    // urn: prefix'ini bul
    let urnPfx = 'urn';
    Array.from(styleEl.attributes).forEach(a => {
      if (a.value === urnNs && a.name.startsWith('xmlns:')) urnPfx = a.name.split(':')[1];
    });

    // fonksiyon gövdesi: urn:FuncName elemanının çocukları = parametreler
    const params = [];
    const funcEl = byL(doc, funcName)[0]
      || Array.from(doc.getElementsByTagName('*')).find(e => e.localName === funcName);

    if (!funcEl) {
      // Alternatif: template içindeki tüm direct child element'leri tara
      // (namespace-prefix'li elemanlar hariç)
      const body = byL(doc, 'Body')[0] || tmpl;
      if (body) {
        Array.from(body.children).forEach(child => {
          const ln = child.localName;
          if (!ln || ln === 'Header' || ln === 'Body' || ln === 'Envelope') return;
          // Namespace prefix'li mi? (soapenv:, urn: gibi) → skip
          if (child.tagName.includes(':')) return;
          params.push(detectParamType(child, byL));
        });
      }
    } else {
      Array.from(funcEl.children).forEach(child => {
        if (child.nodeType !== 1) return;
        params.push(detectParamType(child, byL));
      });
    }

    return { funcName, urnNs, urnPfx, soapPfx, params };
  }

  function detectParamType(el, byL) {
    const name = el.localName;
    // RANGE: içinde <item><SIGN>...<OPTION>...<LOW>...<HIGH>
    const items = Array.from(el.getElementsByTagName('item'));
    if (items.length) {
      const firstItem = items[0];
      const childNames = Array.from(firstItem.children).map(c => c.localName);
      const isRange = ['SIGN','OPTION','LOW','HIGH'].every(n => childNames.includes(n));
      if (isRange) return { name, kind: 'RANGE', fields: [] };
      // for-each → TABLE
      const forEaches = byL(el, 'for-each');
      if (forEaches.length) {
        const itemChildren = Array.from(items[0].children).map(c => c.localName);
        return { name, kind: 'TABLE', fields: itemChildren.map(f => ({ name: f })) };
      }
      return { name, kind: 'TABLE', fields: Array.from(firstItem.children).map(c => ({ name: c.localName })) };
    }
    // STRUCT: doğrudan child elementler var ve value-of yok (veya sadece nested elementler)
    const directChildren = Array.from(el.children).filter(c => !c.tagName.includes(':'));
    if (directChildren.length) {
      return { name, kind: 'STRUCT', fields: directChildren.map(c => ({ name: c.localName })) };
    }
    // SIMPLE: xsl:value-of var
    return { name, kind: 'SIMPLE', fields: [] };
  }

  // ── JSON ÜRETİCİ ──
  function toJSON(parsed) {
    const obj = {};
    parsed.params.forEach(p => {
      switch (p.kind) {
        case 'RANGE':
          obj[p.name] = { item: { Sign: 'I', Option: 'EQ', Low: '', High: '' } };
          break;
        case 'TABLE':
          const row = {};
          (p.fields || []).forEach(f => { row[f.name] = ''; });
          obj[p.name] = { item: [row] };
          break;
        case 'STRUCT':
          const st = {};
          (p.fields || []).forEach(f => { st[f.name] = ''; });
          obj[p.name] = st;
          break;
        case 'SIMPLE':
        default:
          obj[p.name] = '';
          break;
      }
    });
    return JSON.stringify(obj, null, 4);
  }

  // ── SOAP XML ÜRETİCİ ──
  function toSOAP(parsed) {
    const sp = $('r-soapPfx').value.trim() || 'soapenv';
    const up = parsed.urnPfx || 'urn';
    const urn = parsed.urnNs || 'urn:sap-com:document:sap:soap:functions:mc-style';
    const fn  = parsed.funcName;
    const I   = '    ';
    const lines = [];
    lines.push(`<${sp}:Envelope`);
    lines.push(`    xmlns:${sp}="http://schemas.xmlsoap.org/soap/envelope/"`);
    lines.push(`    xmlns:${up}="${urn}">`);
    lines.push(`    <${sp}:Header/>`);
    lines.push(`    <${sp}:Body>`);
    lines.push(`        <${up}:${fn}>`);

    parsed.params.forEach(p => {
      switch (p.kind) {
        case 'RANGE':
          lines.push(`${I}${I}<${p.name}>`);
          lines.push(`${I}${I}${I}<item>`);
          lines.push(`${I}${I}${I}${I}<SIGN>I</SIGN>`);
          lines.push(`${I}${I}${I}${I}<OPTION>EQ</OPTION>`);
          lines.push(`${I}${I}${I}${I}<LOW></LOW>`);
          lines.push(`${I}${I}${I}${I}<HIGH></HIGH>`);
          lines.push(`${I}${I}${I}</item>`);
          lines.push(`${I}${I}</${p.name}>`);
          break;
        case 'TABLE':
          lines.push(`${I}${I}<${p.name}>`);
          lines.push(`${I}${I}${I}<item>`);
          (p.fields || []).forEach(f => lines.push(`${I}${I}${I}${I}<${f.name}></${f.name}>`));
          lines.push(`${I}${I}${I}</item>`);
          lines.push(`${I}${I}</${p.name}>`);
          break;
        case 'STRUCT':
          lines.push(`${I}${I}<${p.name}>`);
          (p.fields || []).forEach(f => lines.push(`${I}${I}${I}<${f.name}></${f.name}>`));
          lines.push(`${I}${I}</${p.name}>`);
          break;
        case 'SIMPLE':
        default:
          lines.push(`${I}${I}<${p.name}></${p.name}>`);
          break;
      }
    });

    lines.push(`        </${up}:${fn}>`);
    lines.push(`    </${sp}:Body>`);
    lines.push(`</${sp}:Envelope>`);
    return lines.join('\n');
  }

  // ── CONVERT ──
  function doConvert() {
    const text = $('r-input').value.trim();
    if (!text) { toast('XSL girişi boş', 'var(--red)'); return; }

    let parsed;
    try {
      parsed = parseXSL(text);
    } catch (e) {
      setStatus('Hata: ' + e.message, 'err');
      toast('✗ ' + e.message, 'var(--red)');
      return;
    }

    if (!parsed.params.length) {
      setStatus('Parametre bulunamadı', 'warn');
      toast('⚠ Parametre tespit edilemedi', 'var(--amber)');
      return;
    }

    let result = '';
    try {
      result = rmode === 'json' ? toJSON(parsed) : toSOAP(parsed);
    } catch (e) {
      setStatus('Üretim hatası: ' + e.message, 'err');
      return;
    }

    $('r-output').value = result;
    lineNums($('r-output'), $('r-outNums'));
    $('r-outStats').textContent = result.split('\n').length + ' satır · ' + parsed.params.length + ' parametre';
    $('r-outDot').style.background = 'var(--teal)';
    $('r-outDot').style.color = 'var(--teal)';
    $('r-copy').disabled = false;
    $('r-save').disabled = false;
    $('r-stFunc').textContent = parsed.funcName;

    // parametre tipi dağılımı
    const c = { SIMPLE:0, RANGE:0, TABLE:0, STRUCT:0 };
    parsed.params.forEach(p => { if (c[p.kind] !== undefined) c[p.kind]++; });
    const parts = [];
    if (c.SIMPLE) parts.push(`<span style="color:var(--accent)">${c.SIMPLE} Simple</span>`);
    if (c.RANGE)  parts.push(`<span style="color:var(--coral)">${c.RANGE} Range</span>`);
    if (c.TABLE)  parts.push(`<span style="color:var(--pink)">${c.TABLE} Table</span>`);
    if (c.STRUCT) parts.push(`<span style="color:var(--teal)">${c.STRUCT} Struct</span>`);
    $('r-stInfo').innerHTML = parts.join(' · ');

    setStatus(rmode === 'json' ? 'JSON üretildi' : 'SOAP XML üretildi', 'ok');
    toast('✓ ' + (rmode === 'json' ? 'JSON' : 'SOAP XML') + ' üretildi');
  }

  function setStatus(msg, cls) {
    const el = $('r-stStatus');
    el.className = 'st' + (cls ? ' ' + cls : '');
    el.innerHTML = `<div class="st-dot"></div><span>${msg}</span>`;
  }

  // ── EVENTS ──
  // Mode tabs
  document.querySelectorAll('[data-rmode]').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('[data-rmode]').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      rmode = t.dataset.rmode;
      $('r-outLabel').textContent = 'REQUEST ÇIKTI — ' + (rmode === 'json' ? 'JSON' : 'XML (SOAP)');
      // Eğer zaten bir çıktı varsa yeniden üret
      if ($('r-input').value.trim() && $('r-output').value) doConvert();
    };
  });

  $('r-parse').onclick = doConvert;

  $('r-copy').onclick = async () => {
    const t = $('r-output').value;
    if (t && await copyToClipboard(t)) toast('✓ Kopyalandı');
  };
  $('r-save').onclick = async () => {
    const t = $('r-output').value; if (!t) return;
    const ext  = rmode === 'json' ? 'json' : 'xml';
    const name = (($('r-stFunc').textContent) || 'request') + '.' + ext;
    const r = await window.api?.saveFile({
      content: t,
      defaultName: name,
      filters: rmode === 'json'
        ? [{ name: 'JSON Dosyaları', extensions: ['json'] }, { name: 'Tüm Dosyalar', extensions: ['*'] }]
        : [{ name: 'XML Dosyaları', extensions: ['xml'] }, { name: 'Tüm Dosyalar', extensions: ['*'] }]
    });
    if (!r || r.canceled) return;
    if (r.error) { toast('✗ ' + r.error, 'var(--red)'); return; }
    toast('✓ Kaydedildi: ' + r.path.split(/[\\/]/).pop());
  };

  $('r-clear').onclick = () => {
    $('r-input').value = ''; $('r-output').value = '';
    lineNums($('r-input'), $('r-inNums'));
    lineNums($('r-output'), $('r-outNums'));
    $('r-inStats').textContent = ''; $('r-outStats').textContent = '';
    $('r-copy').disabled = true;
    $('r-save').disabled = true;
    $('r-outDot').style.background = 'var(--t3)';
    $('r-outDot').style.color = 'var(--t3)';
    $('r-stInfo').innerHTML = ''; $('r-stFunc').textContent = '';
    setStatus('Hazır');
  };

  $('r-loadXsl').onclick = async () => {
    const r = await window.api?.openWSDL();
    if (!r) return;
    if (r.error) { toast('✗ ' + r.error, 'var(--red)'); return; }
    $('r-input').value = r.content;
    lineNums($('r-input'), $('r-inNums'));
    $('r-inStats').textContent = r.content.split('\n').length + ' satır';
    toast('✓ ' + r.path.split(/[\\\/]/).pop());
    doConvert();
  };

  // Drag & drop
  const inp = $('r-input'), rdrop = $('r-drop');
  inp.parentElement.addEventListener('dragover', e => { e.preventDefault(); rdrop.classList.add('show'); });
  inp.parentElement.addEventListener('dragleave', () => rdrop.classList.remove('show'));
  inp.parentElement.addEventListener('drop', e => {
    e.preventDefault(); rdrop.classList.remove('show');
    const file = e.dataTransfer.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      $('r-input').value = ev.target.result;
      lineNums($('r-input'), $('r-inNums'));
      $('r-inStats').textContent = ev.target.result.split('\n').length + ' satır';
      toast('✓ ' + file.name); doConvert();
    };
    reader.readAsText(file);
  });

  // Input line nums + Ctrl+Enter
  inp.addEventListener('input', () => { lineNums(inp, $('r-inNums')); $('r-inStats').textContent = inp.value.split('\n').length + ' satır'; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doConvert(); } });
  inp.addEventListener('paste', () => { setTimeout(() => { lineNums(inp, $('r-inNums')); if (inp.value.trim()) doConvert(); }, 50); });

  // Divider
  (() => {
    const div = $('r-div'), left = $('r-left');
    let drag = false, startX = 0, startW = 0;
    div.addEventListener('mousedown', e => { drag=true; startX=e.clientX; startW=left.getBoundingClientRect().width; div.classList.add('drag'); e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      const delta = e.clientX - startX;
      const area = $('r-mainArea').getBoundingClientRect();
      const newW = Math.min(Math.max(startW + delta, area.width * 0.2), area.width * 0.8);
      left.style.flex = 'none'; left.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => { drag = false; div.classList.remove('drag'); });
  })();

  syncScroll($('r-output'), $('r-outNums'));
  syncScroll(inp, $('r-inNums'));
  lineNums(inp, $('r-inNums'));
  lineNums($('r-output'), $('r-outNums'));
})();


// ═══════════════════════════════════════════════════
// MODULE: MIP PAKETİ OLUŞTUR
// ═══════════════════════════════════════════════════
const MIP = (() => {
  const $ = id => document.getElementById(id);

  // XSL içeriğinden xmlRootName'i parse et (xsl:template match="/XYZ" → "XYZ")
  function parseXslRootName(xslText) {
    const m = xslText.match(/xsl:template[^>]+match=["']\/([^"'\/\s]+)["']/);
    return m ? m[1] : '';
  }

  // Timestamp: YYYYMMDD-HHmmssSSS formatı (MIP'in kendi formatı)
  function makeTimestamp() {
    const d = new Date();
    const pad = (n, l=2) => String(n).padStart(l, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-` +
           `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
  }

  // Benzersiz node ID üret
  function nodeId() {
    return 'dndnode_' + Date.now() + Math.floor(Math.random() * 10000);
  }

  // flowData node listesini üret (referans paketle birebir aynı yapı)
  function buildFlowData(cfg) {
    const ids = {
      start:      nodeId(),
      convJ2X:    nodeId(),
      xslt:       nodeId(),
      soap:       nodeId(),
      convX2J:    nodeId(),
      setCtx:     nodeId(),
      end:        nodeId(),
    };

    const nodes = [
      // START
      {
        id: ids.start, type: 'special',
        data: {
          objectType: 'processStart',
          connectorData: {
            StartState: {
              address: '', connectorType: 'REST', httpsEnable: false,
              jdbcQuery: '', jdbcUrl: '', userRole: '',
              fileDirectory: '', fileName: '', advancedSelection: '',
              fileProcessingMode: '', fileArchiveDirectory: '',
              fileProcessingSequence: '', skipEmptyFile: false,
              fileMaxSize: 10000, fileAdditionalParametersCheck: false,
              fileCron: '', isIdempotentActive: false,
              ftpUserName: '', ftpPassword: '', ftpHost: '', ftpPort: '',
              sftpUserName: '', sftpPassword: '', sftpHost: '', sftpPort: '',
              restAddress: cfg.restAddr,
              restMethod: 'POST',
              restKeepHeaders: false, isRestPollingActive: false,
              mqttQos: 0, jmsIsLocalConnection: false, jmsIsCompressed: false,
              jmsIsEncrypted: false, jmsIsTransferExchangeProperties: false,
              maxMessagesPerPoll: 0, concurrentConsumers: 0,
              odataBatchProcessing: false, odataUseManualQuery: false,
              odataKeyValue: false, directIsAsync: false,
              selection: false, addSearchterm: false,
              rabbitMqIsCompressed: false, rabbitMqIsEncrypted: false,
              solaceIsCompressed: false, solaceIsEncrypted: false,
              kafkaIsCompressed: false, kafkaIsEncrypted: false,
              webdavPort: 0, isWebdavIdempotentActive: false,
              isWebdavSkipEmptyFile: false, oftp2ConnectionId: 0,
              opcuaIsAnonymousLogin: false, opcuaKeyStoreId: 0,
              isSyncEndpoint: true
            }
          },
          label: 'Start'
        },
        position: { x: -400.0, y: 0 }
      },

      // CONVERTER J2X (JSON → XML)
      {
        id: ids.convJ2X, type: 'special',
        data: {
          objectType: 'processConverter',
          connectorData: {
            ConverterState: {
              convertType: 'J2X',
              xmlRootName: cfg.xmlRootName,
              xmlNamespace: '', xmlElementForCSV: '', jsonElementForCSV: '',
              csvSeparator: ',', csvHeaders: '', toXmlElement: '', toJsonElement: '',
              isFieldNameAsHeader: false, isDisabledXMLRootElement: false,
              isCsvHeaderIncludedAsFieldName: false, isEmptyStringNull: false,
              jsonElements: []
            }
          },
          label: 'Converter'
        },
        position: { x: -100.0, y: 0 }
      },

      // XSLT MAPPING
      {
        id: ids.xslt, type: 'special',
        data: {
          objectType: 'processXSLTMapping',
          connectorData: {
            XSLTState: {
              logXSLTPayload: false,
              xsltPath: cfg.xslName
            }
          },
          label: 'XSLT Mapping'
        },
        position: { x: 200.0, y: 0 }
      },

      // SOAP
      {
        id: ids.soap, type: 'special',
        data: {
          objectType: 'processSOAP',
          connectorData: {
            SOAPState: {
              soapAddress: cfg.soapUrl,
              soapAction: '', soapEnvelope: false,
              soapAuthorization: 'Basic',
              basicAuthResourceName: cfg.basicAuthResourceName,
              oAuth2ResourceName: '',
              soapTimeout: '700000',
              ClientCertificateResourceName: '',
              proxyEnable: false,
              contentType: 'text/xml; charset=utf-8',
              retryDelay: 0, maxRetries: 0,
              soapAllowedHeaders: false, soapAllowedHeaderList: []
            }
          },
          label: 'SOAP'
        },
        position: { x: 500.0, y: 0 }
      },

      // CONVERTER X2J (XML → JSON)
      {
        id: ids.convX2J, type: 'special',
        data: {
          objectType: 'processConverter',
          connectorData: {
            ConverterState: {
              convertType: 'X2J',
              xmlRootName: '', xmlNamespace: '', xmlElementForCSV: '',
              jsonElementForCSV: '', csvSeparator: ',', csvHeaders: '',
              toXmlElement: '', toJsonElement: '',
              isFieldNameAsHeader: false, isDisabledXMLRootElement: true,
              isCsvHeaderIncludedAsFieldName: false, isEmptyStringNull: false,
              jsonElements: []
            }
          },
          label: 'Converter'
        },
        position: { x: 800.0, y: 0 }
      },

      // SET CONTEXT
      {
        id: ids.setCtx, type: 'special',
        data: {
          objectType: 'processSetContext',
          connectorData: {
            SetContextState: {
              useSimpleQuery: false,
              contextBody: '',
              headerRows: [{ id: 0, headerName: 'Content-Type', headerType: 'Constant', headerValue: 'application/json' }],
              propertyRows: []
            }
          },
          label: 'Set Context'
        },
        position: { x: 1100.0, y: 0 }
      },

      // END
      {
        id: ids.end, type: 'special',
        data: { objectType: 'processEnd', connectorData: {}, label: 'End' },
        position: { x: 1400.0, y: 0 }
      },

      // EDGES
      { id: `reactflow__edge-${ids.start}normal-source-${ids.convJ2X}`,    source: ids.start,   target: ids.convJ2X, type: 'special', data: { edgeType: 'normal' } },
      { id: `reactflow__edge-${ids.convJ2X}normal-source-${ids.xslt}`,     source: ids.convJ2X, target: ids.xslt,    type: 'special', data: { edgeType: 'normal' } },
      { id: `reactflow__edge-${ids.xslt}normal-source-${ids.soap}`,        source: ids.xslt,    target: ids.soap,    type: 'special', data: { edgeType: 'normal' } },
      { id: `reactflow__edge-${ids.soap}normal-source-${ids.convX2J}`,     source: ids.soap,    target: ids.convX2J, type: 'special', data: { edgeType: 'normal' } },
      { id: `reactflow__edge-${ids.convX2J}normal-source-${ids.setCtx}`,   source: ids.convX2J, target: ids.setCtx,  type: 'special', data: { edgeType: 'normal' } },
      { id: `reactflow__edge-${ids.setCtx}normal-source-${ids.end}`,       source: ids.setCtx,  target: ids.end,     type: 'special', data: { edgeType: 'normal' } },
    ];

    return JSON.stringify(nodes);
  }

  // flows.json üret
  function buildFlowsJson(cfg, ts) {
    const now = new Date().toISOString();
    const flow = {
      id: null,
      createdDate: now,
      createdBy: 'admin',
      lastModifiedDate: now,
      lastModifiedBy: 'admin',
      flowId: cfg.flowId,
      flowName: cfg.flowId,
      flowPackageId: cfg.packageId,
      version: 1,
      flowDescription: cfg.flowDesc,
      flowConfiguration: null,
      flowData: buildFlowData(cfg)
    };
    return JSON.stringify([flow], null, 2);
  }

  // resources.json üret (XSL base64 encode)
  function buildResourcesJson(cfg, ts) {
    const xslB64 = btoa(unescape(encodeURIComponent(cfg.xslContent)));
    const now = new Date().toISOString();
    const res = {
      id: null,
      createdDate: now,
      createdBy: 'admin',
      lastModifiedDate: now,
      lastModifiedBy: 'admin',
      resourceName: cfg.xslName,
      flowId: cfg.flowId,
      resourceType: 'xsl',
      version: 1,
      dataFormat: 'XML',
      resourceData: xslB64
    };
    return JSON.stringify([res], null, 2);
  }

  // Validasyon
  function validate() {
    const required = [
      ['mip-packageId', 'Package ID'],
      ['mip-flowId',    'Flow ID'],
      ['mip-restAddr',  'REST Address'],
      ['mip-soapUrl',   'SOAP Endpoint URL'],
      ['mip-authUser',  'Basic Auth Kullanıcı Adı'],
      ['mip-xslName',   'XSL Dosya Adı'],
    ];
    for (const [id, label] of required) {
      if (!$(id).value.trim()) {
        toast(`✗ ${label} boş olamaz`, 'var(--red)');
        $(id).focus();
        return false;
      }
    }
    if (!$('mip-xsl').value.trim()) {
      toast('✗ XSL içeriği boş olamaz', 'var(--red)');
      $('mip-xsl').focus();
      return false;
    }
    return true;
  }

  function setStatus(msg, cls) {
    const el = $('mip-stStatus');
    el.className = 'st' + (cls ? ' ' + cls : '');
    el.innerHTML = `<div class="st-dot"></div><span>${msg}</span>`;
  }

  // XSL dosya adı değişince .xsl uzantısını otomatik ekle
  $('mip-xslName').addEventListener('blur', () => {
    let v = $('mip-xslName').value.trim();
    if (v && !v.toLowerCase().endsWith('.xsl') && !v.toLowerCase().endsWith('.xslt')) {
      $('mip-xslName').value = v + '.xsl';
    }
  });

  // XSL yapıştırılınca xmlRootName'i otomatik doldur (bilgi amaçlı status)
  $('mip-xsl').addEventListener('paste', () => {
    setTimeout(() => {
      lineNums($('mip-xsl'), $('mip-xslNums'));
      const root = parseXslRootName($('mip-xsl').value);
      if (root) setStatus(`xmlRootName tespit edildi: ${root}`, 'ok');
    }, 50);
  });
  $('mip-xsl').addEventListener('input', () => lineNums($('mip-xsl'), $('mip-xslNums')));

  // XSL dosyadan yükle
  $('mip-loadXsl').onclick = async () => {
    const r = await window.api?.openWSDL();
    if (!r) return;
    if (r.error) { toast('✗ ' + r.error, 'var(--red)'); return; }
    $('mip-xsl').value = r.content;
    lineNums($('mip-xsl'), $('mip-xslNums'));
    const root = parseXslRootName(r.content);
    const fname = r.path.split(/[\\\/]/).pop();
    // XSL dosya adını otomatik doldur
    if (!$('mip-xslName').value.trim()) $('mip-xslName').value = fname;
    toast('✓ ' + fname);
    if (root) setStatus(`xmlRootName tespit edildi: ${root}`, 'ok');
  };

  // Temizle
  $('mip-clear').onclick = () => {
    ['mip-packageId','mip-flowId','mip-flowDesc','mip-restAddr','mip-soapUrl','mip-xslName'].forEach(id => $(id).value = '');
    $('mip-authUser').value = 'sap_qa_user';
    $('mip-xsl').value = '';
    lineNums($('mip-xsl'), $('mip-xslNums'));
    $('mip-stInfo').textContent = '';
    setStatus('Hazır');
  };

  // ZIP OLUŞTUR
  $('mip-generate').onclick = async () => {
    if (!validate()) return;

    const xslContent = $('mip-xsl').value;
    const cfg = {
      packageId:   $('mip-packageId').value.trim(),
      flowId:      $('mip-flowId').value.trim(),
      flowDesc:    $('mip-flowDesc').value.trim(),
      restAddr:    $('mip-restAddr').value.trim(),
      soapUrl:     $('mip-soapUrl').value.trim(),
      basicAuthResourceName: $('mip-authUser').value.trim(),
      xslName:     $('mip-xslName').value.trim(),
      xslContent,
      xmlRootName: parseXslRootName(xslContent) || $('mip-flowId').value.trim(),
    };

    setStatus('Oluşturuluyor...', '');
    $('mip-stInfo').textContent = `Flow: ${cfg.flowId} | Package: ${cfg.packageId}`;

    const ts = makeTimestamp();
    const flowsJson     = buildFlowsJson(cfg, ts);
    const resourcesJson = buildResourcesJson(cfg, ts);

    const r = await window.api?.mipZip({ flowsJson, resourcesJson, timestamp: ts, flowId: cfg.flowId });
    if (!r || r.canceled) { setStatus('İptal edildi'); return; }
    if (r.error) { setStatus('Hata: ' + r.error, 'err'); toast('✗ ' + r.error, 'var(--red)'); return; }

    const fname = r.path.split(/[\\/]/).pop();
    setStatus('ZIP oluşturuldu ✓', 'ok');
    toast('✓ ' + fname);

  };

  lineNums($('mip-xsl'), $('mip-xslNums'));
  syncScroll($('mip-xsl'), $('mip-xslNums'));
})();


// ═══════════════════════════════════════════════════
// WSDL HELPER (MIP sekmesi içi)
// ═══════════════════════════════════════════════════
const WSDL_HELPER = (() => {
  const $ = id => document.getElementById(id);

  // Toggle
  $('wsdl-toggle').onclick = () => {
    const open = $('wsdl-body').classList.toggle('open');
    $('wsdl-toggle').classList.toggle('open', open);
  };

  // WSDL XML'den endpoint'leri parse et
  function parseEndpoints(xmlText) {
    const results = [];
    const s11 = [...xmlText.matchAll(/<(?:\w+:)?address[^>]+location=["']([^"']+)["'][^>]*>/g)];
    s11.forEach(m => {
      const url = m[1];
      if (!url.startsWith('http')) return;
      // soap12 port'u içeren binding adına bak
      const isSOAP12 = xmlText.indexOf(m[0]) > 0 &&
        xmlText.substring(Math.max(0, xmlText.indexOf(m[0]) - 300), xmlText.indexOf(m[0])).match(/soap12|Soap12|SOAP12/);
      results.push({ version: isSOAP12 ? 'SOAP 1.2' : 'SOAP 1.1', url });
    });
    // Daha kesin SOAP 1.2 tespiti: soap12:address
    const s12 = [...xmlText.matchAll(/<soap12:address[^>]+location=["']([^"']+)["']/g)];
    s12.forEach(m => {
      const existing = results.find(r => r.url === m[1]);
      if (existing) existing.version = 'SOAP 1.2';
      else results.push({ version: 'SOAP 1.2', url: m[1] });
    });
    // Tekrarları temizle
    return results.filter((r, i, a) => a.findIndex(x => x.url === r.url) === i);
  }

  // Sonuçları render et
  function renderResults(endpoints) {
    const container = $('wsdl-results');
    container.innerHTML = '';
    container.style.display = 'flex';

    if (!endpoints.length) {
      container.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:4px">Endpoint bulunamadı — WSDL içinde address tag\'i yok.</div>';
      return;
    }

    endpoints.forEach(ep => {
      const div = document.createElement('div');
      div.className = 'wsdl-result-item';
      div.title = 'Tıkla → SOAP Endpoint URL alanına kopyala';
      const verClass = ep.version === 'SOAP 1.2' ? 'v12' : 'v11';
      div.innerHTML = `
        <span class="wsdl-ver ${verClass}">${ep.version}</span>
        <span class="wsdl-url-text">${ep.url}</span>
        <span class="wsdl-use">Kullan →</span>
      `;
      div.onclick = () => {
        $('mip-soapUrl').value = ep.url;
        toast('✓ Endpoint kopyalandı → SOAP URL alanına eklendi');
        // Helper'ı kapat
        $('wsdl-body').classList.remove('open');
        $('wsdl-toggle').classList.remove('open');
      };
      container.appendChild(div);
    });
  }

  // Fetch butonu
  $('wsdl-fetch').onclick = async () => {
    const url  = $('wsdl-url').value.trim();
    const user = $('wsdl-user').value.trim();
    const pass = $('wsdl-pass').value;

    if (!url)  { toast('✗ WSDL URL boş olamaz', 'var(--red)'); return; }
    if (!user) { toast('✗ Kullanıcı adı boş olamaz', 'var(--red)'); return; }

    const btn = $('wsdl-fetch');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i>Bağlanıyor...';
    $('wsdl-results').style.display = 'none';
    $('wsdl-results').innerHTML = '';

    try {
      const r = await window.api?.fetchWsdl({ url, username: user, password: pass });

      if (!r) { toast('✗ API bağlantısı kurulamadı', 'var(--red)'); return; }
      if (r.error) { toast('✗ ' + r.error, 'var(--red)'); return; }

      const endpoints = parseEndpoints(r.xml);
      renderResults(endpoints);

      if (endpoints.length) {
        toast(`✓ ${endpoints.length} endpoint bulundu`);
      } else {
        toast('⚠ WSDL alındı ama endpoint bulunamadı', 'var(--amber)');
      }

      // WSDL'i XSL Generator'a da yükleyip otomatik XSL üretmeyi dene
      // (tek operasyon varsa doGenerate() otomatik tetiklenir ve mip-xsl'i de doldurur)
      $('g-wsdl').value = formatXML(r.xml, '  ');
      window.GEN?.doParse();
      if (window.GEN?.getXslText()) {
        toast('✓ XSL otomatik oluşturuldu ve dolduruldu');
      } else {
        toast('⚠ WSDL\'de birden fazla operasyon var — XSL Generator sekmesinden operasyonu seçin', 'var(--amber)');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-plug-connected"></i>Bağlan &amp; Endpoint Bul';
    }
  };

  // Enter tuşu desteği
  [$('wsdl-url'), $('wsdl-user'), $('wsdl-pass')].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('wsdl-fetch').click();
    });
  });
})();

// ═══════════════════════════════════════════════════
// MODULE: DIFF (XML / JSON KARŞILAŞTIRMA)
// ═══════════════════════════════════════════════════
const DIFF = (() => {
  const $ = id => document.getElementById(id);
  const inputA = $('d-inputA'), inputB = $('d-inputB');
  const aNums  = $('d-aNums'),  bNums  = $('d-bNums');
  const aStats = $('d-aStats'), bStats = $('d-bStats');
  const paneA  = $('d-paneA'),  paneB  = $('d-paneB');
  const stStatus = $('d-stStatus'), stCounts = $('d-stCounts');
  let ignoreWs = false;

  function detectType(text) {
    const t = text.trim();
    if (!t) return null;
    if (t.startsWith('<')) return 'xml';
    if (t.startsWith('{')||t.startsWith('[')) return 'json';
    try { JSON.parse(t); return 'json'; } catch {}
    const d = new DOMParser().parseFromString(t,'application/xml');
    if (!d.querySelector('parsererror')&&!d.querySelector('parseerror')) return 'xml';
    return null;
  }

  function getIndent() {
    const v = $('d-indent').value;
    return v === 'tab' ? '\t' : ' '.repeat(+v);
  }

  function normalize(text) {
    const t = text.trim();
    if (!t) return { text: '', ok: true };
    const type = detectType(t);
    const ind  = getIndent();
    if (type === 'json') { try { return { text: JSON.stringify(JSON.parse(t), null, ind), ok:true }; } catch { return { text: t, ok:false }; } }
    if (type === 'xml')  { try { return { text: formatXML(t, ind), ok:true }; } catch { return { text: t, ok:false }; } }
    return { text: t, ok:false };
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Klasik LCS tabanlı satır diff'i
  function lineDiff(aLines, bLines) {
    const n = aLines.length, m = bLines.length;
    const dp = Array.from({length: n+1}, () => new Int32Array(m+1));
    for (let i=n-1;i>=0;i--) {
      for (let j=m-1;j>=0;j--) {
        dp[i][j] = aLines[i]===bLines[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    const ops = [];
    let i=0, j=0;
    while (i<n && j<m) {
      if (aLines[i]===bLines[j]) { ops.push({type:'eq'}); i++; j++; }
      else if (dp[i+1][j] >= dp[i][j+1]) { ops.push({type:'del'}); i++; }
      else { ops.push({type:'add'}); j++; }
    }
    while (i<n) { ops.push({type:'del'}); i++; }
    while (j<m) { ops.push({type:'add'}); j++; }
    return ops;
  }

  function renderEmpty(pane, msg) {
    pane.innerHTML = `<div class="diff-empty"><i class="ti ti-git-compare"></i>${msg}</div>`;
  }

  function doCompare() {
    const rawA = inputA.value, rawB = inputB.value;
    if (!rawA.trim() && !rawB.trim()) { toast('Karşılaştırmak için A ve B girin', 'var(--amber)'); return; }

    const nA = normalize(rawA), nB = normalize(rawB);
    const warn = [];
    if (!nA.ok && rawA.trim()) warn.push('A');
    if (!nB.ok && rawB.trim()) warn.push('B');
    if (warn.length) toast(`⚠ ${warn.join(', ')} geçerli XML/JSON değil — ham metin karşılaştırılıyor`, 'var(--amber)');

    const rawLinesA = nA.text === '' ? [] : nA.text.split('\n');
    const rawLinesB = nB.text === '' ? [] : nB.text.split('\n');
    const cmpLinesA = ignoreWs ? rawLinesA.map(l=>l.trim()) : rawLinesA;
    const cmpLinesB = ignoreWs ? rawLinesB.map(l=>l.trim()) : rawLinesB;

    const ops = lineDiff(cmpLinesA, cmpLinesB);

    let rowsA = '', rowsB = '', numA = 0, numB = 0, added = 0, removed = 0, unchanged = 0;
    let ai = 0, bi = 0;
    ops.forEach(op => {
      if (op.type === 'eq') {
        numA++; numB++; unchanged++;
        rowsA += `<div class="dl dl-eq"><span class="dl-num">${numA}</span><span class="dl-txt">${escapeHtml(rawLinesA[ai])}</span></div>`;
        rowsB += `<div class="dl dl-eq"><span class="dl-num">${numB}</span><span class="dl-txt">${escapeHtml(rawLinesB[bi])}</span></div>`;
        ai++; bi++;
      } else if (op.type === 'del') {
        numA++; removed++;
        rowsA += `<div class="dl dl-del"><span class="dl-num">${numA}</span><span class="dl-txt">${escapeHtml(rawLinesA[ai])}</span></div>`;
        rowsB += `<div class="dl dl-blank"><span class="dl-num">&nbsp;</span><span class="dl-txt">&nbsp;</span></div>`;
        ai++;
      } else {
        numB++; added++;
        rowsA += `<div class="dl dl-blank"><span class="dl-num">&nbsp;</span><span class="dl-txt">&nbsp;</span></div>`;
        rowsB += `<div class="dl dl-add"><span class="dl-num">${numB}</span><span class="dl-txt">${escapeHtml(rawLinesB[bi])}</span></div>`;
        bi++;
      }
    });

    paneA.innerHTML = rowsA || '<div class="diff-empty"><i class="ti ti-git-compare"></i>A boş</div>';
    paneB.innerHTML = rowsB || '<div class="diff-empty"><i class="ti ti-git-compare"></i>B boş</div>';

    if (added===0 && removed===0) {
      stStatus.className = 'st ok';
      stStatus.innerHTML = '<div class="st-dot"></div><span>Fark yok — içerikler aynı</span>';
    } else {
      stStatus.className = 'st warn';
      stStatus.innerHTML = '<div class="st-dot"></div><span>Fark bulundu</span>';
    }
    stCounts.innerHTML = `<span style="color:var(--teal)">+${added}</span>&nbsp;&nbsp;<span style="color:var(--red)">−${removed}</span>&nbsp;&nbsp;<span style="color:var(--t3)">${unchanged} değişmedi</span>`;

    stats(rawA, aStats);
    stats(rawB, bStats);
  }

  $('d-compare').onclick = doCompare;

  $('d-wsToggle').onclick = () => {
    ignoreWs = !ignoreWs;
    $('d-wsToggle').classList.toggle('toggled', ignoreWs);
  };

  $('d-swap').onclick = () => {
    const tmp = inputA.value; inputA.value = inputB.value; inputB.value = tmp;
    lineNums(inputA, aNums); lineNums(inputB, bNums);
    stats(inputA.value, aStats); stats(inputB.value, bStats);
    renderEmpty(paneA, 'Karşılaştırmak için "Karşılaştır" tıklayın');
    renderEmpty(paneB, 'Karşılaştırmak için "Karşılaştır" tıklayın');
    stStatus.className = 'st'; stStatus.innerHTML = '<div class="st-dot"></div><span>Hazır</span>';
    stCounts.innerHTML = '';
  };

  $('d-clear').onclick = () => {
    inputA.value = ''; inputB.value = '';
    lineNums(inputA, aNums); lineNums(inputB, bNums);
    stats('', aStats); stats('', bStats);
    renderEmpty(paneA, 'A girin');
    renderEmpty(paneB, 'B girin');
    stStatus.className = 'st'; stStatus.innerHTML = '<div class="st-dot"></div><span>Hazır</span>';
    stCounts.innerHTML = '';
  };

  $('d-loadA').onclick = async () => {
    const r = await window.api?.openWSDL();
    if (r?.content) { inputA.value = r.content; lineNums(inputA, aNums); stats(inputA.value, aStats); toast('✓ A yüklendi'); }
    else if (r?.error) toast('✗ ' + r.error, 'var(--red)');
  };
  $('d-loadB').onclick = async () => {
    const r = await window.api?.openWSDL();
    if (r?.content) { inputB.value = r.content; lineNums(inputB, bNums); stats(inputB.value, bStats); toast('✓ B yüklendi'); }
    else if (r?.error) toast('✗ ' + r.error, 'var(--red)');
  };

  [[inputA,aNums,aStats],[inputB,bNums,bStats]].forEach(([ta,nums,stEl]) => {
    ta.addEventListener('input', () => { lineNums(ta,nums); stats(ta.value,stEl); });
    ta.addEventListener('keydown', e => {
      if (e.key==='Enter'&&(e.ctrlKey||e.metaKey)) { e.preventDefault(); doCompare(); }
      if (e.key==='Tab') { e.preventDefault(); const s=ta.selectionStart,en=ta.selectionEnd; ta.value=ta.value.substring(0,s)+'  '+ta.value.substring(en); ta.selectionStart=ta.selectionEnd=s+2; lineNums(ta,nums); }
    });
    ta.addEventListener('paste', () => { setTimeout(() => { lineNums(ta,nums); stats(ta.value,stEl); }, 50); });
    syncScroll(ta, nums);
  });

  // Girdi panelleri arası sürüklenebilir ayırıcı
  (() => {
    const div = $('d-div'), left = $('d-left');
    let drag = false, startX = 0, startW = 0;
    div.addEventListener('mousedown', e => { drag=true; startX=e.clientX; startW=left.getBoundingClientRect().width; div.classList.add('drag'); e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      const delta = e.clientX - startX;
      const area = $('d-inputArea').getBoundingClientRect();
      const newW = Math.min(Math.max(startW+delta, area.width*0.2), area.width*0.8);
      left.style.flex = 'none'; left.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => { drag=false; div.classList.remove('drag'); });
  })();

  // Fark panellerini birlikte kaydır
  (() => {
    let syncing = false;
    paneA.addEventListener('scroll', () => { if (syncing) return; syncing=true; paneB.scrollTop=paneA.scrollTop; paneB.scrollLeft=paneA.scrollLeft; syncing=false; });
    paneB.addEventListener('scroll', () => { if (syncing) return; syncing=true; paneA.scrollTop=paneB.scrollTop; paneA.scrollLeft=paneB.scrollLeft; syncing=false; });
  })();

  lineNums(inputA, aNums);
  lineNums(inputB, bNums);
  renderEmpty(paneA, 'Sol tarafa A, sağa B yapıştırıp "Karşılaştır" tıklayın');
  renderEmpty(paneB, 'Sol tarafa A, sağa B yapıştırıp "Karşılaştır" tıklayın');
})();
