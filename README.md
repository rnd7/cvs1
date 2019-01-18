# CVS1
Computational Vertex Synthesis

## About
I always wondered why there is no Synthesizer that lets you draw the desired waveform. Instead you end up mixing the output of multiple Oscillators to get something less Square, Saw, Sine.

As Proof of Concept I wrote this prototype. It's entirely written in JS and I am quite happy how it performs. I expected less.

CVS1 is monophonic, single voiced, has no envelope and does not support stop dynamics. This prototype is focused on generating a tone from some Vertices that represent the Peaks of the waveform.

## Run
Open index.html in your browser or navigate to [CVS1](https://rnd7.github.io/cvs1/)

## Usage
Try the black an white keyboard at the bottom if you do not have any clue how a Synthesizer works.

### Keyboard
You can use the build in Keyboard to play some notes. Drag up or down while pressing a key on the Keyboard for continuous playback of the selected note, click again to release it.

### Ribbon
The Ribbon right above the Keyboard can be used for continuous frequency change while pressing and dragging left or right.

### Waveform
The Waveform is realtime editable, the yellow circles represent the vertices of the Waveform. Drag them around to change the Waveform. You can add and remove vertices by double clicking.

Try keeping at least one Vertex below the horizontal Zero Line in the middle of the view. Otherwise the Speaker Protection Feature will stop the playback.

### Interpolation
Change the interpolation for a smooth or spiky output.

### Tune
Pitch up or down in semitone steps. You can use the arrow keys on your keyboard for single steps.

### Fine Tune
Pitch correction in percents of a semitone. You can use the arrow keys on your keyboard for single steps.

### Note Off Time
The time it takes to fade out a note on note off. This is experimental and will be removed in future releases.

### Inertia
Experimental additional post synthesis smoothing.

### Protect Speakers
Since it is likely to generate output without zero crossing the Speaker Protection should be turned on. Otherwise Speaker Coils might be damaged.

When engaged the Speaker Protection stops the currently played note.

### MIDI
CVS1 has basic MIDI Support select a MIDI Input Device and a MIDI Channel to play the Synth using a external Keyboard or a sequencer. By only note on and note off are implemented.


## License
See the [LICENSE](LICENSE.md) file for license rights and limitations (GPL-v3).
