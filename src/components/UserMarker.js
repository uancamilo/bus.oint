import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker, Circle } from 'react-native-maps';

/**
 * UserMarker
 * Marcador nativo del usuario con punto azul brillante, halo pulsante y radio de precisión.
 */
export default function UserMarker({ coordinate, accuracy = 45 }) {
  if (!coordinate) return null;

  return (
    <>
      <Circle
        center={coordinate}
        radius={accuracy}
        fillColor="rgba(37, 99, 235, 0.12)"
        strokeColor="rgba(37, 99, 235, 0.35)"
        strokeWidth={1}
      />
      <Marker
        coordinate={coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
      >
        <View style={styles.container}>
          <View style={styles.halo} />
          <View style={styles.dot}>
            <View style={styles.innerDot} />
          </View>
        </View>
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  innerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});

