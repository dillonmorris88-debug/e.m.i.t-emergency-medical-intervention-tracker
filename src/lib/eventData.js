export const INTERVENTIONS = [
  { label: 'IV Access', key: 'iv_access' },
  { label: 'IO Access', key: 'io_access' },
  { label: 'Spinal Restriction', key: 'spinal_restriction' },
  { label: 'BVM', key: 'bvm' },
  { label: 'Airway Placement', key: 'airway_placement' },
  { label: 'Intubation', key: 'intubation' },
  { label: 'King Airway', key: 'king_airway' },
  { label: 'CPAP', key: 'cpap' },
  { label: 'Defibrillation', key: 'defibrillation' },
  { label: 'Cardioversion', key: 'cardioversion' },
  { label: '12-Lead ECG', key: 'ecg_12lead' },
  { label: 'Needle Decompression', key: 'needle_decompression' },
  { label: 'Tourniquet', key: 'tourniquet' },
  { label: 'Wound Packing', key: 'wound_packing' },
  { label: 'Splinting', key: 'splinting' },
  { label: 'O2 Applied', key: 'o2_applied' },
];

export const MEDICATIONS = [
  { label: 'Epinephrine', key: 'epinephrine' },
  { label: 'Dirty Epi Drip', key: 'dirty_epi_drip' },
  { label: 'Fluid Bolus', key: 'fluid_bolus' },
  { label: 'Ofirmev', key: 'ofirmev' },
  { label: 'Fentanyl', key: 'fentanyl' },
  { label: 'Ketamine', key: 'ketamine' },
  { label: 'Ativan', key: 'ativan' },
  { label: 'Versed', key: 'versed' },
  { label: 'Morphine', key: 'morphine' },
  { label: 'Adenosine', key: 'adenosine' },
  { label: 'Amiodarone', key: 'amiodarone' },
  { label: 'Aspirin', key: 'aspirin' },
  { label: 'Narcan', key: 'narcan' },
  { label: 'Dextrose', key: 'dextrose' },
  { label: 'Nitro', key: 'nitro' },
  { label: 'Albuterol', key: 'albuterol' },
];

export const RHYTHMS = [
  { label: 'V-Fib', key: 'vfib', color: 'text-red-400' },
  { label: 'V-Tach', key: 'vtach', color: 'text-red-400' },
  { label: 'PEA', key: 'pea', color: 'text-amber-400' },
  { label: 'Asystole', key: 'asystole', color: 'text-amber-400' },
  { label: 'Normal Sinus', key: 'nsr', color: 'text-green-400' },
  { label: 'A-Fib', key: 'afib', color: 'text-blue-400' },
  { label: 'SVT', key: 'svt', color: 'text-blue-400' },
  { label: 'Bradycardia', key: 'bradycardia', color: 'text-amber-400' },
];

export const CATEGORY_COLORS = {
  intervention: 'border-blue-500 bg-blue-500/10 text-blue-300',
  medication: 'border-amber-500 bg-amber-500/10 text-amber-300',
  cpr: 'border-red-500 bg-red-500/10 text-red-300',
  rhythm: 'border-purple-500 bg-purple-500/10 text-purple-300',
  rosc: 'border-green-500 bg-green-500/10 text-green-300',
  notes: 'border-slate-500 bg-slate-500/10 text-slate-300',
};