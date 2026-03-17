/**
 * Simulation class definitions.
 *
 * Each simulation class has:
 *  - id / label / icon (Unicode placeholder, will become SVGs)
 *  - A list of parameters with name, unit, min, max, step, and default value
 *  - A placeholder image path (served from /assets/)
 */

export interface SimParameter {
  /** Internal key */
  id: string;
  /** Human-readable label */
  label: string;
  /** Physical unit string shown next to the value */
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface SimulationClass {
  id: string;
  label: string;
  /** Unicode icon placeholder — will be replaced with SVGs later */
  icon: string;
  /** Path to the placeholder image in /assets/ */
  placeholderImage: string;
  parameters: SimParameter[];
}

export const SIMULATION_CLASSES: SimulationClass[] = [
  {
    id: 'planetary',
    label: 'Planetary',
    icon: '🌍',
    placeholderImage: '/assets/planet_example.png',
    parameters: [
      {
        id: 'impactor_mass',
        label: 'Impactor Mass',
        unit: 'M⊕',
        min: 0.01,
        max: 10,
        step: 0.01,
        defaultValue: 0.1,
      },
      {
        id: 'impactor_velocity',
        label: 'Impactor Velocity',
        unit: 'km/s',
        min: 1,
        max: 50,
        step: 0.5,
        defaultValue: 12,
      },
      {
        id: 'impactor_angle',
        label: 'Impactor Angle',
        unit: '°',
        min: 0,
        max: 90,
        step: 1,
        defaultValue: 45,
      },
    ],
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    icon: '🌀',
    placeholderImage: '/assets/galaxy_example.png',
    parameters: [
      {
        id: 'star_formation_rate',
        label: 'Star Formation Rate',
        unit: 'M☉/yr',
        min: 0.1,
        max: 100,
        step: 0.1,
        defaultValue: 3,
      },
      {
        id: 'black_hole_mass',
        label: 'Black Hole Mass',
        unit: '×10⁶ M☉',
        min: 0.1,
        max: 1000,
        step: 0.1,
        defaultValue: 4,
      },
      {
        id: 'diskiness',
        label: 'Diskiness',
        unit: '',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.7,
      },
      {
        id: 'stellar_mass',
        label: 'Stellar Mass',
        unit: '×10¹⁰ M☉',
        min: 0.01,
        max: 50,
        step: 0.01,
        defaultValue: 5,
      },
    ],
  },
  {
    id: 'cosmos',
    label: 'Cosmos',
    icon: '✨',
    placeholderImage: '/assets/cosmos_example.png',
    parameters: [
      {
        id: 'dark_matter_density',
        label: 'Dark Matter Density',
        unit: 'Ωdm',
        min: 0.05,
        max: 0.8,
        step: 0.01,
        defaultValue: 0.27,
      },
      {
        id: 'baryon_density',
        label: 'Baryon Density',
        unit: 'Ωb',
        min: 0.01,
        max: 0.15,
        step: 0.001,
        defaultValue: 0.049,
      },
      {
        id: 'feedback_strength',
        label: 'Feedback Strength',
        unit: '',
        min: 0,
        max: 5,
        step: 0.1,
        defaultValue: 1,
      },
      {
        id: 'clustering',
        label: 'Clustering',
        unit: 'σ₈',
        min: 0.4,
        max: 1.2,
        step: 0.01,
        defaultValue: 0.81,
      },
    ],
  },
];
