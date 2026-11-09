import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';

/**
 * BusMarker
 * Marcador nativo para React Native Maps con rotación de rumbo (bearing),
 * badge de código de ruta e indicador de ocupación.
 */
export default function BusMarker({ bus, route, isSelected, onSelect }) {
  if (
    !bus?.currentCoord ||
    typeof bus.currentCoord.latitude !== 'number' ||
    typeof bus.currentCoord.longitude !== 'number'
  ) {
    return null;
  }

  const routeColor = route?.color || '#2563EB';
  const bearing = bus.bearing || 0;

  const occupancyColor =
    bus.occupancy === 'low'
      ? '#10B981'
      : bus.occupancy === 'medium'
      ? '#F59E0B'
      : '#EF4444';

  return (
    <Marker
      coordinate={bus.currentCoord}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={() => onSelect(bus)}
      tracksViewChanges={true}
    >
      <View style={styles.container}>
        {/* Halo de selección */}
        {isSelected && (
          <View
            style={[
              styles.selectedRing,
              { borderColor: routeColor, backgroundColor: `${routeColor}25` },
            ]}
          />
        )}

        {/* Indicador de Rumbo / Dirección con ícono nativo */}
        <View
          style={[
            styles.bearingContainer,
            { transform: [{ rotate: `${bearing}deg` }] },
          ]}
        >
          <Ionicons
            name="caret-up"
            size={13}
            color={routeColor}
            style={styles.bearingCaret}
          />
        </View>

        {/* Cuerpo del marcador estilo Uber */}
        <View style={[styles.markerBody, isSelected && styles.markerBodySelected]}>
          <FontAwesome5 name="bus" size={13} color="#FFFFFF" />
          <Text style={[styles.codeText, { color: routeColor }]}>
            {route?.code || bus.routeId}
          </Text>
        </View>

        {/* Punto de ocupación */}
        <View
          style={[
            styles.occupancyDot,
            { backgroundColor: occupancyColor },
          ]}
        />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
  },
  bearingContainer: {
    position: 'absolute',
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  bearingCaret: {
    marginTop: -3,
  },
  markerBody: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#121212',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  markerBodySelected: {
    borderWidth: 2.5,
    transform: [{ scale: 1.08 }],
  },
  codeText: {
    fontSize: 9,
    fontWeight: '900',
    marginTop: -1,
  },
  occupancyDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
