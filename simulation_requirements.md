# Universe Engine Simulation Requirements

This document details the basic set up and requirements for each of the "themes" in the Universe Engine simulation. Each theme needs to have the following components:

- A parameter space (3-4 axes maximum).
- A set of videos showing (3-5) different components across that parameter space with runtimes of 20-30 seconds.
- A table of data that with a row per frame of the video including the "Live data" for that overlay.
- A yaml file of field and value pairs per video to populate the "Run Summary" that shows up after the video is done playing and _including the videos parameters_.
- A log from SWIFT per video that we _may or may not_ link up to a tab so the user can "see what we see".
- An audio file per video including the sonifications.

NOTE: I understand that these requirements are slightly different for the Galaxy theme. We can work on those below.

Each theme can also choose one of the "app themes" (apologies for the THEME degeneracy) to use from the option included in the app.

## The parameter space

Each theme should have a parameter space of 3-4 axes maximum over which the videos are distributed. These should be both meaningful and interesting parameters to vary while also being easy and meaningful to explain to the public and give them a takeaway from the experience. For example, in the LSS group we were planning to vary sigma8 for clustering but have decided this is too abstract.

I suggest that when selecting the parameter values for videos, they cluster around "correct values" to allow people hunting the right answer to get varying videos, but also select some fun and interesting extremes too.

The in app sliders will have "infinite adjustability" and once the user selects their parameters the app will find the closet video by a nearest grid point look up.

NOTE: there is no need for every value along an axis to have a video at every other axis point.

## The videos

Each set of parameters should have a set of videos visualising different properties (3-5 is optimal) with runtimes of 20-30 seconds (to keep the app experience responsive and to push the user towards tinkering). The app will include the ability to flick between the visualised component.

We will eventually host these on a server with some client side caching to allow for quick loading but we will likely also have a local back up on event.

For ease its best if these videos (and the surrounding data) are all named with a sensible scheme and kept in one place on cosma along side the rests of the data.

## The live data table

As the videos play there will be a widget in the top right showing dynamic data that updates alongside the video. This data would be easiest to extract via a csv table with a row per frame and a column per dynamic property. The app can then just load this and sync the update rate with the video progress.

As well as simple signposting, it would be great to include properties here that could spark discussion. They don't have to be 100% accurate and can come from SWIFT logs or be calculated directly from snapshots.

## The run summary

This is the information that will be shown at the end of the video. For some of the themes this will include the gamified "score" aspect to encourage users to try and find the "best" answer. However, this should also include summary statistics to spark conversation about the physics at play, the hardware/methods used, and in particular environmental impact. This should be stored in a yaml file per video with field and value pairs to make it easy to parse for the app.

This yaml should also include the parameters used for the video which will later be processed into a video database mapping parameters to videos.

## The sonifications

Ideally, we want to include sonifications for each video to make the experience more accessible and engaging. These sonfications simply need time series of properties across the length of the video. These time series can then be converted into sonifications which can be saved as separate audio files. These audio files COULD be attached directly to the videos, or could be synced as a separate element in the app.

The app will include the ability to mute and unmute the sonifications. Whether we have multiple audio tracks or a single one per video is something to discuss since you could imagine selecting different properties to listen to, but this may be beyond the scope of what we can do for the event.

On event the sonifications will only work if we can get headphones (think single cups like a museum) to associate with each "console".

## LSS/ Cosmology

### Parameter Space

- Omega_b:
  - Limits: 0.040-0.060
- Jet velocity:
  - Limits: 100-10,000 km/s
- Star formation efficiency (?):
  - Limits: ???

### Videos

- Video location (on cosma):
- Number of videos: ~100
- Visualised components:
  - Dark matter mass
  - Gas mass
  - Star mass
  - Mass weighted gas temperature
  - Mass weighted gas metallicity

### Live Data Table

- Universe Age
- Redshift
- Particles Updated?
- Average temperature?
- Stellar Masses Formed
- SFR
- Number of black holes
- Number of supernovae?

### Run Summary

- Score (proximity to our best answer)
- Total runtime
- Carbon cost of the sim?
- Compute used (converting CPU hours to a public readable unit like "smartphones" or "PS5s")
- Memory used
- Particles updated through sim (just a fun big number)
- Total number of black holes formed
- Total number of supernovae
- Total stellar mass formed

### Sonification properties

- SFR
- Black hole accretion rate
- Expansion rate?

## Galaxy

### Parameter Space

- ???:
  - Limits:

### Videos

- Video location (on cosma):
- Number of videos:
- Visualised components:
  - HST image
  - ???

### Live Data Table

This one might be trickier since there won't be time evolution. Maybe this can just be a static proeprty list in your case?

- ???

### Run Summary

- Score (proximity to the Milky Way properties? or Maybe this has no score?)
- ...

### Sonification properties

- ???

## Moon/Planetary

### Parameter Space

- ???:
  - Limits:

### Videos

- Video location (on cosma):
- Number of videos:
- Visualised components:
  - ???

### Live Data Table

- ???

### Run Summary

- Score (proximity to the real moon?)
- Total runtime
- Carbon cost of the sim?
- Compute used (converting CPU hours to a public readable unit like "smartphones" or "PS5s")
- Memory used

### Sonification properties

- ???
