/** La tarifa Premium del catálogo comparte cabina física ECONOMY (RF-01). */
export function commercialCabin(fare: { cabinClass: string; code?: string; name?: string }) {
  if (fare.cabinClass === 'ECONOMY' && (fare.code === 'ECON-FLEX' || fare.name === 'Economy Premium')) return 'PREMIUM';
  return fare.cabinClass === 'BUSINESS' ? 'FIRST' : fare.cabinClass;
}
