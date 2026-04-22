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

## LSS/ Cosmology

### Parameter Space

- Omega_b:
  - Limits:
  - N_samples:
- Jet velocity:
  - Limits:
  - N_samples:
- Star formation efficiency (?):
  - Limits:
  - N_samples:

### Videos

- Video location (on cosma):
- Number of videos:
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
  - N_samples:
    ...

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
  - N_samples:

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
