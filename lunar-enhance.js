(function(){
  function parseTitle(box){
    try{
      var t = (box.querySelector('#lc-title')||{}).textContent || '';
      var m = t.match(/(\d{1,2})\s*\/\s*(\d{4})/);
      if (!m) return null;
      return {month: parseInt(m[1],10), year: parseInt(m[2],10)};
    }catch(e){return null}
  }
  function linkFor(box, y, m, d){
    var tpl = box.getAttribute('data-linktemplate') || 'https://licham.net/?date={YYYY}-{MM}-{DD}';
    function pad(n){ return String(n).padStart(2,'0'); }
    return tpl.replace('{YYYY}', y).replace('{MM}', pad(m)).replace('{DD}', pad(d));
  }
  function monthLinkFor(box, y, m){
    var tpl = box.getAttribute('data-monthlinktemplate') || 'https://licham.net/?month={YYYY}-{MM}';
    function pad(n){ return String(n).padStart(2,'0'); }
    return tpl.replace('{YYYY}', y).replace('{MM}', pad(m));
  }
  function enhance(){
    var box = document.getElementById('lunar-widget'); if (!box) return;
    var grid = box.querySelector('#lc-grid'); if (!grid) return;
    var info = parseTitle(box); if (!info) return;
    var y=info.year, m=info.month;
    var dayCells = Array.from(grid.querySelectorAll('.lunar-cell'));
    if (dayCells.length===0) return;
    var firstNonOff = dayCells.findIndex(function(el){ return !el.classList.contains('off-month'); });
    var lastNonOff = (function(){ for (var i=dayCells.length-1;i>=0;i--){ if(!dayCells[i].classList.contains('off-month')) return i; } return dayCells.length-1; })();
    dayCells.forEach(function(cell, idx){
      var d = parseInt((cell.querySelector('.solar-day')||{}).textContent||'0',10) || 1;
      var cy=y, cm=m;
      if (idx < firstNonOff) { cm = m-1; if (cm<1){ cm=12; cy--; } }
      else if (idx > lastNonOff) { cm = m+1; if (cm>12){ cm=1; cy++; } }
      var url = linkFor(box, cy, cm, d);
      if (cell.tagName.toLowerCase() !== 'a'){
        var a = document.createElement('a');
        a.className = cell.className;
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        while(cell.firstChild) a.appendChild(cell.firstChild);
        cell.replaceWith(a); cell = a;
      } else {
        cell.setAttribute('href', url);
      }
      var mini = cell.querySelector('.lunar-mini');
      if (mini){
        var txt = (mini.textContent||'').trim();
        if (txt === '15') cell.classList.add('good-day');
        if (txt.indexOf('1/') === 0) cell.classList.add('first-lunar');
      }
    });
  }

  function bindPills(){
    var box = document.getElementById('lunar-widget'); if (!box) return;
    var weekday = box.querySelector('#lc-weekday');
    if (weekday){
      weekday.addEventListener('click', function(){
        var t = new Date();
        window.open(linkFor(box, t.getFullYear(), t.getMonth()+1, t.getDate()), '_blank', 'noopener');
      });
    }
    var lmp = box.querySelector('#lc-lunar-month');
    if (lmp){
      lmp.addEventListener('click', function(){
        var info = parseTitle(box); if (!info) return;
        window.open(monthLinkFor(box, info.year, info.month), '_blank', 'noopener');
      });
    }
  }

  function init(){
    enhance(); bindPills();
    try {
      var box = document.getElementById('lunar-widget');
      var grid = box && box.querySelector('#lc-grid');
      if (grid){ new MutationObserver(function(){ enhance(); }).observe(grid, {childList:true, subtree:true}); }
    } catch(e){}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

