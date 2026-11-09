import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import MapComponent from './src/components/MapComponent';
import FloatingSearch from './src/components/FloatingSearch';
import BusDetailsCard from './src/components/BusDetailsCard';
import {
  MOCK_ROUTES,
  INITIAL_BUSES,
  calculateBearing,
  MEDELLIN_REGION,
  DEFAULT_USER_LOCATION,
} from './src/data/mockRoutesData';

// Helper de interpolación lineal nativa
function interpolate(p1, p2, t) {
  return {
    latitude: p1.latitude + (p2.latitude - p1.latitude) * t,
    longitude: p1.longitude + (p2.longitude - p1.longitude) * t,
  };
}

export default function App() {
  const mapRef = useRef(null);
  const [routes] = useState(MOCK_ROUTES);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userLocation, setUserLocation] = useState(DEFAULT_USER_LOCATION);

  // Solicitar permiso de ubicación y obtener geolocalización
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch (err) {
        // En caso de denegación o emulador, se mantiene DEFAULT_USER_LOCATION (Medellín)
      }
    })();
  }, []);

  // Inicializar estado de buses con sus coordenadas de segmento
  const [buses, setBuses] = useState(() => {
    return INITIAL_BUSES.map((bus) => {
      const route = MOCK_ROUTES.find((r) => r.id === bus.routeId);
      const coords = route?.coordinates || [];
      const currentSegment = bus.stepIndex % (coords.length - 1);
      const nextSegment = (currentSegment + 1) % coords.length;
      const p1 = coords[currentSegment];
      const p2 = coords[nextSegment];
      const currentCoord = interpolate(p1, p2, bus.progressAlongSegment || 0);
      const bearing = calculateBearing(
        p1.latitude,
        p1.longitude,
        p2.latitude,
        p2.longitude
      );

      return {
        ...bus,
        currentCoord,
        bearing,
      };
    });
  });

  // Bucle de telemetría GPS en tiempo real
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setBuses((prevBuses) => {
        return prevBuses.map((bus) => {
          const route = routes.find((r) => r.id === bus.routeId);
          if (!route) return bus;

          const coords = route.coordinates;
          const totalPoints = coords.length;

          // Incremento proporcional a velocidad
          const stepDelta = 0.08 * (bus.speed / 35) * speedMultiplier;
          let newProgress = bus.progressAlongSegment + stepDelta;
          let newStepIndex = bus.stepIndex;

          if (newProgress >= 1.0) {
            newProgress = 0;
            newStepIndex = (newStepIndex + 1) % (totalPoints - 1);
          }

          const p1 = coords[newStepIndex];
          const p2 = coords[(newStepIndex + 1) % totalPoints];

          const currentCoord = interpolate(p1, p2, newProgress);
          const bearing = calculateBearing(
            p1.latitude,
            p1.longitude,
            p2.latitude,
            p2.longitude
          );

          // Variación sutil de velocidad
          const speedVariance = (Math.random() - 0.5) * 1.5;
          const newSpeed = Math.max(20, Math.min(50, Math.round(bus.speed + speedVariance)));
          const etaRemaining = Math.max(1, Math.round(4 - newProgress * 2.5));

          return {
            ...bus,
            stepIndex: newStepIndex,
            progressAlongSegment: newProgress,
            currentCoord,
            bearing,
            speed: newSpeed,
            etaMinutes: etaRemaining,
          };
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [routes, isPaused, speedMultiplier]);

  const selectedBus = buses.find((b) => b.id === selectedBusId) || null;
  const selectedBusRoute = selectedBus
    ? routes.find((r) => r.id === selectedBus.routeId)
    : null;

  // Seleccionar bus
  const handleSelectBus = useCallback((bus) => {
    setSelectedBusId(bus.id);
    setSelectedRouteId(bus.routeId);

    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: bus.currentCoord.latitude,
          longitude: bus.currentCoord.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        800
      );
    }
  }, []);

  // Recentrar vista al Valle de Aburrá o Ubicación del usuario
  const handleResetView = useCallback(() => {
    setSelectedBusId(null);
    setIsFollowing(false);
    if (mapRef.current) {
      if (userLocation) {
        mapRef.current.animateToRegion(
          {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.035,
            longitudeDelta: 0.035,
          },
          1000
        );
      } else {
        mapRef.current.animateToRegion(MEDELLIN_REGION, 1000);
      }
    }
  }, [userLocation]);

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        {/* 1. Mapa React Native Maps */}
        <MapComponent
          mapRef={mapRef}
          buses={buses}
          routes={routes}
          selectedBus={selectedBus}
          selectedRouteId={selectedRouteId}
          isFollowing={isFollowing}
          userLocation={userLocation}
          isDarkMode={isDarkMode}
          onSelectBus={handleSelectBus}
        />

        {/* 2. Barra de Búsqueda Flotante */}
        <FloatingSearch
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          onResetView={handleResetView}
          activeBusesCount={buses.length}
          onSelectBus={handleSelectBus}
          buses={buses}
        />

        {/* 3. Bottom Sheet de Detalles del Bus */}
        <BusDetailsCard
          bus={selectedBus}
          route={selectedBusRoute}
          isFollowing={isFollowing}
          onToggleFollow={() => setIsFollowing((prev) => !prev)}
          onClose={() => {
            setSelectedBusId(null);
            setIsFollowing(false);
          }}
        />

        {/* 4. Controles laterales flotantes (Pausa, Velocidad y Modo Oscuro) */}
        <View style={styles.sideControls}>
          {/* Modo Oscuro Uber Black */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => setIsDarkMode(!isDarkMode)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isDarkMode ? 'sunny' : 'moon'}
              size={18}
              color={isDarkMode ? '#FBBF24' : '#111827'}
            />
          </TouchableOpacity>

          {/* Pausa / Play */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => setIsPaused(!isPaused)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isPaused ? 'play' : 'pause'}
              size={18}
              color={isPaused ? '#EF4444' : '#111827'}
            />
          </TouchableOpacity>

          {/* Velocidad */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() =>
              setSpeedMultiplier((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : 1))
            }
            activeOpacity={0.8}
          >
            <Text style={styles.speedText}>{speedMultiplier}x</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sideControls: {
    position: 'absolute',
    right: 16,
    top: Platform.OS === 'ios' ? 140 : 130,
    gap: 8,
    zIndex: 90,
  },
  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  speedText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
  },
});
