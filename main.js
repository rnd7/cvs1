/* CVS1 */

/*
Computational Vertex Syntesis Proof of Concept.

Copyright 2019 by Nicholas Schreiber

Prototype Code. See LICENSE.md. Contact me for further Details.
*/


/* Util ***********************************************************************/

function lerp(a, b, q) {
  return (1-q)*a+q*b
}

/* Waveform *******************************************************************/

function Waveform(ctx) {
  this.context = ctx
  this.interpolation = "linear"
  this.tune = 0
  this.fineTune = 0
  this.rel = 0
  this.tick = 0
  this.frequency = 440
  this.noteOffTime = .5
  this.hasZero = true
  this.enforceZero = true
  this.value = 0
  this.paused = true
  this.vertices = [
    { t: 0.25, a: .5},
    { t: 0.75, a: -.5},
  ]
}

Waveform.prototype.sortVertices = function () {
  this.vertices.sort((a,b) => {
    return a.t-b.t
  })
}

Waveform.prototype.updateVertices = function() {
  this.sortVertices()
  this.recalc()
}

Waveform.prototype.setTune = function(val) {
  this.tune = val
  this.recalc()
}

Waveform.prototype.setFineTune = function(val) {
  this.fineTune = val
  this.recalc()
}

Waveform.prototype.setFrequency = function(val) {
  this.frequency = val
  this.recalc()
}

Waveform.prototype.calculateSamples = function() {
  let tune = this.tune + this.fineTune
  let tunedFreq = this.frequency
  if (tune!=0) tunedFreq *= Math.pow(FREQ_CONST, tune)
  let samples = 1/tunedFreq * this.context.sampleRate
  return Math.max(1,samples)
}

Waveform.prototype.recalc = function() {
  let samples = this.calculateSamples()
  let prevTick = 0
  let min = 1
  let max = -1
  for (let i=0; i<this.vertices.length; i++) {
    min = Math.min(this.vertices[i].a, min)
    max = Math.max(this.vertices[i].a, max)
    this.vertices[i].tick = Math.round(this.vertices[i].t * samples)
    if (this.vertices[i].tick <= prevTick) this.vertices[i].tick++
    prevTick = this.vertices[i].tick
  }
  this.hasZero = (min<=0 && max >= 0)
}

Waveform.prototype.findNext = function(vertices, tick) {
  for (let i=0; i<vertices.length; i++) {
    if (vertices[i].tick > tick) return vertices[i]
  }
  return vertices[0]
}

Waveform.prototype.next = function() {
  let startPos = 0
  let from = 0
  let samples = this.calculateSamples()
  let factor = 1
  if (this.task) {
    if (this.task.samples != samples) {
      factor = samples/this.task.samples
    }
    from = this.task.to
    startPos = Math.round(factor*this.task.endPos)
  }

  let t = 0
  let a = 0
  let next
  let to = 0
  let delta = 0
  let ticklen = 1/samples
  next = this.findNext(this.vertices, startPos)
  if (next) {
    t = next.tick
    a = next.a
  }
  if (startPos > t) {
    delta = samples-startPos + t
  } else {
    delta = t-startPos
  }
  to = a
  let ticks = Math.max(1,Math.round(delta))
  this.task = {
    type: "vertex",
    interpolation: this.interpolation,
    endPos: t,
    samples,
    start: this.tick,
    ticks: ticks,
    from,
    to
  }

}

Waveform.prototype.fadeOut = function() {
  let from = 0
  if (this.task) {
    from = this.task.to
  }
  let samples = this.calculateSamples()
  let ticks = Math.max(1,Math.round(samples*this.noteOffTime))
  this.task = {
    type: "pause",
    interpolation: this.interpolation,
    endPos: 0,
    samples,
    start: this.tick,
    ticks,
    from,
    to: 0
  }
}

Waveform.prototype.calculate = function() {
  if (!this.task || this.tick-this.task.start >= this.task.ticks) {
    if (this.paused) {
      if( this.value != 0) {
        this.fadeOut()
      } else {
        this.task = null
      }
    } else {
      this.next()
    }
  }
  if (!this.task) {
    this.value = 0
    return this.value
  }
  let q
  let qs
  q =  (this.tick-this.task.start)/ (this.task.ticks)
  switch(this.task.interpolation) {
    case "linear":
      qs = q
      break
    case "spike":
      qs = (Math.pow((q-.5)/.5,3) +1)/2
      break
    case "quadratic":
      if (q<.5) {
        qs = Math.pow(q/.5, 2)/2
      } else {
        qs = -((Math.pow((1-q)/.5, 2)-1)/2)+.5
      }
      break
    case "cubic":
      if (q<.5) {
        qs = Math.pow(q/.5, 3)/2
      } else {
        qs = -((Math.pow((1-q)/.5, 3)-1)/2)+.5
      }
      break
  }
  this.tick++
  this.value = lerp(this.task.from, this.task.to, qs)
  return this.value
}

/* VertexSynth ****************************************************************/

function VertexSynth(ctx) {
  this.context = ctx
  this.BUFFER_SIZE = 1024
  this.waveform = new Waveform(this.context)
  this.paused = false
  this.lastStep = 0
  this.smoothing = 0
  this.tick = 0
  this.protectSpeaker = true
  this.speakerProtection = false
  this.nonZero = 0
  var processor = this.context.createScriptProcessor(this.BUFFER_SIZE)
  processor.onaudioprocess = this.onProcess.bind(this)
  processor.connect(analyser)
}

VertexSynth.prototype.updateWaveform = function() {
  this.waveform.paused = this.paused
}

VertexSynth.prototype.noteOn = function() {
  this.paused = false
  this.speakerProtection = false
  this.updateWaveform()
}

VertexSynth.prototype.noteOff = function() {
  this.paused = true
  this.updateWaveform()
}


VertexSynth.prototype.onProcess = function(e) {
  var leftOut = e.outputBuffer.getChannelData(0)
  var rightOut = e.outputBuffer.getChannelData(1)
  for (var i = 0; i < this.BUFFER_SIZE; i++) {
    let raw = 0
    raw = this.waveform.calculate()
    if (this.smoothing) {
      raw = ((raw*(1-this.smoothing*.99)) + (this.lastStep*this.smoothing*.99))
    }
    if (this.protectSpeaker) {
      if (raw > 0.01 && this.nonZero >= 0) this.nonZero++
      else if (raw < -0.01 && this.nonZero <= 0) this.nonZero--
      else this.nonZero = 0
      if (Math.abs(this.nonZero) > this.BUFFER_SIZE * 4) {
        this.noteOff()
        this.nonZero = 0
        this.speakerProtection = true
      }
    }

    this.lastStep = leftOut[i] = rightOut[i] = raw
  }
}

/* Demo ***********************************************************************/

context = new (window.AudioContext || window.webkitAudioContext)()

/* Polyfill *******************************************************************/
if (!context.createGain)
  context.createGain = context.createGainNode
if (!context.createDelay)
  context.createDelay = context.createDelayNode
if (!context.createScriptProcessor)
  context.createScriptProcessor = context.createJavaScriptNode

/* Analyser *******************************************************************/

var analyser = context.createAnalyser()
analyser.connect(context.destination)
analyser.fftSize = 2048
var bufferLength = analyser.frequencyBinCount
var dataArray = new Uint8Array(bufferLength)

/* Synth Setup ****************************************************************/

var synth = new VertexSynth(context)

/* Waveform Editor ************************************************************/

let screen = document.querySelector("#screen")
let graphCV = document.querySelector('#graph')
let graphCTX = graphCV.getContext('2d')

let handleCV = document.querySelector('#handle')
let handleCTX = handleCV.getContext('2d')

let measureCV = document.querySelector('#measure')
let measureCTX = measureCV.getContext('2d')

let waveformCV = document.querySelector('#waveform')
let waveformCTX = waveformCV.getContext('2d')

let selected
let offsetX
let offsetY
let mouseX
let mouseY
let mouseDown
let clickTimeout
let clickOnPoint = false
let clickOnCanvas = false

screen.addEventListener('mousedown', (e) => {
    mouseDown = true
    var rect = handleCV.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
    selected = null
    var next
    for (var i = 0; i < synth.waveform.vertices.length; i++) {
      next = synth.waveform.vertices[i]
      offsetX = (next.t * handleCV.width) - mouseX
      offsetY = ((1-(next.a+1)/2) * handleCV.height) - mouseY
      var dist = Math.sqrt( offsetX*offsetX + offsetY*offsetY )
      if (dist < HANDLE_RADIUS) {
        selected = next
        break
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseout', onMouseOut)
    window.addEventListener('mouseup', onMouseUp)
})

function onMouseMove(e){
  if (mouseDown) {
    var rect = handleCV.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
  }
}
function onMouseOut(e) {
  var from = e.relatedTarget || e.toElement
  if (!from || from.nodeName == "HTML") {
    stopDrag(e)
  }
}
function onMouseUp(e) {
  stopDrag(e)
}

function stopDrag(e) {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseout', onMouseOut)
  window.removeEventListener('mouseup', onMouseUp)
  clearTimeout(clickTimeout)
  mouseDown = false
  var rect = handleCV.getBoundingClientRect()
  mouseX = e.clientX - rect.left
  mouseY = e.clientY - rect.top

  if (!selected) {
    if (!clickOnCanvas) {
      clickOnCanvas = true
      clickOnPoint = false
    } else {
      clickOnPoint = false
      clickOnCanvas = false
      selected = {
        t: Math.max(0, Math.min(1, mouseX/handleCV.width)),
        a: Math.max(-1,  Math.min(1, ((1-(mouseY / handleCV.height)) *2)-1))
      }
      synth.waveform.vertices.push(selected)
      synth.waveform.updateVertices()
    }
  } else {
    if (!clickOnPoint) {
      clickOnPoint = true
      clickOnCanvas = false
    } else {
      clickOnPoint = false
      clickOnCanvas = false
      if (synth.waveform.vertices.length > 2) {
        for (var i = 0; i<synth.waveform.vertices.length; i++) {
          if (selected === synth.waveform.vertices[i]) {
            synth.waveform.vertices.splice(i,1)
            synth.waveform.updateVertices()
            break
          }
        }
      }
    }
  }

  clickTimeout = setTimeout(() => {
    clickOnCanvas = false
    clickOnPoint = false
  },300)
  renderGraph()

}


function updateSelected() {
  if (selected) {
    selected.t = Math.max(0, Math.min(1, (mouseX + offsetX) / handleCV.width))
    selected.a = Math.max(-1, Math.min(1, ((1-((mouseY + offsetY) / handleCV.height)) *2)-1))
    synth.waveform.updateVertices()
  }
}

function resizeCanvas() {
   const width = screen.clientWidth
   const height = screen.clientHeight

   if (graphCV.width !== width || graphCV.height !== height) {
     graphCV.width = width
     graphCV.height = height
     handleCV.width = width
     handleCV.height = height
     measureCV.width = width
     measureCV.height = height
     waveformCV.width = width
     waveformCV.height = height
   }
}

const HANDLE_RADIUS = 9
const FREQ_CONST = 1.0594630943592953
const BASE_FREQ = 440
const MEASURE_HARMONICS = 7
const MEASURE_STEP =4

function renderMeasure() {

  measureCTX.clearRect(0,0,measureCV.width, measureCV.height)

  // v center
  measureCTX.strokeStyle = "rgba(255,255,255,.6)"
  measureCTX.lineWidth = 1
  measureCTX.beginPath()
  measureCTX.moveTo(0, measureCV.height*.5)
  measureCTX.lineTo(measureCV.width, measureCV.height*.5)
  measureCTX.stroke()

  for (let i = 1; i<=10; i++) {
    let yf = (measureCV.height/2) * i/10//i/(MEASURE_HARMONICS+1)
    measureCTX.strokeStyle = "rgba(255,255,255,"+(.1+(i/10*.3))+")"
    measureCTX.lineWidth = 1
    measureCTX.beginPath()
    let y =  Math.round(measureCV.height*.5 - yf)
    measureCTX.moveTo(0, y)
    measureCTX.lineTo(measureCV.width, y)
    y =  Math.round(measureCV.height*.5 + yf)
    measureCTX.moveTo(0, y)
    measureCTX.lineTo(measureCV.width, y)
    measureCTX.stroke()
  }

  for (let i = 1; i<=MEASURE_HARMONICS; i++) {
    let harmonic = i
    let factor = 1/harmonic
    let y = measureCV.height/2 * ( (MEASURE_HARMONICS-(i-1))/10) //factor//i/(MEASURE_HARMONICS+1)

    for (let j = 0; j < i; j++) {
      let x = .5+((factor)/2) * j *  (measureCV.width-1)
      let offset = 1/(i*2)

      measureCTX.beginPath()
      measureCTX.strokeStyle = "rgba(255,255,255,"+(1/(MEASURE_HARMONICS))+")"
      measureCTX.lineWidth = 1//1 + (MEASURE_HARMONICS-i)/3
      measureCTX.moveTo(x-offset, (measureCV.height*.5) - y)
      measureCTX.lineTo(x-offset, (measureCV.height*.5) + y)
      measureCTX.moveTo(measureCV.width/2 + x + offset, (measureCV.height*.5) - y)
      measureCTX.lineTo(measureCV.width/2 + x + offset, (measureCV.height*.5) + y)
      measureCTX.stroke()
    }

    measureCTX.beginPath()
    measureCTX.strokeStyle = "rgba(255,255,255,"+(1/(MEASURE_HARMONICS))+")"
    measureCTX.lineWidth = 1//1 + (MEASURE_HARMONICS-i)/3
    measureCTX.moveTo(measureCV.width-.5, (measureCV.height*.5) - y)
    measureCTX.lineTo(measureCV.width-.5, (measureCV.height*.5) + y)
    measureCTX.stroke()
  }
}

function renderWaveform() {
  analyser.getByteTimeDomainData(dataArray)
  waveformCTX.clearRect(0, 0, waveformCV.width, waveformCV.height)
  waveformCTX.lineWidth = 3
  waveformCTX.strokeStyle = '#3366FF'
  waveformCTX.beginPath()
  var sliceWidth = waveformCV.width / bufferLength
  var x = 0
  for(var i = 0; i < bufferLength; i++) {
    var v = dataArray[i] / 256.0
    var y = (1 - v) * waveformCV.height
    if(i === 0) {
      waveformCTX.moveTo(x, y)
    } else {
      waveformCTX.lineTo(x, y)
    }
    x += sliceWidth
  }
  waveformCTX.stroke()
}

function renderGraph() {
  graphCTX.clearRect(0,0,graphCV.width, graphCV.height)
  handleCTX.clearRect(0,0,handleCV.width, handleCV.height)

  graphCTX.strokeStyle = "#FFFF00"
  graphCTX.beginPath()
  var prev
  var next
  for (var i = 0; i < synth.waveform.vertices.length; i++) {
    next = synth.waveform.vertices[i]
    let nextX
    let nextY
    if (!prev) {
      nextX = (synth.waveform.vertices[synth.waveform.vertices.length-1].t - 1) * graphCV.width
      nextY = (1-(synth.waveform.vertices[synth.waveform.vertices.length-1].a+1)/2)  * graphCV.height
      graphCTX.moveTo(nextX, nextY)
    }
    nextX = next.t * graphCV.width
    nextY = (1-(next.a+1)/2) * graphCV.height
    graphCTX.lineTo(nextX, nextY)
    if (next === selected) {
      handleCTX.fillStyle = "#0000FF"
    } else {
      handleCTX.fillStyle = "#FFFF00"
    }
    handleCTX.beginPath()
    handleCTX.arc(nextX, nextY, HANDLE_RADIUS, 0, 2 * Math.PI)
    handleCTX.fill()
    prev = next
  }
  nextX = (synth.waveform.vertices[0].t + 1) * graphCV.width
  nextY = (1-(synth.waveform.vertices[0].a+1)/2) * graphCV.height
  graphCTX.lineTo(nextX, nextY)
  graphCTX.stroke()
}

resizeCanvas()
renderGraph()
renderMeasure()

/* Keyboard *******************************************************************/

let keyboard = document.querySelector('#keyboard')
const KEYS =  [
  {name: "a", black: false},
  {name: "a#", black: true},
  {name: "b", black: false},
  {name: "c", black: false},
  {name: "c#", black: true},
  {name: "d", black: false},
  {name: "d#", black: true},
  {name: "e", black: false},
  {name: "f", black: false},
  {name: "f#", black: true},
  {name: "g", black: false},
  {name: "g#", black: true},
]

let startKey = -12 // 0-12 a-g
let keys = 16

function setupKeyboard() {
  for (let i = 0; i<keys; i++ ) {
    let keyElement = document.createElement('DIV')
    let key = Math.abs((i+startKey+12)%12)
    let freq = BASE_FREQ * Math.pow(FREQ_CONST, i+startKey)
    keyElement.classList.add("key")
    keyElement.classList.add("noselect")
    let noteNameElement = document.createElement('DIV')
    noteNameElement.innerHTML = KEYS[key].name
    noteNameElement.classList.add('note-name')
    let arrowElement = document.createElement('DIV')
    arrowElement.innerHTML = '↕'
    arrowElement.classList.add('arrow')
    keyElement.appendChild(noteNameElement)
    keyElement.appendChild(arrowElement)
    keyboard.appendChild(keyElement)
    if (KEYS[key].black) {
      keyElement.classList.add("black")
    }
    keyElement.addEventListener("mousedown", (e) => {
      synth.waveform.setFrequency(freq)
      arrowElement.classList.add("visible")
      synth.noteOn()
    })
    window.addEventListener("mouseup", (e) => {
      arrowElement.classList.remove("visible")
    })
    window.addEventListener("mouseout", (e) => {
      var from = e.relatedTarget || e.toElement
      if (!from || from.nodeName == "HTML") {
        arrowElement.classList.remove("visible")
      }
    })
    keyElement.addEventListener("mouseup", (e) => {
      synth.noteOff()
    })

  }
}
setupKeyboard()

/* Ribbon *********************************************************************/

let ribbon = document.querySelector('#ribbon')
let ribbonX = 0
function setupRibbon() {
  let isDown = false
  let freqPerc = 0
  function update() {
    let freq = BASE_FREQ * Math.pow(FREQ_CONST, startKey + freqPerc * keys)
    synth.waveform.setFrequency(freq)
  }
  ribbon.addEventListener("mousedown", mouseDown)
  function mouseMove(e) {
    if (isDown) {
      var rect = ribbon.getBoundingClientRect()
      freqPerc = (e.clientX - rect.left)/rect.width
      update()
    }
  }
  function mouseOut(e) {
    stopRibbon(e)
  }
  function mouseDown(e) {
    startRibbon(e)

  }
  function mouseUp(e) {
    stopRibbon(e)
  }
  function startRibbon(e) {
    synth.noteOn()
    var rect = ribbon.getBoundingClientRect()
    freqPerc = (e.clientX - rect.left)/rect.width
    isDown = true
    update()
    ribbon.removeEventListener("mousedown", mouseDown)
    window.addEventListener("mousemove",mouseMove)
    window.addEventListener("mouseup", mouseUp)
    window.addEventListener("mouseout", mouseOut)
  }
  function stopRibbon() {
    synth.noteOff()
    isDown = false
    update()
    window.removeEventListener('mousemove', mouseMove)
    window.removeEventListener("mouseup", mouseUp)
    window.removeEventListener('mouseout', mouseOut)
    ribbon.addEventListener("mousedown", mouseDown)
  }

}
setupRibbon()


/* Tune ***********************************************************************/

let tune = document.querySelector("#tune")
tune.addEventListener("input", (e) => {
  synth.waveform.setTune(Math.round(e.target.value)-48)
})

/* Fine Tune ******************************************************************/

let fineTune = document.querySelector("#fine-tune")
fineTune.addEventListener("input", (e) => {
  synth.waveform.setFineTune((e.target.value/200) * 2 - 1)
})

/* Note Off Time **************************************************************/

let noteOffTime = document.querySelector("#note-off-time")
noteOffTime.addEventListener("input", (e) => {
  synth.waveform.noteOffTime = (e.target.value/100)
})

/* Interpolation **************************************************************/

let mode = document.querySelector("#mode")
mode.addEventListener("change", (e) => {
  synth.waveform.interpolation = e.target.value
})

/* Smoothing ******************************************************************/

let smoothing = document.querySelector("#smoothing")
smoothing.addEventListener("input", (e) => {
  synth.smoothing = e.target.value/100
})

/* Speaker Protection *********************************************************/

let enforceZero = document.querySelector("#protect-speaker input")
let enforceZeroLabel = document.querySelector("#protect-speaker label")
enforceZero.addEventListener("click", (e) => {
  synth.protectSpeaker = e.target.checked
})

/* MIDI ***********************************************************************/

let channel = 0
let midiChannel = document.querySelector("#midi-channel")
midiChannel.addEventListener("input", (e) => {
  channel = e.target.value-1
})

let midiInputs = []
let isDown = []
let device
function connect(e) {
  if (e.target.value == -1) {
    if (device) {
      device.onmidimessage = null
      device = null
    }
  } else {
    device = midiInputs[e.target.value]
    device.onmidimessage = function(m) {
      const [command, key, velocity] = m.data
      if (command === 144 + channel) {
        let k = key - 69
        if (isDown.indexOf(k)==-1) {
          isDown.push(k)
          //let key = Math.abs((i+startKey+12)%12)
          let freq = BASE_FREQ * Math.pow(FREQ_CONST, k)
          synth.waveform.setFrequency(freq)
          synth.noteOn()
        }
      } else if(command === 128  + channel) {
        let k = key - 69
        if (isDown.indexOf(k)>=0) {
          isDown.splice(isDown.indexOf(k),1)
        }
        if (!isDown.length) {
           synth.noteOff()
        } else {
          let freq = BASE_FREQ * Math.pow(FREQ_CONST, isDown[isDown.length-1])
          synth.waveform.setFrequency(freq)
          synth.noteOn()
        }
      }
    }
  }

}
const midiDevices = document.querySelector("#midi-devices")
function replaceElements() {
  midiDevices.removeEventListener('change', connect)
  while(midiDevices.firstChild) {
    midiDevices.removeChild(midiDevices.firstChild)
  }
  const el = document.createElement('OPTION')
  el.innerText = "None"
  el.value = -1
  midiDevices.appendChild(el)
  for (var i = 0; i<midiInputs.length; i++) {
    let e = midiInputs[i]
    const el = document.createElement('OPTION')
    el.innerText = `${e.name}`
    el.value = i
    midiDevices.appendChild(el)
  }

  midiDevices.addEventListener('change', connect)
}

navigator.requestMIDIAccess().then((access) => {
    midiInputs = Array.from(access.inputs.values())
    replaceElements()
    access.onstatechange = (e) => {
      midiInputs = Array.from(access.inputs.values())
      replaceElements()
    }

  }
)

/* Render Loop ****************************************************************/

let tick = 0
function graphicsLoop() {
  requestAnimationFrame(() => {
    graphicsLoop()
    if (mouseDown) {
      updateSelected()
      renderGraph()
    }
    if (tick++%2 == 0) renderWaveform()
    if (synth.speakerProtection) {
      enforceZeroLabel.classList.add("error")
    } else {
      enforceZeroLabel.classList.remove("error")
    }
  })
}
graphicsLoop()
