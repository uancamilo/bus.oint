import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';

/**
 * FloatingSearch
 * Barra superior nativa con buscador por ruta o placa y selector horizontal de chips.
 */
export default function FloatingSearch({
  routes,
  selectedRouteId,
  onSelectRoute,
  onResetView,
  activeBusesCount,
  onSelectBus,
  buses,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Filtrado predictivo
  const filteredRoutes = routes.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const matchedBuses =
    searchTerm.trim().length > 1
      ? buses.filter(
          (b) =>
            b.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
            b.internalNumber.includes(searchTerm)
        )
      : [];

  return (
    <View style={styles.floatingContainer}>
      {/* Barra principal */}
      <View style={styles.searchCard}>
        <View style={styles.inputRow}>
          {/* Logo Badge */}
          <View style={styles.logoBadge}>
            <FontAwesome5 name="bus-alt" size={16} color="#FFFFFF" />
          </View>

          {/* Campo de búsqueda */}
          <View style={styles.inputWrapper}>
            <Ionicons name="search" size={16} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="¿A dónde vas? Busca ruta o placa..."
              placeholderTextColor="#9CA3AF"
              value={searchTerm}
              onChangeText={setSearchTerm}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            />
            {searchTerm.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchTerm('')}
                style={styles.clearBtn}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Botón de Recentrado */}
          <TouchableOpacity
            style={styles.compassBtn}
            onPress={onResetView}
            activeOpacity={0.7}
          >
            <Ionicons name="compass-outline" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        {/* Chips de filtro rápido por ruta */}
        <View style={styles.chipsRow}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{activeBusesCount} en vivo</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            <TouchableOpacity
              onPress={() => onSelectRoute(null)}
              style={[
                styles.chip,
                selectedRouteId === null ? styles.chipActive : styles.chipInactive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedRouteId === null && styles.chipTextActive,
                ]}
              >
                Todas
              </Text>
            </TouchableOpacity>

            {routes.map((route) => {
              const isSelected = selectedRouteId === route.id;
              return (
                <TouchableOpacity
                  key={route.id}
                  onPress={() => onSelectRoute(isSelected ? null : route.id)}
                  style={[
                    styles.chip,
                    isSelected
                      ? { backgroundColor: route.color }
                      : styles.chipInactive,
                  ]}
                >
                  <View
                    style={[
                      styles.routeColorDot,
                      { backgroundColor: isSelected ? '#FFFFFF' : route.color },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextActive,
                    ]}
                  >
                    {route.code}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Dropdown de coincidencias al escribir */}
      {searchTerm.length > 0 && isFocused && (
        <View style={styles.resultsCard}>
          {matchedBuses.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.sectionTitle}>Buses por placa</Text>
              {matchedBuses.map((bus) => (
                <TouchableOpacity
                  key={bus.id}
                  style={styles.resultItem}
                  onPress={() => {
                    onSelectBus(bus);
                    setSearchTerm('');
                    setIsFocused(false);
                  }}
                >
                  <View style={styles.resultItemLeft}>
                    <View style={styles.busBadgeMini}>
                      <Text style={styles.busBadgeMiniText}>{bus.internalNumber}</Text>
                    </View>
                    <View>
                      <Text style={styles.plateText}>{bus.plate}</Text>
                      <Text style={styles.nextStopText}>Próx: {bus.nextStop}</Text>
                    </View>
                  </View>
                  <Text style={styles.etaText}>{bus.etaMinutes} min</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>Rutas sugeridas</Text>
            {filteredRoutes.map((route) => (
              <TouchableOpacity
                key={route.id}
                style={styles.resultItem}
                onPress={() => {
                  onSelectRoute(route.id);
                  setSearchTerm('');
                  setIsFocused(false);
                }}
              >
                <View style={styles.resultItemLeft}>
                  <View
                    style={[
                      styles.routeBadgeSquare,
                      { backgroundColor: route.color },
                    ]}
                  >
                    <Text style={styles.routeBadgeSquareText}>{route.code}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeNameText}>{route.name}</Text>
                    <Text style={styles.routeDescText} numberOfLines={1}>
                      {route.longName}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 44,
    left: 16,
    right: 16,
    zIndex: 100,
  },
  searchCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 20,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    height: 38,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
  },
  clearBtn: {
    padding: 4,
  },
  compassBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 5,
  },
  chipActive: {
    backgroundColor: '#000000',
  },
  chipInactive: {
    backgroundColor: '#F3F4F6',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  routeColorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  resultsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 8,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 9,
    maxHeight: 240,
  },
  resultsSection: {
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  resultItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  busBadgeMini: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busBadgeMiniText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  plateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  nextStopText: {
    fontSize: 10,
    color: '#6B7280',
  },
  etaText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  routeBadgeSquare: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBadgeSquareText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  routeNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  routeDescText: {
    fontSize: 10,
    color: '#6B7280',
  },
});

