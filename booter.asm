.device atmega328p

.def Xl = r26
.def Xh = r27
.def Yl = r28
.def Yh = r29
.def Zl = r30
.def Zh = r31

.def avgL = r2
.def avgH = r3
.def curmax = r5
.def dbgreg = r6
.equ LEVEL0_ADDR = 8
.def level0 = r8
.def level1 = r9
.def level2 = r10
.def level3 = r11
.equ LEVELS = 4
.def temp = r20
.def avg = r21
.def prgszl = r22
.def prgszh = r23
.def prgcntl = r24
.def prgcnth = r25

.equ DDRB = 0x04
.equ PORTB = 0x05
.equ DDRC = 0x07
.equ PORTC = 0x08
.equ ADMUX_ADDR = 0x7C
.equ ADCSRA_ADDR = 0x7A
.equ ADCL_ADDR = 0x78
.equ ADCH_ADDR = 0x79
.equ SREG = 0x3F

.org 0x3800

;===================
start:

rcall init_hw

ldi temp, 250
first_wait:
rcall next_measure
dec temp
brne first_wait

ldi temp, 17
add temp, avg

wait_rise:
rcall next_measure
cp temp, avg
brsh wait_rise

mov curmax, avg
sbi PORTB, 0
ldi Xl, LEVEL0_ADDR+LEVELS
ldi Xh, 0

wait_calibration:
rcall peak_detect
cpi r16, 0
breq wait_calibration
st -X, r16
cpi Xl, LEVEL0_ADDR
brne wait_calibration

add level0, level1
lsr level0
add level1, level2
lsr level1
add level2, level3
lsr level2
clr level3
com level3

clr prgszh
rcall read_byte
mov prgszl, temp
cpi temp, 0x80
brlo prg_fill
andi prgszl, 0x7F
rcall read_byte
mov prgszh, temp

prg_fill:
ldi Zl, 0
ldi Zh, 1
clr r0
clr r1
clr prgcntl
clr prgcnth
prg_fill_next:
cp prgcntl, prgszl
cpc prgcnth, prgszh
brsh prg_fill_done
adiw prgcntl, 1
rcall read_byte
st Z+, temp
bst r0, 7
lsl r0
bld r0, 0
eor r0, temp
eor r1, r0
mov temp, prgcntl
andi temp, 7
brne prg_fill_next
rcall read_byte
cp r1, temp
breq prg_fill_next
rjmp err_rept
prg_fill_done:

rcall read_byte
cp r0, temp
breq checksum_1_ok
ldi temp, 1
rjmp err_rept
checksum_1_ok:
rcall read_byte
cp r1, temp
breq checksum_2_ok
ldi temp, 2
rjmp err_rept
checksum_2_ok:
ldi temp, 0xC3
rjmp err_rept

err_rept:
mov dbgreg, temp
rcall debug
rjmp err_rept

;===================
; returns in temp
read_byte:
push r16
push r17
push r19
ldi r19, 4
next_peak:
rcall peak_detect
cpi r16, 0
breq next_peak
lsl temp
lsl temp
ldi Xl, LEVEL0_ADDR
np_test:
ld r17, X+
cp r17, r16
brlo np_test
subi Xl, LEVEL0_ADDR+1
add temp, Xl
dec r19
brne next_peak
pop r19
pop r17
pop r16
ret

;===================
init_hw:
clr Yh
ldi Yl, ADMUX_ADDR
ldi r16, 0b1000000 ; avcc as ref, adc0, right-adjusted
st Y, r16
ldi Yl, ADCSRA_ADDR
ldi r16, 0b11100011 ; enable, start, autorun, 32 divisor (free-running in ADCSRB by default)
st Y, r16
sbi PORTC, 0
ret

;===================
; avgH:avgL = (avg*3 + adc) >> 2
next_measure:
push r16
push r17
push r18
ldi r18, 12
rcall udelay
mov r16, avgL
mov r17, avgH
add avgL, avgL
adc avgH, avgH
add avgL, r16
adc avgH, r17
ldi Yl, ADCL_ADDR
ld r16, Y
ldi Yl, ADCH_ADDR
ld r17, Y
add avgL, r16
adc avgH, r17
lsr avgH
ror avgL
lsr avgH
ror avgL
mov avg, avgL
mov r16, avgH
lsr r16
ror avg
lsr r16
ror avg
pop r18
pop r17
pop r16
ret

;===================
; returns in r16 (0 - no peak)
peak_detect:
rcall next_measure
sbis PORTB, 0
rjmp pd_falling
cp curmax, avg
brlo pd_update
subi avg, -3
cp avg, curmax
brsh pd_ret0
cbi PORTB, 0
mov r16, curmax
ret
pd_falling:
cp avg, curmax
brlo pd_update
subi avg, 3
cp avg, curmax
brlo pd_ret0
sbi PORTB, 0
rjmp pd_ret0
pd_update:
mov curmax, avg
pd_ret0:
ldi r16, 0
ret

;===================
; dbgreg to blink via pb0
debug:
sbi DDRB, 0
push temp
push r19
ldi temp, 8
debug_next:
ldi r19, 50
lsl dbgreg
brcs debug_1
ldi r19, 20
debug_1:
sbi PORTB, 0
rcall mdelay
cbi PORTB, 0
ldi r19, 40
rcall mdelay
dec temp
brne debug_next
ldi r19, 70
rcall mdelay
pop r19
pop temp
ret

;===================
; r19 as param (1 = 10 millis)
mdelay:
push r18
mdelay_rep:
ldi r18, 100
rcall udelay
subi r19, 1
brne mdelay_rep
pop r18
ret

;===================
; r18 as param (1 = 100 micros)
udelay:
push r17
udelay_rep0:
ldi r17, 20
udelay_rep1:
nop
dec r17
brne udelay_rep1
dec r18
brne udelay_rep0
pop r17
ret

