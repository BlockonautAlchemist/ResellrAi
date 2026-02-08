import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import {
  getEbayComps,
  type EbayCompsResult,
  type EbayCompItem,
  type CompsFilters,
  type GenerateListingResponse,
} from '../lib/api';

interface CompsScreenProps {
  navigation: any;
  route: {
    params: {
      keywords: string;
      categoryId?: string;
      listing?: GenerateListingResponse;
    };
  };
}

const CONDITIONS = [
  { label: 'All', value: undefined },
  { label: 'New', value: 'NEW' as const },
  { label: 'Like New', value: 'LIKE_NEW' as const },
  { label: 'Very Good', value: 'VERY_GOOD' as const },
  { label: 'Good', value: 'GOOD' as const },
];

export default function CompsScreen({ navigation, route }: CompsScreenProps) {
  const { keywords: initialKeywords, categoryId } = route.params;

  const [keywords, setKeywords] = useState(initialKeywords);
  const [searchQuery, setSearchQuery] = useState(initialKeywords);
  const [compsResult, setCompsResult] = useState<EbayCompsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<CompsFilters['condition']>(undefined);

  const fetchComps = useCallback(async (query: string, condition?: CompsFilters['condition']) => {
    setError(null);
    try {
      const filters: CompsFilters = {
        categoryId,
        condition,
      };
      const result = await getEbayComps(query, filters);
      setCompsResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparables');
    }
  }, [categoryId]);

  useEffect(() => {
    const loadComps = async () => {
      setIsLoading(true);
      await fetchComps(keywords, selectedCondition);
      setIsLoading(false);
    };
    loadComps();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchComps(keywords, selectedCondition);
    setIsRefreshing(false);
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length === 0) return;
    setKeywords(searchQuery);
    setIsLoading(true);
    await fetchComps(searchQuery, selectedCondition);
    setIsLoading(false);
  };

  const handleConditionChange = async (condition: CompsFilters['condition']) => {
    setSelectedCondition(condition);
    setIsLoading(true);
    await fetchComps(keywords, condition);
    setIsLoading(false);
  };

  const handleUsePrice = (price: number) => {
    navigation.navigate('Preview', {
      listing: route.params.listing,
      selectedPriceFromComps: price,
    });
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return '#34C759';
      case 'medium':
        return '#FF9500';
      case 'low':
        return '#FF3B30';
      default:
        return '#999';
    }
  };

  const renderCompItem = ({ item }: { item: EbayCompItem }) => (
    <View style={styles.compItem}>
      <Image
        source={{ uri: item.image_url || 'https://via.placeholder.com/60' }}
        style={styles.compImage}
      />
      <View style={styles.compContent}>
        <Text style={styles.compTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.compDetails}>
          <Text style={styles.compPrice}>${item.total_cost.toFixed(2)}</Text>
          {item.shipping_cost > 0 && (
            <Text style={styles.compShipping}>
              (${item.price.value.toFixed(2)} + ${item.shipping_cost.toFixed(2)} ship)
            </Text>
          )}
        </View>
        <View style={styles.compMeta}>
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>{item.condition}</Text>
          </View>
          {item.seller && (
            <Text style={styles.sellerInfo}>
              {item.seller.username}
              {item.seller.feedback_score && ` (${item.seller.feedback_score})`}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.compActions}>
        <TouchableOpacity
          style={styles.usePriceButton}
          onPress={() => handleUsePrice(item.total_cost)}
        >
          <Text style={styles.usePriceText}>Use</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => Linking.openURL(item.item_url)}
        >
          <Text style={styles.viewButtonText}>View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View>
      {/* Disclaimer */}
      <View style={styles.disclaimerBanner}>
        <Text style={styles.disclaimerText}>
          Active listings (not sold prices)
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Refine search..."
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Condition Filters */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={CONDITIONS}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedCondition === item.value && styles.filterChipActive,
              ]}
              onPress={() => handleConditionChange(item.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCondition === item.value && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.label}
        />
      </View>

      {/* Stats Card */}
      {compsResult && compsResult.stats.sample_size > 0 && (
        <View style={styles.statsCard}>
          <View style={styles.statsMain}>
            <Text style={styles.statsLabel}>Median Price</Text>
            <Text style={styles.statsMedian}>
              ${compsResult.stats.median?.toFixed(2) || '—'}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Average</Text>
              <Text style={styles.statValue}>
                ${compsResult.stats.average?.toFixed(2) || '—'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Min</Text>
              <Text style={styles.statValue}>
                ${compsResult.stats.min?.toFixed(2) || '—'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Max</Text>
              <Text style={styles.statValue}>
                ${compsResult.stats.max?.toFixed(2) || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.statsMeta}>
            <Text style={styles.sampleSize}>
              {compsResult.stats.sample_size} listings
            </Text>
            <View
              style={[
                styles.confidenceBadge,
                { backgroundColor: getConfidenceColor(compsResult.stats.confidence) },
              ]}
            >
              <Text style={styles.confidenceText}>
                {compsResult.stats.confidence.toUpperCase()}
              </Text>
            </View>
          </View>
          {compsResult.cached && (
            <Text style={styles.cacheInfo}>
              Cached {compsResult.cache_age ? `${Math.floor(compsResult.cache_age / 60)}m ago` : ''}
            </Text>
          )}
        </View>
      )}

      {/* Limitations */}
      {compsResult && compsResult.limitations.length > 0 && (
        <View style={styles.limitationsContainer}>
          {compsResult.limitations.map((limitation, index) => (
            <Text key={index} style={styles.limitationText}>
              {limitation}
            </Text>
          ))}
        </View>
      )}

      {/* Use Median Button */}
      {compsResult && compsResult.stats.median && (
        <TouchableOpacity
          style={styles.useMedianButton}
          onPress={() => handleUsePrice(compsResult.stats.median!)}
        >
          <Text style={styles.useMedianText}>
            Use Median Price (${compsResult.stats.median.toFixed(2)})
          </Text>
        </TouchableOpacity>
      )}

      {/* Results Header */}
      <Text style={styles.resultsHeader}>
        {compsResult ? `${compsResult.data.length} Comparable Listings` : 'Loading...'}
      </Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {error ? (
        <>
          <Text style={styles.emptyTitle}>Error Loading Comps</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.emptyTitle}>No Comparables Found</Text>
          <Text style={styles.emptyText}>
            Try adjusting your search terms or removing filters.
          </Text>
        </>
      )}
    </View>
  );

  if (isLoading && !compsResult) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Finding comparable listings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={compsResult?.data.slice(0, 10) || []}
        renderItem={renderCompItem}
        keyExtractor={(item) => item.item_id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    paddingBottom: 24,
  },
  disclaimerBanner: {
    backgroundColor: '#FFF3CD',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#856404',
    textAlign: 'center',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterChip: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 14,
    color: '#333',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  statsMain: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statsLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  statsMedian: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statsMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sampleSize: {
    fontSize: 13,
    color: '#666',
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cacheInfo: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  limitationsContainer: {
    backgroundColor: '#f9f9f9',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  limitationText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  useMedianButton: {
    backgroundColor: '#34C759',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  useMedianText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 8,
  },
  compItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
  },
  compImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  compContent: {
    flex: 1,
    marginLeft: 12,
  },
  compTitle: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
    lineHeight: 18,
  },
  compDetails: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  compPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  compShipping: {
    fontSize: 11,
    color: '#999',
    marginLeft: 4,
  },
  compMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conditionBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  conditionText: {
    fontSize: 10,
    color: '#666',
  },
  sellerInfo: {
    fontSize: 11,
    color: '#999',
  },
  compActions: {
    justifyContent: 'center',
    gap: 6,
  },
  usePriceButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  usePriceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  viewButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewButtonText: {
    color: '#666',
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
