import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Polyline, Marker } from 'react-native-maps';

/**
 * RoutePolyline
 * Traza la polilínea en React Native Maps y dibuja las paradas con íconos nativos.
 */
export default function RoutePolyline({ route }) {
  if (!route) return null;

  return (
    <>
      {/* Sombra ancha de fondo estilo glow */}
      <Polyline
        coordinates={route.coordinates}
        strokeColor={`${route.color}40`}
        strokeWidth={8}
        lineCap="round"
        lineJoin="round"
      />

      {/* Línea principal vibrante */}
      <Polyline
        coordinates={route.coordinates}
        strokeColor={route.color}
        strokeWidth={4.5}
        lineCap="round"
        lineJoin="round"
      />

      {/* Paradas de la ruta */}
      {route.stops &&
        route.stops.map((stop) => {
          const isTransfer = stop.type === 'transfer';

          return (
            <Marker
              key={stop.id}
              coordinate={stop.coord}
              anchor={{ x: 0.5, y: 0.5 }}
              title={stop.name}
              description={isTransfer ? 'Conexión con Metro de Medellín' : 'Parada de bus'}
              tracksViewChanges={false}
            >
              {isTransfer ? (
                <View style={styles.transferMarker}>
                  <Text style={styles.transferText}>M</Text>
                </View>
              ) : (
                <View style={styles.regularMarker}>
                  <View style={styles.regularInner} />
                </View>
              )}
            </Marker>
          );
        })}
    </>
  );
}

const styles = StyleSheet.create({
  transferMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#059669',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  transferText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  regularMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  regularInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1F2937',
  },
});

