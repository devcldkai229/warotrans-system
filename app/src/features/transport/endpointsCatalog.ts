export interface FacilityEndpoint {
  code: string;
  name: string;
  zone: string;
  type: 'DOCK' | 'RACK' | 'DEPOT';
}

export const FACILITY_ENDPOINTS: FacilityEndpoint[] = [
  { code: 'DOCK-01', name: 'Inbound Dock 01 (Receiving)', zone: 'Receiving Bay', type: 'DOCK' },
  { code: 'DOCK-02', name: 'Inbound Dock 02 (Heavy Cargo)', zone: 'Receiving Bay', type: 'DOCK' },
  { code: 'DOCK-04', name: 'Outbound Dock 04 (Dispatch)', zone: 'Shipping Bay', type: 'DOCK' },
  { code: 'RACK-A01', name: 'Rack A-01 (Sensors & Micro)', zone: 'Storage Zone A', type: 'RACK' },
  { code: 'RACK-A02', name: 'Rack A-02 (Proximity Modules)', zone: 'Storage Zone A', type: 'RACK' },
  { code: 'RACK-A09', name: 'Rack A-09 (Valves & Actuators)', zone: 'Storage Zone A', type: 'RACK' },
  { code: 'RACK-B01', name: 'Rack B-01 (Bulk Pallet 01)', zone: 'Storage Zone B', type: 'RACK' },
  { code: 'RACK-B04', name: 'Rack B-04 (Bulk Heavy Coupler)', zone: 'Storage Zone B', type: 'RACK' },
  { code: 'DEPOT-01', name: 'Depot Charging Bay 01', zone: 'Maintenance Bay', type: 'DEPOT' },
];

export const PRESET_CONTAINERS = [
  { barcode: 'BOX-101', product: 'Optical Proximity Sensor X4', defaultQty: 45 },
  { barcode: 'BOX-204', product: 'Pneumatic Actuator Valve', defaultQty: 50 },
  { barcode: 'TOTE-088', product: 'Relay Modules 24V', defaultQty: 20 },
  { barcode: 'BOX-305', product: 'Micro Controller Unit ESP32', defaultQty: 100 },
];
