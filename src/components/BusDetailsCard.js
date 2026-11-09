import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * BusDetailsCard
 * Bottom sheet flotante estilo Uber con métricas en tiempo real,
 * botón de seguimiento y lista de paradas desplegable.
 */
export default function BusDetailsCard({
  bus,
  route,
  isFollowing,
  onToggleFollow,
  onClose,
}) {
  const [showStops, setShowStops] = useState(false);

  if (!bus || !route) return null;

  const occupancyConfig = {
    low: { label: 'Baja', color: '#10B981', percent: 35 },
    medium: { label: 'Media', color: '#F59E0B', percent: 65 },
    high: { label: 'Alta', color: '#EF4444', percent: 90 },
  }[bus.occupancy] || { label: 'Media', color: '#F59E0B', percent: 50 };

  return (
    <View style={styles.floatingContainer}>
      <View style={styles.card}>
        {/* Cabecera */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.routeBadge,
                { backgroundColor: route.color || '#2563EB' },
              ]}
            >
              <Text style={styles.routeBadgeText}>{route.code}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.routeName}>{route.name}</Text>
              <Text style={styles.routeSubtitle}>
                {route.company} • Bus #{bus.internalNumber}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.plateBadge}>
              <Text style={styles.plateText}>{bus.plate}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Próxima parada y ETA */}
        <View style={styles.etaContainer}>
          <View style={styles.etaLeft}>
            <View style={styles.pinIcon}>
              <Ionicons name="location-sharp" size={16} color="#2563EB" />
            </View>
            <View>
              <Text style={styles.etaSublabel}>PRÓXIMA PARADA</Text>
              <Text style={styles.etaStopName}>{bus.nextStop}</Text>
            </View>
          </View>
          <View style={styles.etaRight}>
            <View style={styles.etaNumberRow}>
              <Text style={styles.etaNumber}>{bus.etaMinutes}</Text>
              <Text style={styles.etaUnit}>min</Text>
            </View>
            <Text style={styles.etaStatus}>Aproximado</Text>
          </View>
        </View>

        {/* Métricas: Velocidad y Ocupación */}
        <View style={styles.metricsRow}>
          {/* Velocidad */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHeader}>
              <Ionicons name="speedometer-outline" size={14} color="#6B7280" />
              <Text style={styles.metricCardLabel}>Velocidad GPS</Text>
            </View>
            <Text style={styles.metricValue}>
              {bus.speed} <Text style={styles.metricUnit}>km/h</Text>
            </Text>
          </View>

          {/* Ocupación */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHeader}>
              <Ionicons name="people-outline" size={14} color="#6B7280" />
              <Text style={styles.metricCardLabel}>Ocupación</Text>
            </View>
            <View style={styles.occupancyHeader}>
              <Text style={styles.metricValue}>{occupancyConfig.label}</Text>
              <View
                style={[
                  styles.occupancyDotSmall,
                  { backgroundColor: occupancyConfig.color },
                ]}
              />
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${occupancyConfig.percent}%`,
                    backgroundColor: occupancyConfig.color,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Lista de paradas de la ruta desplegable */}
        {route.stops && route.stops.length > 0 && (
          <View style={styles.stopsDropdownSection}>
            <TouchableOpacity
              onPress={() => setShowStops(!showStops)}
              style={styles.stopsToggleBtn}
              activeOpacity={0.7}
            >
              <View style={styles.stopsToggleLeft}>
                <Ionicons name="git-commit-outline" size={15} color="#4B5563" />
                <Text style={styles.stopsToggleText}>
                  Recorrido y Paradas ({route.stops.length})
                </Text>
              </View>
              <Ionicons
                name={showStops ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#6B7280"
              />
            </TouchableOpacity>

            {showStops && (
              <ScrollView style={styles.stopsListScroll} nestedScrollEnabled={true}>
                {route.stops.map((stop, idx) => (
                  <View key={stop.id} style={styles.stopItem}>
                    <View
                      style={[
                        styles.stopTimelineDot,
                        {
                          backgroundColor:
                            stop.type === 'transfer' ? '#059669' : route.color,
                        },
                      ]}
                    />
                    <View style={styles.stopItemTextWrapper}>
                      <Text style={styles.stopNameText}>{stop.name}</Text>
                      {stop.type === 'transfer' && (
                        <Text style={styles.stopTransferText}>
                          Conexión con Metro de Medellín
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Botón de Seguimiento */}
        <TouchableOpacity
          onPress={onToggleFollow}
          activeOpacity={0.85}
          style={[
            styles.followButton,
            isFollowing ? styles.followButtonActive : styles.followButtonDefault,
          ]}
        >
          <Ionicons
            name={isFollowing ? 'eye' : 'navigate'}
            size={18}
            color="#FFFFFF"
          />
          <Text style={styles.followButtonText}>
            {isFollowing
              ? 'Siguiendo bus en vivo (Cámara bloqueada)'
              : 'Seguir bus en mapa'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    left: 16,
    right: 16,
    zIndex: 100,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    maxHeight: 460,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  routeBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  headerInfo: {
    flex: 1,
  },
  routeName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  routeSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  plateBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  plateText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#111827',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 10,
    marginVertical: 8,
  },
  etaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pinIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaSublabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  etaStopName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  etaRight: {
    alignItems: 'flex-end',
  },
  etaNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  etaNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2563EB',
  },
  etaUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    marginLeft: 2,
  },
  etaStatus: {
    fontSize: 9,
    color: '#9CA3AF',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 8,
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  metricCardLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  occupancyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  occupancyDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  stopsDropdownSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
  },
  stopsToggleBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stopsToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stopsToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  stopsListScroll: {
    maxHeight: 110,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 6,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  stopTimelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stopItemTextWrapper: {
    flex: 1,
  },
  stopNameText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
  },
  stopTransferText: {
    fontSize: 9,
    color: '#059669',
    fontWeight: '700',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
  },
  followButtonDefault: {
    backgroundColor: '#000000',
  },
  followButtonActive: {
    backgroundColor: '#2563EB',
  },
  followButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
