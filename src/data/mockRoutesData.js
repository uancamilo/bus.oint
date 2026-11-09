/**
 * mockRoutesData.js
 * Dataset representativo y georreferenciado para el sistema de buses de Medellín.
 * Formato nativo para React Native Maps: { latitude, longitude }.
 */

// Helper para calcular el rumbo (bearing) en grados (0 a 360) entre dos coordenadas
export function calculateBearing(startLat, startLng, endLat, endLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const lat1 = toRad(startLat);
  const lat2 = toRad(endLat);
  const dLng = toRad(endLng - startLng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

// Cálculo de distancia en metros mediante la fórmula del Haversine
export function calculateDistanceMeters(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  const R = 6371e3; // Radio de la Tierra en metros
  const toRad = (deg) => (deg * Math.PI) / 180;

  const φ1 = toRad(coord1.latitude);
  const φ2 = toRad(coord2.latitude);
  const Δφ = toRad(coord2.latitude - coord1.latitude);
  const Δλ = toRad(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Helper para encontrar la parada más cercana a la ubicación del usuario
export function getNearestStop(userCoord, stops) {
  if (!userCoord || !stops || stops.length === 0) return null;

  let nearest = null;
  let minDistance = Infinity;

  for (const stop of stops) {
    const dist = calculateDistanceMeters(userCoord, stop.coord);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = stop;
    }
  }

  // Estimación de tiempo caminando (80 metros por minuto = 4.8 km/h)
  const walkingMinutes = Math.max(1, Math.round(minDistance / 80));

  return {
    stop: nearest,
    distanceMeters: minDistance,
    walkingMinutes,
  };
}

// Centro inicial de Medellín
export const MEDELLIN_REGION = {
  latitude: 6.2442,
  longitude: -75.5812,
  latitudeDelta: 0.082,
  longitudeDelta: 0.082,
};

// Ubicación de usuario simulada por defecto (Laureles, cerca a UPB)
export const DEFAULT_USER_LOCATION = {
  latitude: 6.2415,
  longitude: -75.5890,
};

// Estilo de mapa limpio estilo Uber Light para Google Maps en React Native
export const UBER_MAP_STYLE = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#f5f5f5" }]
  },
  {
    "elementType": "labels.icon",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#f5f5f5" }]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#bdbdbd" }]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [{ "color": "#eeeeee" }]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [{ "color": "#e5e5e5" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#ffffff" }]
  },
  {
    "featureType": "road.arterial",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#dadada" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "featureType": "transit",
    "elementType": "geometry",
    "stylers": [{ "color": "#e8e8e8" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#c9c9c9" }]
  }
];

// Estilo de mapa oscuro estilo Uber Black / Night
export const UBER_DARK_MAP_STYLE = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#212121" }]
  },
  {
    "elementType": "labels.icon",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#212121" }]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [{ "color": "#181818" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.fill",
    "stylers": [{ "color": "#2c2c2c" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.fill",
    "stylers": [{ "color": "#3c3c3c" }]
  },
  {
    "featureType": "transit",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#000000" }]
  }
];

export const MOCK_ROUTES = [
  {
    id: "route-304",
    code: "304",
    name: "Circular Coonatra 304",
    longName: "Circular Sur - Laureles - UPB - San Juan - Centro",
    company: "Coonatra",
    color: "#EA580C", // Naranja cálido
    frequencyMinutes: 4,
    description: "Conecta San Javier, Estadio, Laureles, UPB y Centro.",
    coordinates: [
      { latitude: 6.2520, longitude: -75.6120 }, // San Javier
      { latitude: 6.2545, longitude: -75.6060 },
      { latitude: 6.2562, longitude: -75.5985 },
      { latitude: 6.2570, longitude: -75.5905 }, // Estadio
      { latitude: 6.2530, longitude: -75.5898 }, // Cra 70
      { latitude: 6.2475, longitude: -75.5895 }, // San Juan
      { latitude: 6.2428, longitude: -75.5908 }, // UPB
      { latitude: 6.2392, longitude: -75.5878 }, // Bulerías
      { latitude: 6.2375, longitude: -75.5820 },
      { latitude: 6.2410, longitude: -75.5780 }, // Parques del Río
      { latitude: 6.2440, longitude: -75.5735 }, // Alpujarra
      { latitude: 6.2472, longitude: -75.5685 }, // San Antonio
      { latitude: 6.2510, longitude: -75.5680 }, // Parque Berrío
      { latitude: 6.2540, longitude: -75.5750 },
      { latitude: 6.2542, longitude: -75.5835 }, // Suramericana
      { latitude: 6.2535, longitude: -75.5950 },
      { latitude: 6.2525, longitude: -75.6050 },
      { latitude: 6.2520, longitude: -75.6120 },
    ],
    stops: [
      { id: "s-304-1", name: "Estación San Javier Metro", coord: { latitude: 6.2520, longitude: -75.6120 }, type: "transfer" },
      { id: "s-304-2", name: "Estadio Girardot", coord: { latitude: 6.2570, longitude: -75.5905 }, type: "regular" },
      { id: "s-304-3", name: "Cra 70 Gastronómica", coord: { latitude: 6.2475, longitude: -75.5895 }, type: "regular" },
      { id: "s-304-4", name: "Campus UPB Laureles", coord: { latitude: 6.2428, longitude: -75.5908 }, type: "regular" },
      { id: "s-304-5", name: "Alpujarra / Centro", coord: { latitude: 6.2440, longitude: -75.5735 }, type: "transfer" },
      { id: "s-304-6", name: "Parque San Antonio", coord: { latitude: 6.2472, longitude: -75.5685 }, type: "transfer" },
      { id: "s-304-7", name: "Estación Suramericana", coord: { latitude: 6.2542, longitude: -75.5835 }, type: "transfer" },
    ]
  },
  {
    id: "route-130",
    code: "130",
    name: "Poblado 130",
    longName: "El Poblado - Parque Lleras - San Diego - Centro Oriental",
    company: "Autobuses Poblado S.A.",
    color: "#2563EB", // Azul eléctrico Uber
    frequencyMinutes: 5,
    description: "Corredor turístico y financiero de El Poblado al Centro.",
    coordinates: [
      { latitude: 6.1965, longitude: -75.5760 }, // Aguacatala
      { latitude: 6.2020, longitude: -75.5740 }, // Milla de Oro
      { latitude: 6.2065, longitude: -75.5720 }, // Parque Poblado
      { latitude: 6.2088, longitude: -75.5677 }, // Parque Lleras
      { latitude: 6.2130, longitude: -75.5695 },
      { latitude: 6.2195, longitude: -75.5710 }, // Ciudad del Río
      { latitude: 6.2260, longitude: -75.5718 },
      { latitude: 6.2345, longitude: -75.5710 }, // San Diego
      { latitude: 6.2390, longitude: -75.5690 },
      { latitude: 6.2445, longitude: -75.5660 }, // Bomboná
      { latitude: 6.2490, longitude: -75.5640 }, // La Playa
      { latitude: 6.2515, longitude: -75.5670 }, // Parque Berrío
      { latitude: 6.2485, longitude: -75.5680 },
      { latitude: 6.2350, longitude: -75.5725 },
      { latitude: 6.2104, longitude: -75.5710 },
      { latitude: 6.1965, longitude: -75.5760 },
    ],
    stops: [
      { id: "s-130-1", name: "Estación Aguacatala Metro", coord: { latitude: 6.1965, longitude: -75.5760 }, type: "transfer" },
      { id: "s-130-2", name: "Milla de Oro / Oviedo", coord: { latitude: 6.2020, longitude: -75.5740 }, type: "regular" },
      { id: "s-130-3", name: "Parque El Poblado", coord: { latitude: 6.2065, longitude: -75.5720 }, type: "regular" },
      { id: "s-130-4", name: "Parque Lleras", coord: { latitude: 6.2088, longitude: -75.5677 }, type: "regular" },
      { id: "s-130-5", name: "C.C. San Diego", coord: { latitude: 6.2345, longitude: -75.5710 }, type: "transfer" },
      { id: "s-130-6", name: "Av. Oriental / La Playa", coord: { latitude: 6.2490, longitude: -75.5640 }, type: "transfer" },
    ]
  },
  {
    id: "route-315",
    code: "315",
    name: "Santra 315",
    longName: "Belén Rincón - Parque Belén - Exposiciones - Centro",
    company: "Transportes Santra",
    color: "#059669", // Verde Esmeralda
    frequencyMinutes: 6,
    description: "Comuna 16 Belén hacia el centro cívico de Medellín.",
    coordinates: [
      { latitude: 6.2170, longitude: -75.6040 }, // Belén Rincón
      { latitude: 6.2230, longitude: -75.6000 },
      { latitude: 6.2315, longitude: -75.5910 }, // Parque Belén
      { latitude: 6.2330, longitude: -75.5975 }, // Los Molinos
      { latitude: 6.2335, longitude: -75.5840 }, // Rosales
      { latitude: 6.2385, longitude: -75.5732 }, // Exposiciones
      { latitude: 6.2442, longitude: -75.5736 }, // Alpujarra
      { latitude: 6.2465, longitude: -75.5682 }, // San Antonio
      { latitude: 6.2498, longitude: -75.5685 }, // Parque Berrío
      { latitude: 6.2380, longitude: -75.5735 },
      { latitude: 6.2320, longitude: -75.5905 },
      { latitude: 6.2170, longitude: -75.6040 },
    ],
    stops: [
      { id: "s-315-1", name: "Terminal Belén Rincón", coord: { latitude: 6.2170, longitude: -75.6040 }, type: "regular" },
      { id: "s-315-2", name: "Parque Principal de Belén", coord: { latitude: 6.2315, longitude: -75.5910 }, type: "regular" },
      { id: "s-315-3", name: "C.C. Los Molinos", coord: { latitude: 6.2330, longitude: -75.5975 }, type: "transfer" },
      { id: "s-315-4", name: "Estación Exposiciones Metro", coord: { latitude: 6.2385, longitude: -75.5732 }, type: "transfer" },
      { id: "s-315-5", name: "La Alpujarra", coord: { latitude: 6.2442, longitude: -75.5736 }, type: "transfer" },
    ]
  },
  {
    id: "route-190",
    code: "190",
    name: "Laureles 190",
    longName: "Los Colores - Estadio - Laureles Nutibara - Centro",
    company: "Conducciones Laureles",
    color: "#7C3AED", // Púrpura
    frequencyMinutes: 5,
    description: "Sector residencial y universitario de Laureles y Estadio.",
    coordinates: [
      { latitude: 6.2650, longitude: -75.5930 }, // Los Colores
      { latitude: 6.2600, longitude: -75.5920 }, // 4ta Brigada
      { latitude: 6.2550, longitude: -75.5910 }, // Estadio
      { latitude: 6.2480, longitude: -75.5940 }, // Av. Jardín
      { latitude: 6.2440, longitude: -75.5950 }, // 2do Parque
      { latitude: 6.2430, longitude: -75.5915 }, // 1er Parque
      { latitude: 6.2395, longitude: -75.5880 }, // Unicentro
      { latitude: 6.2480, longitude: -75.5800 },
      { latitude: 6.2440, longitude: -75.5735 }, // Alpujarra
      { latitude: 6.2500, longitude: -75.5680 }, // Parque Berrío
      { latitude: 6.2650, longitude: -75.5930 },
    ],
    stops: [
      { id: "s-190-1", name: "Los Colores", coord: { latitude: 6.2650, longitude: -75.5930 }, type: "regular" },
      { id: "s-190-2", name: "Estación Estadio Metro", coord: { latitude: 6.2550, longitude: -75.5910 }, type: "transfer" },
      { id: "s-190-3", name: "Segundo Parque Laureles", coord: { latitude: 6.2440, longitude: -75.5950 }, type: "regular" },
      { id: "s-190-4", name: "Primer Parque Laureles", coord: { latitude: 6.2430, longitude: -75.5915 }, type: "regular" },
      { id: "s-190-5", name: "Parque Berrío Centro", coord: { latitude: 6.2500, longitude: -75.5680 }, type: "transfer" },
    ]
  }
];

export const INITIAL_BUSES = [
  {
    id: "bus-304-1",
    routeId: "route-304",
    plate: "TPM-482",
    internalNumber: "348",
    driverName: "Carlos Mario Restrepo",
    occupancy: "low",
    passengers: 14,
    capacity: 40,
    speed: 36,
    stepIndex: 3,
    progressAlongSegment: 0.2,
    features: ["Aire Acondicionado", "Pago Cívica", "Rampa Accesible"],
    nextStop: "Cra 70 Gastronómica",
    etaMinutes: 3,
  },
  {
    id: "bus-304-2",
    routeId: "route-304",
    plate: "TSA-891",
    internalNumber: "109",
    driverName: "Jhon Alexander Henao",
    occupancy: "medium",
    passengers: 27,
    capacity: 40,
    speed: 31,
    stepIndex: 9,
    progressAlongSegment: 0.5,
    features: ["WiFi 5G Gratis", "Pago QR Bancolombia"],
    nextStop: "Alpujarra / Centro",
    etaMinutes: 2,
  },
  {
    id: "bus-130-1",
    routeId: "route-130",
    plate: "STN-719",
    internalNumber: "512",
    driverName: "Mateo Giraldo C.",
    occupancy: "high",
    passengers: 36,
    capacity: 40,
    speed: 42,
    stepIndex: 2,
    progressAlongSegment: 0.7,
    features: ["Aire Acondicionado", "Pago Cívica"],
    nextStop: "Parque Lleras",
    etaMinutes: 1,
  },
  {
    id: "bus-130-2",
    routeId: "route-130",
    plate: "WLC-230",
    internalNumber: "220",
    driverName: "Diego Andrés Vélez",
    occupancy: "low",
    passengers: 11,
    capacity: 40,
    speed: 28,
    stepIndex: 8,
    progressAlongSegment: 0.3,
    features: ["Piso Bajo Accesible", "GPS Satelital"],
    nextStop: "C.C. San Diego",
    etaMinutes: 4,
  },
  {
    id: "bus-315-1",
    routeId: "route-315",
    plate: "UPB-902",
    internalNumber: "044",
    driverName: "Andrés Felipe Luján",
    occupancy: "medium",
    passengers: 24,
    capacity: 40,
    speed: 34,
    stepIndex: 4,
    progressAlongSegment: 0.6,
    features: ["Pago Cívica", "Pantallas Info"],
    nextStop: "Estación Exposiciones Metro",
    etaMinutes: 3,
  },
  {
    id: "bus-190-1",
    routeId: "route-190",
    plate: "MKR-441",
    internalNumber: "781",
    driverName: "Sebastián Quintero",
    occupancy: "low",
    passengers: 9,
    capacity: 40,
    speed: 38,
    stepIndex: 3,
    progressAlongSegment: 0.4,
    features: ["Aire Acondicionado", "WiFi Gratis"],
    nextStop: "Segundo Parque Laureles",
    etaMinutes: 2,
  }
];
