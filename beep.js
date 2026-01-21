function doBeep(text, volume) {
    let data = [];
    let cur = -1;
    let npts = 16;
    let pts = [];
    let ptse = [];
    let nptse = 24;
    for (let i = 0; i < npts; i++)
        pts.push(Math.sin(i * Math.PI * 2 / npts));
    for (let i = 0; i < nptse; i++) {
        let x = (i*2 - nptse) / nptse;
        x = (x*(1+Math.PI*0.25)-Math.sin(x*Math.PI)*0.25)/(1+Math.PI*0.25);
        ptse.push(Math.sin(-x*Math.PI));
    }

    function bit(v) {
        if (v) {
            for (let i = 0; i < pts.length; i++)
                data.push(pts[i]*volume);
        } else {
            for (let i = 0; i < ptse.length; i++)
                data.push(ptse[i]*volume);
        }
    }

    for (let i = 0; i < 1000; i++) bit(1);
    for (let i = 0; i < text.length; i++) {
        bit(0);
        var b = text.codePointAt(i);
        for (let i = 0; i < 8; i++)
          bit((b>>(7-i)) & 1);
        bit(1);
        bit(1);
    }
    for (let i = 0; i < 100; i++) bit(1);

    let ctx = new AudioContext();
    let buf = ctx.createBuffer(1, data.length, 16000);
    let sndArray = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        sndArray[i] = data[i];
    }
    let src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
}
