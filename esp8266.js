// requires
load('api_gpio.js');
load('api_sys.js');
load('api_timer.js');
load('api_events.js');
load('api_net.js');
load('api_http.js');
// VARs
let led = 13;
let button = 0;
let relay = 12;
let motion = 14;
let motionBlocked=0;
let buttonBlocked=0;
let bID=false;
let evs = null;
let arch=[];
let ntfyUrl="http://iot.pnts.co/basement-lights/api/";
// GPIO INIT
GPIO.set_pull(relay,GPIO.PULL_UP);
GPIO.set_mode(relay, GPIO.MODE_OUTPUT);
GPIO.set_mode(led, GPIO.MODE_OUTPUT);
GPIO.set_mode(motion, GPIO.MODE_INPUT);
//
let cRelay=GPIO.read(relay);
let cMotion=0;
// Functions
function ntfy(time,msg){
  if (arch.length && evs === 'GOT_IP'){
    HTTP.query({
      url: ntfyUrl,
      data: { t: 0, m: JSON.stringify(arch) },
      success: function(b,h){ arch=[]; }
    });
  }
  arch.splice(arch.length,0,{ t: time, m: msg });
  if(evs === 'GOT_IP') {
    HTTP.query({
      url: ntfyUrl,
      data: { t: time, m: msg },
      success: function(b,h){ if (arch.length) arch.splice(-1,1); },
      error: function(err){ if (arch.length>32) arch.splice(0,1); }
    });
  } else {
    if (arch.length>32) arch.splice(0,1);
  }
  print(time, msg, "::Relay state -", GPIO.read(relay));
}
function blackOUT(){
  if (bID) Timer.del(bID);
  bID=Timer.set(120000,0,function(){
    GPIO.write(relay,0);
    cRelay=GPIO.read(relay);
    motionBlocked=Timer.now()+10;
    buttonBlocked=Timer.now()+10;
    ntfy(Timer.now(),"Lights OFF");
  }, null);
}
//handle button
GPIO.set_button_handler(button, GPIO.PULL_UP, GPIO.INT_EDGE_NEG, 10000, function() {
  if (buttonBlocked<Timer.now()){
    motionBlocked=Timer.now()+60;
    GPIO.toggle(relay);
    cRelay=GPIO.read(relay);
    blackOUT();
    if (cRelay) { ntfy(Timer.now(),"Lights ON (button)"); }
    else { ntfy(Timer.now(),"Lights OFF (button)"); }
  }
}, null);
//handle motion
Timer.set(250, Timer.REPEAT, function (){
  if(evs !== 'GOT_IP') {
    GPIO.toggle(led); //blink while conecting WiFi
  }
  if (GPIO.read(motion)!==cMotion && motionBlocked<Timer.now()){
    cMotion=GPIO.read(motion);
    GPIO.write(led,(1-cMotion));
    if (cMotion) {
      if(bID) { Timer.del(bID); bID=false; }
      if (cRelay===0) {
        GPIO.write(relay,1);
        buttonBlocked=Timer.now()+10;
        cRelay=GPIO.read(relay);
        ntfy(Timer.now(),"Lights ON (motion)");
      }
    } else { blackOUT(); }
  }
},null);
// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
  if (ev === Net.STATUS_DISCONNECTED) {
    evs = 'DISCONNECTED';
  } else if (ev === Net.STATUS_CONNECTING) {
    evs = 'CONNECTING';
  } else if (ev === Net.STATUS_CONNECTED) {
    evs = 'CONNECTED';
  } else if (ev === Net.STATUS_GOT_IP) {
    evs = 'GOT_IP';
    ntfy(Timer.now(),"Connected WiFi");
    GPIO.write(led,1);
  }
  print('== Net event:', ev, evs);
}, null);
// Booted
blackOUT(); // turn off after 2 min
ntfy(Timer.now(),"Booted");
