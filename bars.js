var ht = 36;
var hg;
var bc = document.getElementById('barcoder');
var speed;

function bar(v) {
  var h = v >= 0 ? ht : hg;
  return `<div style="height:${h}px" class="color${(v+1)}"></div>`;
}

function lead() {
  var h = bc.clientHeight - ht;
  return `<div style="height:${h}px"></div>`;
}

function bartest() {
  var msg = prompt('Some text:');
  if (msg == null)
    return;
  msg += '\n';
  barsend([...msg].map((c) => c.charCodeAt(0)));
}

function barsend(data) {
  document.getElementById('burnit').innerText = 'STOP';
  ht = document.getElementById('widebars').value * 1;
  speed = Math.floor(ht / document.getElementById('slowbars').value);
  hg = document.getElementById('widegaps').value * ht / 2;
  var html = lead();
  for (let i = 0; i < 4; i++)
    html += bar(3-i) + bar(-1);
  for (let c of data)
    for (let b = 6; b >= 0; b -= 2)
      html += bar((c>>b)&3) + bar(-1);
  html += lead();
  bc.innerHTML = html;
  bc.scrollTo(0, 0);
  window.startTime = new Date().getTime();
  setTimeout(barScroll, 1000);
}

function barScroll() {
  var info = document.getElementById('bar-info');
  var prevPos = bc.scrollTop;
  bc.scrollTo(0, bc.scrollTop + speed);
  info.innerText = Math.floor(bc.scrollTop / bc.scrollHeight * 100) + '%';
  if (bc.scrollTop > prevPos && document.getElementById('burnit').innerText == 'STOP')
    requestAnimationFrame(barScroll);
  else {
    info.innerText = Math.floor((new Date().getTime() - window.startTime) / 100) / 10 + 's';
    document.getElementById('burnit').innerText = 'BURN';
  }
}

function barloader() {
  if (document.getElementById('burnit').innerText == 'STOP') {
    document.getElementById('burnit').innerText = '----';
    return;
  }
  var prg = collectCode();
  var res = build(prg);
  var con = document.getElementById('result-console');
  if (!res[1]) {
    con.innerText = res[0];
    alert('Please see compilation errors below!');
    return;
  }
  con.innerText = '';
  barsend(res[0]);
}
