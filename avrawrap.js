var output;

Module.noInitialRun = true;

Module.preRun = function() {
    console.log('prerun called');
    var errbuf = '';
    function stdout(code) {
        output += String.fromCharCode(code);
    }
    FS.init(()=>null, stdout, stdout);
}

function build(src) {
    FS.writeFile('/test.asm', src);
    output = '';
    try {
        Module.ccall('shmain', 'number', [], []);
    } catch (e) {
        if (('' + e.message).indexOf('exit(0)') == -1) {
            return [e.message + '\r\n' + output, false];
        }
        console.log('completed normally');
    }
    var s = '';
    FS.readFile('/test.hex').forEach((v)=>{s+=String.fromCharCode(v)});
    return [s, true];
}

function onlineUpload() {
  var prg = collectCode();
  var res = build(prg);
  var con = document.getElementById('result-console');
  var srv = document.getElementById('online-uploader').value;
  if (!res[1]) {
    con.innerText = res[0];
    alert('Please see compilation errors below');
    return;
  }
  if (srv.trim() == '') {
    alert('Please specify server url');
    con.innerText = res[0];
    return;
  }
  fetch(srv+'/store.php', {method:'POST', body: res[0]})
    .then((res) => {
      if (!res.ok)
        throw new 'Result is not OK: ' + res.status;
      return res.text();
    })
    .then((text) => {con.innerText = text;})
    .catch((e) => {con.innerText = 'Error on sending data: ' + e;});
}

