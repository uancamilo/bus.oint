import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions, Platform } from 'react-native';
import MapView from 'react-native-maps';
import BusMarker from './BusMarker';
import RoutePolyline from './RoutePolyline';
import UserMarker from './UserMarker';
import {
  MEDELLIN_REGION,
  UBER_MAP_STYLE,
  UBER_DARK_MAP_STYLE,
} from '../data/mockRoutesData';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * MapComponent
 * Componente principal de mapa nativo optimizado para iOS (Apple Maps) y Android (Google Maps).
 */
export default function MapComponent({
  mapRef,
  buses,
  routes,
  selectedBus,
  selectedRouteId,
  isFollowing,
  userLocation,
  isDarkMode,
  onSelectBus,
}) {
  const activeRoute = routes.find((r) => r.id === selectedRouteId);

  // Filtrar buses visibles
  const visibleBuses = selectedRouteId
    ? buses.filter((b) => b.routeId === selectedRouteId)
    : buses;

  // Seguimiento suave del bus activo
  useEffect(() => {
    if (selectedBus && selectedBus.currentCoord && isFollowing && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: selectedBus.currentCoord,
          pitch: 15,
          heading: selectedBus.bearing || 0,
          zoom: 16,
        },
        { duration: 800 }
      );
    }
  }, [selectedBus, isFollowing]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={MEDELLIN_REGION}
        // En iOS usamos mutedStandard (estilo desaturado elegante tipo Uber)
        // En Android usamos el customMapStyle JSON de Google Maps
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle={isDarkMode ? 'dark' : 'light'}
        customMapStyle={
          Platform.OS === 'android'
            ? isDarkMode
              ? UBER_DARK_MAP_STYLE
              : UBER_MAP_STYLE
            : undefined
        }
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        showsUserLocation={false}
      >
        {/* Polilínea activa */}
        {activeRoute && <RoutePolyline route={activeRoute} />}

        {/* Si no hay ruta seleccionada pero hay un bus, mostrar su ruta */}
        {!activeRoute && selectedBus && (
          <RoutePolyline
            route={routes.find((r) => r.id === selectedBus.routeId)}
          />
        )}

        {/* Ubicación del usuario */}
        {userLocation && <UserMarker coordinate={userLocation} />}

        {/* Marcadores de Buses */}
        {visibleBuses.map((bus) => {
          const route = routes.find((r) => r.id === bus.routeId);
          const isSelected = selectedBus?.id === bus.id;

          return (
            <BusMarker
              key={bus.id}
              bus={bus}
              route={route}
              isSelected={isSelected}
              onSelect={onSelectBus}
            />
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  map: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    ...StyleSheet.absoluteFillObject,
  },
});
