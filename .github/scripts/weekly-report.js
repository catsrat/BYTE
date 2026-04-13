const https = require('https');
const nodemailer = require('nodemailer');

function fetchFirebase(path) {
  return new Promise((resolve, reject) => {
    const url = process.env.FIREBASE_DB_URL + '/' + path + '.json?auth=' + process.env.FIREBASE_DB_SECRET;
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

(async () => {
  const DAY  = 24 * 60 * 60 * 1000;
  const now  = Date.now();
  const thisWeekStart = now - 7 * DAY;
  const lastWeekStart = now - 14 * DAY;

  const allOrders = await fetchFirebase('orders');
  if (!allOrders) { console.log('No orders found'); return; }

  const all = Object.values(allOrders);
  const thisWeek = all.filter(o => o.created_at >= thisWeekStart);
  const lastWeek = all.filter(o => o.created_at >= lastWeekStart && o.created_at < thisWeekStart);

  function stats(orders) {
    const total    = orders.length;
    const revenue  = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avg      = total ? revenue / total : 0;
    const deliveries = orders.filter(o => o.type === 'delivery').length;
    const pickups    = orders.filter(o => o.type === 'pickup').length;
    return { total, revenue, avg, deliveries, pickups };
  }

  const tw = stats(thisWeek);
  const lw = stats(lastWeek);

  function arrow(curr, prev) {
    if (prev === 0) return '';
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (pct > 0) return '<span style="color:#22c55e;font-size:12px"> +' + pct + '% vs last week</span>';
    if (pct < 0) return '<span style="color:#ef4444;font-size:12px"> ' + pct + '% vs last week</span>';
    return '<span style="color:#888;font-size:12px"> same as last week</span>';
  }

  // Top items
  const skip = ['total','vat','delivery','net food','net drink','subtotal','items total','fee','breakdown','final'];
  const itemCount = {};
  thisWeek.forEach(o => {
    (o.items || '').split('\n').forEach(line => {
      const l = line.trim();
      if (!l || skip.some(k => l.toLowerCase().includes(k))) return;
      const m = l.match(/^-\s+(.+?)\s*\(.*[\d.]+\)/);
      const name = m ? m[1].trim() : '';
      if (name.length > 2) itemCount[name] = (itemCount[name] || 0) + 1;
    });
  });
  const topItems = Object.entries(itemCount).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxCount = topItems.length ? topItems[0][1] : 1;

  // Busiest hour
  const hourBuckets = Array(24).fill(0);
  thisWeek.forEach(o => hourBuckets[new Date(o.created_at).getHours()]++);
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const peakStr  = tw.total ? peakHour + ':00 - ' + (peakHour+1) + ':00 (' + hourBuckets[peakHour] + ' orders)' : 'N/A';

  // By day
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayRev = Array(7).fill(0), dayOrd = Array(7).fill(0);
  thisWeek.forEach(o => {
    const d = new Date(o.created_at).getDay();
    dayRev[d] += (o.total || 0);
    dayOrd[d]++;
  });
  const maxDayRev = Math.max(...dayRev, 1);

  const ws = new Date(thisWeekStart).toLocaleDateString('de-DE');
  const we = new Date(now).toLocaleDateString('de-DE');

  // ── HTML Email ───────────────────────────────────────────────────────────
  const topItemsRows = topItems.length ? topItems.map(([name, count], i) => {
    const bar = Math.round((count / maxCount) * 100);
    const medals = ['#FFD700','#C0C0C0','#CD7F32','#aaa','#aaa'];
    return '<tr><td style="padding:8px 0;width:20px;font-size:18px">' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)+'.') + '</td>' +
      '<td style="padding:8px 12px;color:#fff;font-size:14px">' + name + '</td>' +
      '<td style="padding:8px 0;width:120px"><div style="background:#1a1410;border-radius:4px;height:10px"><div style="background:#ff7f00;width:' + bar + '%;height:10px;border-radius:4px"></div></div></td>' +
      '<td style="padding:8px 0 8px 10px;color:#ff7f00;font-weight:700;font-size:14px;white-space:nowrap">' + count + 'x</td></tr>';
  }).join('') : '<tr><td colspan="4" style="padding:12px;color:#666;text-align:center">No order data yet</td></tr>';

  const dayRows = dayNames.map((d, i) => {
    const bar = Math.round((dayRev[i] / maxDayRev) * 100);
    const isToday = new Date().getDay() === i;
    return '<tr style="' + (isToday ? 'background:rgba(255,127,0,0.08)' : '') + '">' +
      '<td style="padding:8px 12px;color:' + (isToday ? '#ff7f00' : '#aaa') + ';font-weight:' + (isToday ? '700' : '400') + ';font-size:13px;width:40px">' + d + '</td>' +
      '<td style="padding:8px 12px;color:#fff;font-size:13px;width:60px">' + dayOrd[i] + ' orders</td>' +
      '<td style="padding:8px 12px;width:120px"><div style="background:#1a1410;border-radius:4px;height:8px"><div style="background:#ff7f00;width:' + bar + '%;height:8px;border-radius:4px"></div></div></td>' +
      '<td style="padding:8px 12px;color:#ff7f00;font-weight:700;font-size:13px;text-align:right">EUR ' + dayRev[i].toFixed(2) + '</td></tr>';
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0b09;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0b09;padding:30px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1a1108,#2a1a08);border-radius:16px 16px 0 0;padding:32px 36px;border-bottom:2px solid #ff7f00">
    <table width="100%"><tr>
      <td><div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:2px">BYTE<span style="color:#ff7f00">.</span></div>
          <div style="font-size:12px;color:#888;letter-spacing:1px;margin-top:2px">BURGERS SOLINGEN</div></td>
      <td align="right"><div style="background:rgba(255,127,0,0.15);border:1px solid rgba(255,127,0,0.4);border-radius:8px;padding:8px 16px;display:inline-block">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px">Weekly Report</div>
        <div style="font-size:13px;color:#ff7f00;font-weight:700;margin-top:2px">${ws} &mdash; ${we}</div>
      </div></td>
    </tr></table>
  </td></tr>

  <!-- KPI Cards -->
  <tr><td style="background:#111009;padding:24px 36px">
    <table width="100%" cellspacing="0" cellpadding="0"><tr>
      <td width="33%" style="padding-right:8px">
        <div style="background:#1a1410;border:1px solid rgba(255,127,0,0.2);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Total Revenue</div>
          <div style="font-size:24px;font-weight:900;color:#ff7f00">EUR ${tw.revenue.toFixed(2)}</div>
          <div style="margin-top:4px">${arrow(tw.revenue, lw.revenue)}</div>
        </div>
      </td>
      <td width="33%" style="padding:0 4px">
        <div style="background:#1a1410;border:1px solid rgba(255,127,0,0.2);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Total Orders</div>
          <div style="font-size:24px;font-weight:900;color:#fff">${tw.total}</div>
          <div style="margin-top:4px">${arrow(tw.total, lw.total)}</div>
        </div>
      </td>
      <td width="33%" style="padding-left:8px">
        <div style="background:#1a1410;border:1px solid rgba(255,127,0,0.2);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Avg Order</div>
          <div style="font-size:24px;font-weight:900;color:#fff">EUR ${tw.avg.toFixed(2)}</div>
          <div style="margin-top:4px">${arrow(tw.avg, lw.avg)}</div>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Order Type -->
  <tr><td style="background:#111009;padding:0 36px 24px">
    <table width="100%" cellspacing="0" cellpadding="0"><tr>
      <td width="50%" style="padding-right:6px">
        <div style="background:#1a1410;border:1px solid rgba(255,127,0,0.15);border-radius:12px;padding:14px 18px;display:flex;align-items:center">
          <span style="font-size:20px;margin-right:10px">🚴</span>
          <div><div style="font-size:11px;color:#888">Deliveries</div><div style="font-size:20px;font-weight:700;color:#fff">${tw.deliveries}</div></div>
        </div>
      </td>
      <td width="50%" style="padding-left:6px">
        <div style="background:#1a1410;border:1px solid rgba(255,127,0,0.15);border-radius:12px;padding:14px 18px">
          <span style="font-size:20px;margin-right:10px">🏠</span>
          <div style="display:inline-block"><div style="font-size:11px;color:#888">Pickups</div><div style="font-size:20px;font-weight:700;color:#fff">${tw.pickups}</div></div>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Top Items -->
  <tr><td style="background:#111009;padding:0 36px 24px">
    <div style="background:#1a1410;border:1px solid rgba(255,127,0,0.15);border-radius:12px;padding:20px 24px">
      <div style="font-size:13px;font-weight:700;color:#ff7f00;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Top Selling Items</div>
      <table width="100%" cellpadding="0" cellspacing="0">${topItemsRows}</table>
    </div>
  </td></tr>

  <!-- By Day -->
  <tr><td style="background:#111009;padding:0 36px 24px">
    <div style="background:#1a1410;border:1px solid rgba(255,127,0,0.15);border-radius:12px;padding:20px 24px">
      <div style="font-size:13px;font-weight:700;color:#ff7f00;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Revenue by Day</div>
      <table width="100%" cellpadding="0" cellspacing="0">${dayRows}</table>
    </div>
  </td></tr>

  <!-- Busiest Hour -->
  <tr><td style="background:#111009;padding:0 36px 24px">
    <div style="background:rgba(255,127,0,0.08);border:1px solid rgba(255,127,0,0.3);border-radius:12px;padding:16px 24px;text-align:center">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px">Busiest Hour This Week</div>
      <div style="font-size:22px;font-weight:900;color:#ff7f00;margin-top:6px">${peakStr}</div>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0d0b09;border-top:1px solid #1a1410;border-radius:0 0 16px 16px;padding:24px 36px;text-align:center">
    <a href="https://byteburgers.shop/admin.html" style="display:inline-block;background:#ff7f00;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:50px;text-decoration:none;letter-spacing:0.5px">View Full Analytics</a>
    <div style="margin-top:16px;font-size:11px;color:#444">BYTE Burgers Solingen &bull; byteburgers.shop</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const t = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  await t.sendMail({
    from: '"BYTE Burgers" <' + process.env.GMAIL_USER + '>',
    to: process.env.REPORT_EMAIL,
    subject: 'Weekly Report: EUR ' + tw.revenue.toFixed(2) + ' revenue, ' + tw.total + ' orders (' + ws + ' - ' + we + ')',
    html: html
  });

  console.log('Weekly report sent successfully.');
})();
