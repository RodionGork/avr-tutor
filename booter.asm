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

.equ m328 = 0

.if m328

.device atmega328p

.equ DDRC = 0x07
.equ PORTC = 0x08
.equ ADMUX_ADDR = 0x7C
.equ ADCSRA_ADDR = 0x7A
.equ ADCL_ADDR = 0x78
.equ ADCH_ADDR = 0x79
.equ SPMCSR = 0x37
.equ SREG = 0x3F

.equ PAGE_SIZE_WORDS = 64

.org 0x3800

.else

.device atmega8

.equ DDRC = 0x14
.equ PORTC = 0x15
.equ ADMUX_ADDR = 0x27
.equ ADCSRA_ADDR = 0x26
.equ ADCL_ADDR = 0x24
.equ ADCH_ADDR = 0x25
.equ SPMCSR = 0x37
.equ SPL = 0x3D
.equ SPH = 0x3E
.equ SPL_init = 0x60
.equ SPH_init = 0x04
.equ SREG = 0x3F

.equ PAGE_SIZE_WORDS = 32

.org 0xC00

.endif

;===================
start:

.ifdef SPL_init
ldi r16, SPL_init
out SPL, r16
ldi r16, SPH_init
out SPH, r16
.endif

rcall init_hw

ldi temp, 250
first_wait:
rcall next_measure
dec temp
brne first_wait

cpi avg, 0xC0
brlo bootloader_proceed
rjmp normal_boot

bootloader_proceed:

ldi temp, 17
add temp, avg

wait_rise:
rcall next_measure
cp temp, avg
brsh wait_rise

mov curmax, avg
sbi PORTC, 1
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

ldi Zl, 0
ldi Zh, 0
ldi Yl, 0
ldi Yh, 1
ldi temp, 0

burn_loop:
ld r0, Y+
ld r1, Y+
ldi r16, 1
out SPMCSR, r16
spm
adiw Zl, 2
cp Zl, prgszl
cpc Zh, prgszh
brsh burn_end
inc temp
cpi temp, PAGE_SIZE_WORDS
brlo burn_loop
rcall burn_page
rjmp burn_loop

burn_end:
cpi temp, 0
breq no_tail_page
rcall burn_page
no_tail_page:

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
burn_page:
push Zl
push Zh
sbiw Zl, 2
andi Zl, PAGE_SIZE_WORDS*2
ldi r16, 0b11
out SPMCSR, r16
spm
burn_page_wait_erase:
in r16, SPMCSR
andi r16, 1
brne burn_page_wait_erase
ldi r16, 0b101
out SPMCSR, r16
spm
burn_page_wait_write:
in r16, SPMCSR
andi r16, 1
brne burn_page_wait_write
clr temp
pop Zh
pop Zl
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
normal_boot:
ldi Yl, ADMUX_ADDR
ldi r16, 0
st Y, r16
ldi Yl, ADCSRA_ADDR
ldi r16, 0
st Y, r16
cbi PORTC, 0
clr Zl
clr Zh
ijmp

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
sbis PORTC, 1
rjmp pd_falling
cp curmax, avg
brlo pd_update
subi avg, -3
cp avg, curmax
brsh pd_ret0
cbi PORTC, 1
mov r16, curmax
ret
pd_falling:
cp avg, curmax
brlo pd_update
subi avg, 3
cp avg, curmax
brlo pd_ret0
sbi PORTC, 1
rjmp pd_ret0
pd_update:
mov curmax, avg
pd_ret0:
ldi r16, 0
ret

;===================
; dbgreg to blink via pc1
debug:
sbi DDRC, 1
push temp
push r19
ldi temp, 8
debug_next:
ldi r19, 50
lsl dbgreg
brcs debug_1
ldi r19, 20
debug_1:
sbi PORTC, 1
rcall mdelay
cbi PORTC, 1
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

