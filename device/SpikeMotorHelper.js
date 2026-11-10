// SpikeMotorHelper.js
// MicroPython "motor helper" that DeviceSpike3.js uploads to a SPIKE Prime / Robot Inventor (Hub OS 3.x) on demand.
//
// How it works: the helper registers a callback on the hub's message tunnel (hub.config["module_tunnel"], found by
// community projects, verified on Hub OS 1.8.149; it is NOT in LEGO's official docs). The browser sends short ASCII
// commands through the tunnel, the helper runs them with the official `motor` module and answers through the same tunnel.
//
// Wire format (one tunnel message = one line of text, comma separated):
//   browser -> hub :  <id>,<cmd>,<args...>
//   hub -> browser :  <id>,ok[,info]  |  <id>,done,<port>,<status>  |  <id>,err,<text>  |  0,rdy,<version>
//
// Commands (port = A..F):
//   ping                         -> ok,<version>
//   pw,<port>,<duty>             raw duty cycle -10000..10000 (motor.set_duty_cycle)
//   sp,<port>,<dps>,<accel>      run at a velocity in deg/s, keeps running (motor.run)
//   st,<port>,<stopMode>         stop: 0 coast 1 brake 2 hold 3 continue 4 smart coast 5 smart brake
//   sa                           stop every motor (coast)
//   rs,<port>,<pos>              reset the relative position counter
//   rd,<port>,<deg>,<dps>,<stop>,<accel>,<decel>            run for degrees        (reports "done")
//   rt,<port>,<ms>,<dps>,<stop>,<accel>,<decel>             run for time           (reports "done")
//   ra,<port>,<pos>,<dps>,<dir>,<stop>,<accel>,<decel>      run to absolute pos    (reports "done")
//   rr,<port>,<pos>,<dps>,<stop>,<accel>,<decel>            run to relative pos    (reports "done")
//   mp,<x>,<y>,<0-100>           light one pixel of the 5x5 matrix            (v2)
//   mc                           clear the matrix                              (v2)
//   mx,<25 values 0-100>         show a whole 5x5 image, row by row            (v2)
//   mt,<text>                    scroll text on the matrix (reports "done")    (v2)
//   bp,<hz>,<ms>,<vol>           beep (reports "done")                         (v2)
//   hl,<color 0-10>              colour of the hub's power-button light        (v2)
//   wd,<ms>                      watchdog: stop all motors if nothing is received for <ms> (0 = off)
//   q                            quit the helper program
//
// The 4 "r*" commands are awaited by one worker per port, so several motors can move at once, and a new command on a
// port interrupts the previous one on that port. Position / speed / power are NOT reported by the helper: the hub
// already streams them in its DeviceNotification messages.

export const SPIKE_MOTOR_HELPER_VERSION = 2;

export const SPIKE_MOTOR_HELPER_PY = String.raw`# SPIKE motor helper v2 (uploaded by DeviceSpike3.js). Do not edit on the hub: it is re-uploaded on demand.
import hub
import motor
import runloop
import time
from hub import port as P
try:
    from hub import light_matrix, sound, light
except Exception:
    light_matrix = sound = light = None

VER = 2
LETTERS = "ABCDEF"
PORTS = {"A": P.A, "B": P.B, "C": P.C, "D": P.D, "E": P.E, "F": P.F}
tun = hub.config["module_tunnel"]

run = True
pend = {}
busy = {}
auxq = []
wd_ms = 0
last_rx = time.ticks_ms()


def reply(s):
    try:
        tun.send(s.encode())
    except Exception as e:
        print("send err " + repr(e))


def stop_all():
    del auxq[:]
    try:
        sound.stop()
    except Exception:
        pass
    for L in LETTERS:
        try:
            motor.stop(PORTS[L], stop=motor.COAST)
        except Exception:
            pass


def handle(line):
    global run, wd_ms
    f = line.split(",")
    i = f[0]
    c = f[1]
    if c == "ping":
        reply(i + ",ok," + str(VER))
    elif c == "pw":
        pend.pop(f[2], None)
        motor.set_duty_cycle(PORTS[f[2]], int(f[3]))
        reply(i + ",ok")
    elif c == "sp":
        pend.pop(f[2], None)
        motor.run(PORTS[f[2]], int(f[3]), acceleration=int(f[4]))
        reply(i + ",ok")
    elif c == "st":
        pend.pop(f[2], None)
        motor.stop(PORTS[f[2]], stop=int(f[3]))
        reply(i + ",ok")
    elif c == "sa":
        pend.clear()
        stop_all()
        reply(i + ",ok")
    elif c == "rs":
        motor.reset_relative_position(PORTS[f[2]], int(f[3]))
        reply(i + ",ok")
    elif c == "rd" or c == "rt" or c == "ra" or c == "rr":
        L = f[2]
        if L not in PORTS:
            reply(i + ",err,bad port " + L)
            return
        if busy.get(L):
            # a motion is being awaited on this port: stopping it releases the worker, which then takes the new job
            motor.stop(PORTS[L], stop=motor.COAST)
        pend[L] = (i, c, f[3:])
        reply(i + ",ok")
    elif c == "mp":
        light_matrix.set_pixel(int(f[2]), int(f[3]), int(f[4]))
        reply(i + ",ok")
    elif c == "mc":
        light_matrix.clear()
        reply(i + ",ok")
    elif c == "mx":
        for k in range(25):
            light_matrix.set_pixel(k % 5, k // 5, int(f[2 + k]))
        reply(i + ",ok")
    elif c == "mt":
        auxq.append((i, c, ",".join(f[2:])))
        reply(i + ",ok")
    elif c == "bp":
        auxq.append((i, c, f[2:5]))
        reply(i + ",ok")
    elif c == "hl":
        light.color(light.POWER, int(f[2]))
        reply(i + ",ok")
    elif c == "wd":
        wd_ms = int(f[2])
        reply(i + ",ok")
    elif c == "q":
        run = False
        reply(i + ",ok")
    else:
        reply(i + ",err,unknown command " + c)


def on_msg(data):
    global last_rx
    last_rx = time.ticks_ms()
    line = ""
    try:
        line = bytes(data).decode()
        handle(line)
    except Exception as e:
        i = line.split(",")[0] if line else "0"
        reply(i + ",err," + repr(e))


async def worker(L):
    p = PORTS[L]
    while run:
        job = pend.pop(L, None)
        if job is None:
            await runloop.sleep_ms(5)
            continue
        i, c, a = job
        busy[L] = True
        try:
            if c == "rd":
                st = await motor.run_for_degrees(p, int(a[0]), int(a[1]), stop=int(a[2]), acceleration=int(a[3]), deceleration=int(a[4]))
            elif c == "rt":
                st = await motor.run_for_time(p, int(a[0]), int(a[1]), stop=int(a[2]), acceleration=int(a[3]), deceleration=int(a[4]))
            elif c == "ra":
                st = await motor.run_to_absolute_position(p, int(a[0]), int(a[1]), direction=int(a[2]), stop=int(a[3]), acceleration=int(a[4]), deceleration=int(a[5]))
            else:
                st = await motor.run_to_relative_position(p, int(a[0]), int(a[1]), stop=int(a[2]), acceleration=int(a[3]), deceleration=int(a[4]))
            reply(i + ",done," + L + "," + str(st))
        except Exception as e:
            reply(i + ",err," + repr(e))
        busy[L] = False


async def aux():
    while run:
        if not auxq:
            await runloop.sleep_ms(10)
            continue
        i, c, a = auxq.pop(0)
        try:
            if c == "mt":
                r = light_matrix.write(a)
            else:
                r = sound.beep(int(a[0]), int(a[1]), int(a[2]))
            try:
                await r
            except TypeError:
                pass
            reply(i + ",done,X,0")
        except Exception as e:
            reply(i + ",err," + repr(e))


async def watchdog():
    global last_rx
    while run:
        await runloop.sleep_ms(100)
        if wd_ms and time.ticks_diff(time.ticks_ms(), last_rx) > wd_ms:
            pend.clear()
            stop_all()
            last_rx = time.ticks_ms()


async def main():
    tun.callback(on_msg)
    reply("0,rdy," + str(VER))
    while run:
        await runloop.sleep_ms(50)


runloop.run(main(), watchdog(), aux(), worker("A"), worker("B"), worker("C"), worker("D"), worker("E"), worker("F"))
`;
