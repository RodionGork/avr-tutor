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
    }
    var s = '';
    FS.readFile('/test.hex').forEach((v)=>{s+=String.fromCharCode(v)});
    return convertHexOutput(s);
}

function convertHexOutput(data) {
    var bytes = [];
    outer:
    for (var str of data.split('\n').map(s => s.trim())) {
        if (str == '')
            continue;
        if (str[0] != ':')
            return ['line format error', false];
        var b = [];
        for (var i = 1; i < str.length - 2; i+=2)
            b.push(parseInt(str.substr(i, 2), 16));
        switch (b[3]) {
            case 2:
                break;
            case 0:
                bytes.push(...(b.slice(4)));
                break;
            case 1:
                break outer;
        }
    }
    var res = [];
    res.push(bytes.length | (bytes.length > 127 ? 0x80 : 0));
    if (bytes.length > 127) {
        res[0] = (res[0] & 0x7F) | 0x80;
        res.push(bytes.length >> 7);
    }
    console.log(checksum(bytes).join(':'));
    var ab = [0, 0];
    for (var i = 0; i < bytes.length; i++) {
        res.push(bytes[i]);
        ab = checksum(bytes.slice(i, i+1), ...ab);
        if (i % 8 == 7)
            res.push(ab[1]);
    }
    res.push(...ab);
    console.log(`checksum: ${ab[0]}:${ab[1]}`);
    return [res, true];
}

function checksum(msg, a, b) {
  if (typeof(msg) == 'string')
    msg = [...msg].map((c) => c.charCodeAt(0));
  if (a === undefined) a = 0;
  if (b === undefined) b = 0
  for (var c of msg) {
    a = ((a << 1) & 0xFF) | (a >> 7);
    a ^= c;
    b ^= a;
  }
  return [a, b];
}

