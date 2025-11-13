/* Lunar Calendar (Âm dương) for VN (TZ +7)
 * Renders a month grid with lunar day per cell and header summary.
 * No network; uses astronomical approximations (amlich-style).
 */
(function(){
  const TZ = 7; // Vietnam time zone
  const PI = Math.PI;

  function INT(d){ return Math.floor(d); }
  function jdFromDate(dd, mm, yy){
    let a = INT((14 - mm)/12);
    let y = yy + 4800 - a;
    let m = mm + 12*a - 3;
    let jd = dd + INT((153*m + 2)/5) + 365*y + INT(y/4) - INT(y/100) + INT(y/400) - 32045;
    if (jd < 2299161) jd = dd + INT((153*m + 2)/5) + 365*y + INT(y/4) - 32083;
    return jd;
  }
  function jdToDate(jd){
    let a, b, c, d, e, m;
    if (jd > 2299160){ a = jd + 32044; b = INT((4*a + 3)/146097); c = a - INT(b*146097/4); }
    else { b = 0; c = jd + 32082; }
    d = INT((4*c + 3)/1461); e = c - INT(1461*d/4); m = INT((5*e + 2)/153);
    let day = e - INT((153*m + 2)/5) + 1; let month = m + 3 - 12*INT(m/10); let year = b*100 + d - 4800 + INT(m/10);
    return [day, month, year];
  }
  function NewMoon(k){
    const T = k/1236.85, T2=T*T, T3=T2*T; const dr = PI/180;
    let Jd1 = 2415020.75933 + 29.53058868*k + 0.0001178*T2 - 0.000000155*T3;
    Jd1 += 0.00033*Math.sin((166.56 + 132.87*T - 0.009173*T2)*dr);
    const M = 359.2242 + 29.10535608*k - 0.0000333*T2 - 0.00000347*T3;
    const Mpr = 306.0253 + 385.81691806*k + 0.0107306*T2 + 0.00001236*T3;
    const F = 21.2964 + 390.67050646*k - 0.0016528*T2 - 0.00000239*T3;
    let C1 = (0.1734 - 0.000393*T)*Math.sin(M*dr) + 0.0021*Math.sin(2*M*dr) - 0.4068*Math.sin(Mpr*dr)
           + 0.0161*Math.sin(2*Mpr*dr) - 0.0004*Math.sin(3*Mpr*dr) + 0.0104*Math.sin(2*F*dr)
           - 0.0051*Math.sin((M + Mpr)*dr) - 0.0074*Math.sin((M - Mpr)*dr)
           + 0.0004*Math.sin((2*F + M)*dr) - 0.0004*Math.sin((2*F - M)*dr)
           - 0.0006*Math.sin((2*F + Mpr)*dr) + 0.0010*Math.sin((2*F - Mpr)*dr)
           + 0.0005*Math.sin((2*Mpr + M)*dr);
    let deltat = (T < -11) ? (0.001 + 0.000839*T + 0.0002261*T2 - 0.00000845*T3 - 0.000000081*T*T3)
                           : (-0.000278 + 0.000265*T + 0.000262*T2);
    return Jd1 + C1 - deltat;
  }
  function getNewMoonDay(k, timeZone){ return INT(NewMoon(k) + 0.5 + timeZone/24); }
  function SunLongitude(jdn){
    const T = (jdn - 2451545.5 - TZ/24)/36525, T2=T*T; const dr = PI/180;
    let M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2;
    let L0= 280.46645 + 36000.76983*T + 0.0003032*T2;
    let DL= (1.914600 - 0.004817*T - 0.000014*T2)*Math.sin(dr*M)
          + (0.019993 - 0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
    let L = (L0 + DL)*dr; L -= 2*Math.PI*INT(L/(2*Math.PI));
    return L;
  }
  function getSunLongitude(jdn){ return INT(SunLongitude(jdn)/PI*6); }
  function getLunarMonth11(yy){
    const off = jdFromDate(31,12,yy) - 2415021;
    const k = INT(off/29.530588853);
    let nm = getNewMoonDay(k, TZ);
    if (getSunLongitude(nm) >= 9) nm = getNewMoonDay(k-1, TZ);
    return nm;
  }
  function getLeapMonthOffset(a11){
    const k = INT(0.5 + (a11 - 2415021.076998695)/29.530588853);
    let last = 0, arc = 0, i = 1;
    arc = getSunLongitude(getNewMoonDay(k+i, TZ));
    do { last = arc; i++; arc = getSunLongitude(getNewMoonDay(k+i, TZ)); } while (arc !== last && i < 15);
    return i-1;
  }
  function convertSolar2Lunar(dd, mm, yy){
    const dayNumber = jdFromDate(dd, mm, yy);
    const k = INT((dayNumber - 2415021.076998695)/29.530588853);
    let monthStart = getNewMoonDay(k+1, TZ);
    if (monthStart > dayNumber) monthStart = getNewMoonDay(k, TZ);
    let a11 = getLunarMonth11(yy), b11 = getLunarMonth11(yy+1), lunarYear;
    if (a11 >= monthStart) { lunarYear = yy; a11 = getLunarMonth11(yy-1); }
    else { lunarYear = yy+1; }
    const lunarDay = dayNumber - monthStart + 1;
    let diff = INT((monthStart - a11)/29);
    let lunarMonth = diff + 11, lunarLeap = 0;
    if (b11 - a11 > 365){ const leapMonthDiff = getLeapMonthOffset(a11); if (diff >= leapMonthDiff){ lunarMonth = diff + 10; if (diff === leapMonthDiff) lunarLeap = 1; } }
    if (lunarMonth > 12) lunarMonth -= 12; if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return [lunarDay, lunarMonth, lunarYear, lunarLeap];
  }

  // UI helpers
  const WEEK = ['CN','T2','T3','T4','T5','T6','T7'];
  const LUNAR_MONTH_NAMES = ['','Tháng Giêng','Tháng Hai','Tháng Ba','Tháng Tư','Tháng Năm','Tháng Sáu','Tháng Bảy','Tháng Tám','Tháng Chín','Tháng Mười','Tháng Mười Một','Tháng Chạp'];

  function renderCalendar(container, y, m){
    const grid = container.querySelector('#lc-grid');
    const title = container.querySelector('#lc-title');
    const solarBig = container.querySelector('#lc-solar-big');
    const weekdayEl = container.querySelector('#lc-weekday');
    const lunarBig = container.querySelector('#lc-lunar-big');
    const lunarMonthPill = container.querySelector('#lc-lunar-month');

    const today = new Date();
    const viewDate = new Date(y, m-1, 1);
    title.textContent = `Tháng ${m}/${y}`;

    // Header (today highlights, regardless of viewed month)
    const tdd = today.getDate(), tmm = today.getMonth()+1, tyy = today.getFullYear();
    solarBig.textContent = tdd;
    weekdayEl.textContent = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'][today.getDay()];
    const [ld, lm] = convertSolar2Lunar(tdd, tmm, tyy);
    lunarBig.textContent = ld;
    lunarMonthPill.textContent = LUNAR_MONTH_NAMES[lm];

    // Build grid
    let html = '';
    WEEK.forEach(w => { html += `<div class="lunar-dow">${w}</div>`; });
    const firstDow = new Date(y, m-1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    // previous month padding
    const prevDays = new Date(y, m-1, 0).getDate();
    for (let i=0; i<firstDow; i++){
      const d = prevDays - firstDow + 1 + i;
      const [ld2] = convertSolar2Lunar(d, m-1<=0?12:m-1, m-1<=0?y-1:y);
      html += `<div class="lunar-cell off-month"><div class="solar-day">${d}</div><div class="lunar-mini">${ld2===1?`1/${convertSolar2Lunar(d, m-1<=0?12:m-1, m-1<=0?y-1:y)[1]}`:ld2}</div></div>`;
    }
    for (let d=1; d<=daysInMonth; d++){
      const date = new Date(y, m-1, d); const dow = date.getDay();
      const [ld2, lm2] = convertSolar2Lunar(d, m, y);
      const isToday = (date.toDateString() === today.toDateString());
      const classes = ['lunar-cell']; if (dow===0) classes.push('sun'); if (isToday) classes.push('today');
      const mini = ld2===1 ? `<span class="lunar-mini lunar-mini-emph">1/${lm2}</span>` : `<span class="lunar-mini">${ld2}</span>`;
      html += `<div class="${classes.join(' ')}"><div class="solar-day">${d}</div>${mini}</div>`;
    }
    // trailing next-month cells to fill 6 rows
    const cellsSoFar = 7 + firstDow + daysInMonth; // 7 for DOW row
    const needed = Math.ceil(cellsSoFar/7)*7 - cellsSoFar;
    for (let d=1; d<=needed; d++){
      const [ld2] = convertSolar2Lunar(d, m+1>12?1:m+1, m+1>12?y+1:y);
      html += `<div class="lunar-cell off-month"><div class="solar-day">${d}</div><div class="lunar-mini">${ld2===1?`1/${convertSolar2Lunar(d, m+1>12?1:m+1, m+1>12?y+1:y)[1]}`:ld2}</div></div>`;
    }
    grid.innerHTML = html;
  }

  function setup(){
    const box = document.getElementById('lunar-widget'); if (!box) return;
    let now = new Date(); let y = now.getFullYear(), m = now.getMonth()+1;
    const prevBtn = box.querySelector('.lc-prev'); const nextBtn = box.querySelector('.lc-next');
    const render = ()=> renderCalendar(box, y, m);
    prevBtn.addEventListener('click', function(e){ e.preventDefault(); m--; if (m<1){ m=12; y--; } render(); });
    nextBtn.addEventListener('click', function(e){ e.preventDefault(); m++; if (m>12){ m=1; y++; } render(); });
    render();
    // midnight update for header today section
    setInterval(()=>{
      const t = new Date();
      if (t.getDate() !== now.getDate()) { now = t; render(); }
    }, 60*1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
