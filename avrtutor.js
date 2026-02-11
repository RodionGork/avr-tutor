var tableProg = document.getElementById('prg');
var tableRegs = document.getElementById('regs');
var equs = [];
var stack = [];
var curLine = null;

function btnStep(reset) {
  var rows = tableProg.firstElementChild.children;
  var firstCmd = null;
  curLine = null;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i].getAttribute("cmd") !== null) {
      if (firstCmd === null)
        firstCmd = i;
    }
    if (rows[i].getAttribute("cur") !== null) {
      rows[i].removeAttribute("cur");
      curLine = i;
      break;
    }
  }
  if (curLine === null || reset) {
    resetState();
    if (reset === undefined) {
      if (firstCmd !== null)
        rows[firstCmd].setAttribute("cur", "true");
      else {
        alert('в этой программе нет ни одной исполняемой команды');
        return false;
      }
    }
    return true;
  }
  try {
    var jumpLine = execLine(rows[curLine]);
    var nextLine = null;
    for (var i = (jumpLine ?? curLine) + 1; i < rows.length; i++) {
      if (rows[i].getAttribute("cmd") !== null) {
        nextLine = i;
        break;
      }
    }
    if (nextLine === null) {
      alert('выпали за конец программы');
      return false;
    } else
      rows[nextLine].setAttribute("cur", "true");
  } catch (e) {
    alert('ахтунг: ' + e);
    return false;
  }
  return true;
}

function btnRun() {
  var btn = document.getElementById('btnrun');
  var state = btn.innerText;
  if (state == 'Run') {
    btn.innerText = 'Stop';
    window.runner = function() {
      var delay = parseFloat(document.getElementById('run-delay').value);
      var delay = (!Number.isNaN(delay) && delay > 0 && delay <= 5000) ? delay : 100;
      var sumDelay = 0;
      var succ = true;
      do {
        succ = succ && btnStep();
        sumDelay += delay;
      } while (sumDelay < 1 && succ);
      if (!succ)
        btnRun(); // simulate second click to stop
      if (window.runner !== undefined) {
        if (delay > 10)
          setTimeout(window.runner, delay);
        else
          requestAnimationFrame(runner);          
      }
    }
    window.runner();
  } else {
    btn.innerText = 'Run';
    window.runner = undefined;
  }
}

function btnReset() {
  btnStep(true);
}

function resetState() {
  for (var i = 0; i < 32; i++)
    setReg('r' + i, '?');
  setFlag('c', '?');
  setFlag('z', '?');
  for (var x of ['b', 'c', 'd']) {
    setAll8(setPinDir, x, 0);
    setAll8(setPinPort, x, 0);
  }
  equs = [];
  stack = [];
}

var devPorts = {
  'attiny13a': {
    'pins-b': [0x17, 0x18, 0x16],
    'pins-c': false,
    'pins-d': false
  },
  'atmega8': {
    'pins-b': [0x17, 0x18, 0x16],
    'pins-c': [0x14, 0x15, 0x13],
    'pins-d': [0x11, 0x12, 0x10]
  },
  'atmega328p': {
    'pins-b': [0x4, 0x5, 0x3],
    'pins-c': [0x7, 0x8, 0x6],
    'pins-d': [0xA, 0xB, 0x9]
  },
  'other': {
    'pins-b': false,
    'pins-c': false,
    'pins-d': false
  }
};

function tableOrArea() {
  var area = document.getElementById('prgarea');
  if (event.target.checked) {
    tableProg.classList.add('hidden');
    area.classList.remove('hidden');
    var code = localStorage['prg'];
    area.value = code;
    area.setAttribute('rows', code.split('\n').length+1);
  } else {
    tableProg.classList.remove('hidden');
    area.classList.add('hidden');
    localStorage['prg'] = area.value.trim();
    var rows = tableProg.firstElementChild.children;
    for (var i = rows.length - 2; i > 0; i--)
        rows[i].remove();
    reloadProgram();
  }
}

var cmdParams = {
  'add': ['r', 'r'],
  'adc': ['r', 'r'],
  'mov': ['r', 'r'],
  'ldi': ['r', 'i'],
  'cp': ['r', 'r'],
  'cpi': ['r', 'i'],
  'sub': ['r', 'r'],
  'subi': ['r', 'i'],
  'sbci': ['r', 'i'],
  'lsl': ['r'],
  'lsr': ['r'],
  'asr': ['r'],
  'rol': ['r'],
  'ror': ['r'],
  'in': ['r', 'p'],
  'out': ['p', 'r'],
  'rjmp': ['l'],
  'rcall': ['l'],
  'breq': ['l'],
  'brne': ['l'],
  'brsh': ['l'],
  'brlo': ['l'],
  'ret': [],
};

var executors = {
  'ldi': () => setReg(cmd[1], parseIntVal(cmd[2])),
  'mov': () => setReg(cmd[1], getReg(cmd[2])),
  'add': () => addReg(cmd[1], getReg(cmd[2])),
  'adc': () => addReg(cmd[1], getReg(cmd[2]) + getFlag('c')),
  'sub': () => subReg(cmd[1], getReg(cmd[2])),
  'subi': () => subReg(cmd[1], parseIntVal(cmd[2])),
  'sbci': () => subReg(cmd[1], parseIntVal(cmd[2]) + getFlag('c')),
  'cp': () => subReg(cmd[1], getReg(cmd[2]), false),
  'cpi': () => subReg(cmd[1], parseIntVal(cmd[2]), false),
  'lsl': () => addReg(cmd[1], getReg(cmd[1])),
  'lsr': () => shiftReg(cmd[1], 0),
  'rol': () => addReg(cmd[1], getReg(cmd[1]) + getFlag('c')),
  'ror': () => shiftReg(cmd[1], getFlag('c')),
  'asr': () => shiftReg(cmd[1], getReg(cmd[1]) >> 7),
  'out': () => portWrite(parseIntVal(cmd[1]), getReg(cmd[2])),
  'in': () => setReg(cmd[1], portRead(parseIntVal(cmd[2]))),
  'rjmp': () => jumpTo(cmd[1]),
  'brlo': () => jumpTo(cmd[1], getFlag('c')),
  'brsh': () => jumpTo(cmd[1], !getFlag('c')),
  'breq': () => jumpTo(cmd[1], getFlag('z')),
  'brne': () => jumpTo(cmd[1], !getFlag('z')),
  'rcall': () => { stack.push(curLine+1); return jumpTo(cmd[1]); },
  'ret': () => { return stack.pop() - 1; }
};

var ioPortFuncs = [];

function execLine(tr) {
  var opcode = tr.getAttribute("cmd");
  cmd = cmdSplit(tr.children[1].innerText, cmdParams[opcode].length);
  return executors[opcode]();
}

function setReg(which, value) {
  which = parseInt(which.substr(1));
  tableRegs.firstElementChild.children[Math.floor(which / 4)].children[which % 4 + 1].innerText = value;
  return null;
}

function getReg(which) {
  which = parseInt(which.substr(1));
  var value = tableRegs.firstElementChild.children[Math.floor(which / 4)].children[which % 4 + 1].innerText;
  if (value == '?')
    throw 'читаем неинициализированный регистр R' + which;
  return parseIntVal(value);
}

function setFlag(f, value) {
  if (value != '?')
    value = value ? 1 : 0;
  document.getElementById('flag-' + f).innerText = value;
}

function getFlag(f) {
  var value = document.getElementById('flag-' + f).innerText;
  if (value == '?')
    throw 'читаем неинициализированный флаг ' + f;
  return parseInt(value);
}

function portWrite(which, value) {
  var f = ioPortFuncs[which];
  if (f !== undefined)
    f(value);
}

function portRead(which) {
  var f = ioPortFuncs[which];
  if (f !== undefined)
    return f();
  return 0;
}

function addReg(which, value) {
  var res = getReg(which) + value;
  setFlag('c', res > 255);
  res %= 256;
  setFlag('z', res == 0);
  setReg(which, res);
  return null
}

function subReg(which, value, write) {
  var res = getReg(which) - value;
  setFlag('c', res < 0);
  res = (res + 256) % 256;
  setFlag('z', res == 0);
  if (write !== false)
    setReg(which, res);
  return null;
}

function shiftReg(which, msb) {
  var res = getReg(which);
  setFlag('c', res & 1);
  res = ((res >> 1) | (msb << 7));
  setReg(which, (res >> 1) | (msb << 7));
  setFlag('z', res == 0 ? 1 : 0);
  return null;
}

function jumpTo(label, cond) {
  var line = findLabel(label);
  if (line < 0)
    throw 'переход по несуществующей метке ' + label;
  return (cond === undefined || cond) ? line : null;
}

function pinTableRows(port) {
  return document.getElementById('pins-' + port).firstElementChild.children;
}

function setAll8(func, port, value) {
  for (var i = 0; i < 8; i++) {
    func(port, i, value & 1);
    value >>= 1;
  }
}

function getAll8(func, port) {
    var res = 0;
    for (var i = 0; i < 8; i++) {
      res |= func(port, i) << i;
    }
    return res;
}

function setPinDir(port, num, state) {
  pinTableRows(port)[2].children[8-num].innerText = state;
  updPinVal(port, num, state, getPinPort(port, num));
}

function getPinDir(port, num) {
  return pinTableRows(port)[2].children[8-num].innerText;
}

function setPinPort(port, num, state) {
  pinTableRows(port)[3].children[8-num].innerText = state;
  updPinVal(port, num, getPinDir(port, num), state);
}

function getPinPort(port, num) {
  return pinTableRows(port)[3].children[8-num].innerText;
}

function getPinVal(port, num) {
  var v = pinTableRows(port)[4].children[8-num].innerText
  if (v === '?')
    throw 'читаем состояние "висящей в воздухе" ноги PIN' + port.toUpperCase() + '.' + num;
  return parseInt(v);
}

function updPinVal(port, num, dir, p) {
  var v, c;
  if (dir == 1) {
    v = p;
    c = (p == 1) ? '#0f0' : '';
  } else {
    v = p ? '1' : '?';
    c = (p == 1) ? '#262' : '#888';
  }
  pinTableRows(port)[4].children[8-num].innerText = v;
  pinTableRows(port)[1].children[8-num].style.backgroundColor = c;
}

function setupPorts(descr) {
  ioPortFuncs = [];
  var portNames = ['DDR', 'PORT', 'PIN'];
  for (let key in descr) {
    var addrs = descr[key];
    let letter = key.substr(-1).toUpperCase();
    var pinTable = document.getElementById(key);
    var rows = pinTable.firstElementChild.children;
    pinTable.hidden = !addrs;
    if (addrs) {
      for (var i = 0; i < 3; i++) {
        rows[i + 2].children[0].innerText = portNames[i] + letter + ' 0x' + addrs[i].toString(16).toUpperCase();
      }
      ioPortFuncs[addrs[0]] = (v) => setAll8(setPinDir, letter.toLowerCase(), v);
      ioPortFuncs[addrs[1]] = (v) => setAll8(setPinPort, letter.toLowerCase(), v);
      ioPortFuncs[addrs[2]] = () => getAll8(getPinVal, letter.toLowerCase());
    }
  }
}

function addLine(where) {
  if (where === undefined)
    where = prg.lastChild.lastElementChild;
  else
    where = where.previousElementSibling;
  where.insertAdjacentHTML('afterEnd', '<tr><td></td><td>&nbsp;</td><td></td></tr>');
}

function tableClick() {
  var elem = event.target;
  var col = -1, row = -1;
  for (let cur = elem; cur !== null; cur = cur.previousElementSibling)
    col++;
  for (let cur = elem.parentElement; cur !== null; cur = cur.previousElementSibling)
    row++;
  if (row == 0) return;
  if (col == 0) {
    return addLine(elem.parentElement);
    return;
  }
  if (row == 0 || col != 1)
    return;
  var value = prompt('New code line', elem.innerText);
  if (value === null)
    return;
  value = value.trim();
  if (value === '') {
    if (elem.parentElement.nextElementSibling !== null) {
      elem.parentElement.remove();
      recalcAddrs();
      saveToLocalStorage();
    }
    return;
  }
  elem.innerText = value;
  if (elem.parentElement.nextElementSibling === null)
    addLine();
  verifyCodeLine(elem, value);
  saveToLocalStorage();
}

var verifiers = {
  '.device': deviceVerifier,
  '.org': orgVerifier,
  '.equ': equVerifier,
  ':': labelVerifier,
  'add': () => twoRegsVerifier('добавляет значение из регистра ' + cmd[2] + ' к регистру ' + cmd[1]),
  'adc': () => twoRegsVerifier('добавляет значение из регистра ' + cmd[2] + ' и флаг переноса (C) к регистру ' + cmd[1]),
  'mov': () => twoRegsVerifier('копирует значение из регистра ' + cmd[2] + ' в регистр ' + cmd[1]),
  'ldi': () => regAndImmVerifier('загружает число ' + cmd[2] + ' в регистр ' + cmd[1]),
  'cp': () => twoRegsVerifier('сравнивает (вычитанием) значение регистра ' + cmd[2] + ' с регистром ' + cmd[1]),
  'cpi': () => regAndImmVerifier('сравнивает (вычитанием) число ' + cmd[2] + ' с регистром ' + cmd[1]),
  'sub': () => twoRegsVerifier('вычитает значение регистра ' + cmd[2] + ' из регистра ' + cmd[1]),
  'subi': () => regAndImmVerifier('вычитает число ' + cmd[2] + ' из регистра ' + cmd[1]),
  'sbci': () => regAndImmVerifier('вычитает число ' + cmd[2] + ' и флаг переноса (C) из регистра ' + cmd[1]),
  'lsl': () => oneRegVerifier('сдвигает регистр ' + cmd[1] + ' влево'),
  'lsr': () => oneRegVerifier('сдвигает регистр ' + cmd[1] + ' вправо'),
  'rol': () => oneRegVerifier('циклически сдвигает регистр ' + cmd[1] + ' влево (через C)'),
  'lsr': () => oneRegVerifier('циклически сдвигает регистр ' + cmd[1] + ' вправо (через С)'),
  'asr': () => oneRegVerifier('арифметически сдвигает регистр ' + cmd[1] + ' вправо'),
  'in': () => { checkReg(1); checkPort(2); return 'читает значение из порта ' + cmd[2] + ' в регистр ' + cmd[1]; },
  'out': () => { checkPort(1); checkReg(2); return 'пишет значение из регистра ' + cmd[2] + ' в порт ' + cmd[1]; },
  'rjmp': () => jumpVerifier(''),
  'rcall': () => jumpVerifier(' с сохранением адреса возврата'),
  'breq': () => jumpVerifier(' если равно (Z=0)'),
  'brne': () => jumpVerifier(' если не равно (Z=1)'),
  'brsh': () => jumpVerifier(' если равно или больше (C=0)'),
  'brlo': () => jumpVerifier(' если меньше (C=1)'),
  'ret': () => 'возврат из подпрограммы по сохранённому адресу',
};

function verifyCodeLine(elem, line) {
  var firstSpace = line.indexOf(' ');
  var firstWord = line;
  var tail = '';
  if (firstSpace > 0) {
    firstWord = line.substring(0, firstSpace);
    tail = line.substring(firstSpace+1);
  } else if (firstWord.substr(-1) == ':') {
    tail = firstWord.substr(0, firstWord.length-1);
    firstWord = ':';
  }
  firstWord = firstWord.toLowerCase();
  var verifier = verifiers[firstWord];
  var isCmd = firstWord[0] >= 'A';
  if (verifier === undefined) {
    verifier = unknownVerifier;
    isCmd = false;
  }
  var color = '';
  var text = '';
  try {
    if (isCmd)
        cmd = cmdSplit(line, cmdParams[firstWord].length);
    text = verifier(tail);
  } catch (e) {
    text = e;
    color = 'red';
  }
  elem.nextElementSibling.innerText = text;
  elem.nextElementSibling.style.color = color;
  if (firstWord == '.org')
    elem.parentElement.setAttribute("org", line.replace(/.org\s+/, ''));
  else
    elem.parentElement.removeAttribute("org");
  if (isCmd)
    elem.parentElement.setAttribute("cmd", firstWord);
  else
    elem.parentElement.removeAttribute("cmd");
  recalcAddrs();
}

function recalcAddrs() {
  var cur = 0;
  var rows = tableProg.firstElementChild.children;
  for (var i = 1; i < rows.length; i++) {
    var org = rows[i].getAttribute('org');
    if (org !== null)
      cur = parseIntVal(org);
    if (rows[i].getAttribute('cmd') !== null) {
      rows[i].children[0].innerText = cur;
      cur += 2;
    } else
      rows[i].children[0].innerText = '';
  }
}

var unknownFunnyMsgs = [
  'какая-то непонятная шляпа',
  'вот вы сами поняли что написали?',
  'ничего непонятно но очень интересно',
  'мракобесие, жуть, ахтунг какой-то',
  'бред... может лучше пойти водочки выпить',
  'кажется пора почитать конспект',
  'вы это лучше в чят-жепете напишите',
  'йа красивенько сообщенько об ошибочке',
];

function unknownVerifier() {
  throw unknownFunnyMsgs[Math.floor(unknownFunnyMsgs.length * Math.random())];
}

function labelVerifier(param) {
  var found = findLabel(param);
  var next = findLabel(param, found + 1);
  if (next > 0)
    throw 'дублирующаяся метка: ' + param;
  return 'метка "' + param + '"';
}

function deviceVerifier(param) {
  var ports = devPorts[param.toLowerCase()];
  if (ports === undefined) {
    param += '- незнакомая';
    ports = devPorts['other'];
  }
  setupPorts(ports);
  return 'модель контроллера для уточнения допустимых команд: ' + param;
}

function orgVerifier(param) {
  if (param.split(/\s+/).length != 2)
    throw 'нужен один параметр (адрес)';
  var addr = parseIntVal(param);
  if (Number.isNaN(addr) || addr < 0 || addr % 2)
    throw 'адрес должен быть положительным чётным числом';
  return 'далее продолжать с адреса: ' + param;
}

function equVerifier(param) {
  var parts = param.split(/\s*=\s*/);
  if (parts.length != 2 || parts[0] == '' || parts[1] == '')
    return 'нужно определение вида "константа = значение"';
  return 'задаёт константу "' + parts[0] + '" равную ' + parts[1];
}

function twoRegsVerifier(msg) {
  checkReg(1);
  checkReg(2);
  return msg;
}

function regAndImmVerifier(msg) {
  checkReg(1, true);
  checkImm();
  return msg;
}

function oneRegVerifier(msg) {
  checkReg(1);
  return msg;
}

function findLabel(s, startRow) {
  s = s.toLowerCase();
  if (startRow === undefined)
    startRow = 1;
  var rows = tableProg.firstElementChild.children;
  for (var i = startRow; i < rows.length; i++) {
    var c = rows[i].children[1].innerText;
    if (c[c.length-1] == ':' && c.substr(0, c.length-1).toLowerCase() == s)
      return i;
  }
  return -1;
}

function findEqu(s) {
  var rows = tableProg.firstElementChild.children;
  for (var i = 1; i < rows.length; i++) {
    var cells = rows[i].children;
    if (cells[0].innerText == '') {
      var m = cells[1].innerText.match(/^.equ\s+(\S+)\s*=\s*(\S+)/i);
      if (m !== null && m[1] == s)
        return m[2];
    }
  }
  return null;
}

function jumpVerifier(cond) {
  var name = '"' + cmd[1] + '"';
  var lab = findLabel(cmd[1]);
  if (lab < 0)
    throw 'не найти метку ' + name;
  return 'переход на метку ' + name + cond;
}

function cmdSplit(str, parts) {
  var res = [];
  var p1 = str.search(/\s+/);
  if (p1 < 0) {
    if (parts > 0) throw 'этой команде нужны параметры (' + parts + ')';
    res.push(str);
    return res;
  }
  if (parts < 1) throw 'этой команде НЕ нужны параметры';
  res.push(str.substr(0, p1));
  var p2 = str.search(/\,/);
  if (p2 < 0) {
    if (parts > 1) throw'нужна запятая и второй параметр';
    res.push(str.substr(p1).trim());
    return res;
  }
  if (parts < 2) throw 'что-то лишнее, нужен только 1 параметр';
  res.push(str.substring(p1, p2).trim());
  res.push(str.substring(p2+1).trim());
  return res;
}

function checkReg(pos, high) {
  var r = cmd[pos];
  var suff = ' (параметр #' + pos + ')';
  if (r[0].toLowerCase() != 'r')
    throw 'не похоже на регистр' + suff;
  var n = parseInt(r.substr(1));
  if (Number.isNaN(n))
    throw 'не разобрать номер регистра' + suff;
  if (n < 0 || n > 31)
    throw 'регистры бывают с номерами 0..31' + suff;
  if (high && n < 16)
    throw 'этой команде нужен регистр с номером >= 16' + suff;
}

function checkPort(pos) {
  var suff = ' (параметр #' + pos + ')';
  var n = parseIntVal(cmd[pos]);
  if (Number.isNaN(n))
    throw 'должно быть число' + suff;
  if (n < 0 || n > 63)
    throw 'нужно значение от 0 до 63' + suff;
}

function checkImm() {
  var suff = ' (параметр #2)';
  var n = parseIntVal(cmd[2]);
  if (Number.isNaN(n))
    throw 'должно быть число' + suff;
  if (n < -255 || n > 255)
    throw 'нужно значение размером в 1 байт, то есть от 0 до 255' + suff;
}

function parseIntVal(v) {
  var res = v.substr(0, 2).toLowerCase() != '0b' ? parseInt(v) : parseInt(v.substr(2), 2);
  if (Number.isNaN(res)) {
    var c = equs[v];
    if (c === undefined) {
      c = findEqu(v);
      if (c != null) {
        res = parseInt(c);
        equs[v] = res;
      }
    } else
      res = c;
  } else if (res < 0) {
      res += 256;
  }
  return res;
}

function collectCode() {
  var prg = [];
  var rows = tableProg.firstElementChild.children;
  for (var i = 1; i < rows.length; i++) {
    var line = rows[i].children[1].innerText.trim();
    if (line != '')
      prg.push(line);
  }
  return prg.join('\n');
}

function saveToLocalStorage() {
  var prg = collectCode();
  if (prg.length > 0)
    localStorage['prg'] = prg;
}

function reloadProgram() {
  var lines = localStorage['prg'];
  if (lines === undefined)
    return;
  lines = lines.split('\n').map((s) => s.trim()).filter((s) => s != '');
  var row = tableProg.firstElementChild.children[1];
  for (var i = 0; i < lines.length; i++) {
    var value = lines[i];
    var elem = row.children[1];
    if (value.substr(-1) == ':') {
      elem.innerText = value;
      verifyCodeLine(elem, value);
    }
    addLine();
    row = row.nextElementSibling;
  }
  row = tableProg.firstElementChild.children[1];
  for (var i = 0; i < lines.length; i++) {
    var value = lines[i];
    var elem = row.children[1];
    if (value.substr(-1) != ':') {
      elem.innerText = value;
      verifyCodeLine(elem, value);
    }
    row = row.nextElementSibling;
  }
}

function moveit() {
  var elem = event.target;
  var upwards = elem.innerText == '^';
  while (!elem.classList.contains('container'))
    elem = elem.parentElement;
  if (upwards && elem.previousElementSibling.classList.contains('container'))
    elem.parentElement.insertBefore(elem, elem.previousElementSibling);
  if (!upwards && elem.nextElementSibling)
    elem.before(elem.nextElementSibling);
  event.preventDefault();
  return false;
}

function decoratePage() {
  for (var h of document.getElementsByTagName('h3')) {
    h.innerHTML =
      '<sup><a href="#" class="moveit">^</a></sup> ' + 
      h.innerHTML +
      ' <sub><a href="#" class="moveit">v</a></sub>';
  }
  for (var elem of document.getElementsByClassName('moveit')) elem.onclick = moveit;
  setupPorts(devPorts['other']);
}

decoratePage();
btnReset();
reloadProgram();

