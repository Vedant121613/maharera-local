import type { District } from '../types';

/**
 * Source of truth for district id/name pairs.
 *
 * These values are copied directly from MahaRERA's own
 * `project_district` select field, so they line up with the IDs the
 * Link Worker / Data Worker will use when scraping district-wise.
 * This is real reference data, not mock data — it will not change
 * when the backend is introduced.
 */
export const DISTRICTS: District[] = [
  { id: 497, name: 'Nandurbar' },
  { id: 498, name: 'Dhule' },
  { id: 499, name: 'Jalgaon' },
  { id: 500, name: 'Buldana' },
  { id: 501, name: 'Akola' },
  { id: 502, name: 'Washim' },
  { id: 503, name: 'Amravati' },
  { id: 504, name: 'Wardha' },
  { id: 505, name: 'Nagpur' },
  { id: 506, name: 'Bhandara' },
  { id: 507, name: 'Gondiya' },
  { id: 508, name: 'Gadchiroli' },
  { id: 509, name: 'Chandrapur' },
  { id: 510, name: 'Yavatmal' },
  { id: 511, name: 'Nanded' },
  { id: 512, name: 'Hingoli' },
  { id: 513, name: 'Parbhani' },
  { id: 514, name: 'Jalna' },
  { id: 515, name: 'Aurangabad' },
  { id: 516, name: 'Nashik' },
  { id: 517, name: 'Thane' },
  { id: 518, name: 'Mumbai Suburban' },
  { id: 519, name: 'Mumbai City' },
  { id: 520, name: 'Raigarh' },
  { id: 521, name: 'Pune' },
  { id: 522, name: 'Ahmednagar' },
  { id: 523, name: 'Beed' },
  { id: 524, name: 'Latur' },
  { id: 525, name: 'Osmanabad' },
  { id: 526, name: 'Solapur' },
  { id: 527, name: 'Satara' },
  { id: 528, name: 'Ratnagiri' },
  { id: 529, name: 'Sindhudurg' },
  { id: 530, name: 'Kolhapur' },
  { id: 531, name: 'Sangli' },
  { id: 990, name: 'Palghar' },
  { id: 992, name: 'DHARASHIV' },
];
