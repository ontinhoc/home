// Basic front-end content protection deterrents
// Note: Client-side protections can be bypassed by advanced users.
(function(){
  try{
    document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, {capture:true});
    var blockCombos = function(e){
      var k = (e.key || '').toLowerCase();
      var ctrlLike = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on macOS
      if (e.key === 'F12') { e.preventDefault(); return; }
      if (ctrlLike && (k === 'u' || k === 's' || k === 'p')) { e.preventDefault(); return; }
      if (ctrlLike && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) { e.preventDefault(); return; }
    };
    document.addEventListener('keydown', blockCombos, {capture:true});
  }catch(_){/* no-op */}
})();

