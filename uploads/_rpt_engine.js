(function(){
  var PX=96,PH=11*PX,PT=0.65*PX,PB=0.75*PX,FH=38;
  var AVAIL=PH-PT-FH-PB;
  function reflowPage(page){
    var inner=page.querySelector('.rpt-inner');
    if(!inner)return;
    if(inner.scrollHeight<=AVAIL)return;
    var children=Array.from(inner.children);
    if(!children.length)return;
    var structural=[],content=[];
    children.forEach(function(c){
      if(c.classList.contains('rpt-hdr')||c.classList.contains('rpt-title')||c.classList.contains('rpt-body')){structural.push(c);}
      else{content.push(c);}
    });
    if(!content.length)return;
    var hdr=inner.querySelector('.rpt-hdr');
    var hdrH=hdr?(hdr.offsetHeight+14):0;
    var structH=0;
    structural.forEach(function(s){if(!s.classList.contains('rpt-hdr'))structH+=s.offsetHeight+8;});
    var chunks=[],cur=[],used=0,avail=AVAIL-hdrH-structH;
    content.forEach(function(c){
      var h=c.offsetHeight+8;
      if(used+h>avail&&cur.length){chunks.push(cur);cur=[];used=0;avail=AVAIL-hdrH;}
      cur.push(c);used+=h;
    });
    if(cur.length)chunks.push(cur);
    if(chunks.length<=1)return;
    var parent=page.parentNode;
    var pageIdx=Array.from(parent.children).indexOf(page);
    content.forEach(function(c){inner.removeChild(c);});
    chunks[0].forEach(function(c){inner.appendChild(c);});
    var hdrLbl=page.querySelector('.rpt-hdr-lbl');
    var lbl=hdrLbl?hdrLbl.textContent.replace(/\s*\(\d+\s*of\s*\d+\)/i,'').trim():'';
    var total=chunks.length;
    if(hdrLbl&&total>1)hdrLbl.textContent=lbl+' (1 of '+total+')';
    for(var ci=1;ci<chunks.length;ci++){
      var np=page.cloneNode(false);
      var ni=document.createElement('div');
      ni.className='rpt-inner';
      if(hdr){var nh=hdr.cloneNode(true);var nl=nh.querySelector('.rpt-hdr-lbl');if(nl)nl.textContent=lbl+' ('+(ci+1)+' of '+total+')';ni.appendChild(nh);}
      chunks[ci].forEach(function(c){ni.appendChild(c);});
      np.appendChild(ni);
      var origFtr=page.querySelector('.rpt-ftr');
      if(origFtr)np.appendChild(origFtr.cloneNode(true));
      var ref=parent.children[pageIdx+ci];
      if(ref)parent.insertBefore(np,ref);else parent.appendChild(np);
    }
  }
  function renumber(){
    var n=0;
    document.querySelectorAll('.rpt-page:not(.dark)').forEach(function(p){
      var fr=p.querySelector('.rpt-ftr .fr');
      if(fr){n++;fr.textContent='Page '+n;}
    });
  }
  setTimeout(function(){
    document.querySelectorAll('.rpt-page:not(.dark)').forEach(function(p){
      try{reflowPage(p);}catch(e){}
    });
    renumber();
    var c=document.getElementById('tb-pgctr');
    if(c){var ps=document.querySelectorAll('.rpt-page');c.textContent='1 / '+ps.length;}
  },300);
})();