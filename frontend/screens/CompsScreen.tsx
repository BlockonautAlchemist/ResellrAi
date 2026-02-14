import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Linking,
} from 'react-native';
import {
  getEbayComps,
  ApiRequestError,
  type EbayCompsResult,
  type EbayCompItem,
  type CompsFilters,
  type GenerateListingResponse,
} from '../lib/api';
import { colors, spacing, typography, radii } from '../lib/theme';
import { ScreenContainer, PrimaryButton, LoadingState, Card } from '../components/ui';

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
  const [showConnectEbayCta, setShowConnectEbayCta] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<CompsFilters['condition']>(undefined);

  const fetchComps = useCallback(async (query: string, condition?: CompsFilters['condition']) => {
    setError(null);
    setShowConnectEbayCta(false);
    try {
      const filters: CompsFilters = {
        categoryId,
        condition,
      };
      const result = await getEbayComps(query, filters);
      setCompsResult(result);
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        err.status === 401 &&
        err.code === 'ebay_not_connected'
      ) {
        setError('Connect your eBay account to view price comparables.');
        setShowConnectEbayCta(true);
        return;
      }
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
        return colors.success;
      case 'medium':
        return colors.warning;
      case 'low':
        return colors.error;
      default:
        return colors.textMuted;
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
        <Card>
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
        </Card>
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
        <View style={styles.useMedianContainer}>
          <PrimaryButton
            title={`Use Median Price ($${compsResult.stats.median.toFixed(2)})`}
            onPress={() => handleUsePrice(compsResult.stats.median!)}
            variant="success"
          />
        </View>
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
          <View style={styles.retryContainer}>
            <PrimaryButton title="Retry" onPress={handleRefresh} size="sm" />
          </View>
          {showConnectEbayCta && (
            <View style={styles.retryContainer}>
              <PrimaryButton
                title="Connect eBay"
                onPress={() => navigation.navigate('Account')}
                size="sm"
                variant="ebay"
              />
            </View>
          )}
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
    return <LoadingState message="Finding comparable listings..." />;
  }

  return (
    <ScreenContainer edges={[]} noPadding>
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xxl,
  },
  disclaimerBanner: {
    backgroundColor: colors.warningLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  disclaimerText: {
    fontSize: typography.sizes.md,
    color: colors.warningDark,
    textAlign: 'center',
    fontWeight: typography.weights.medium,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typography.sizes.input,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: colors.textInverse,
    fontWeight: typography.weights.semibold,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: typography.sizes.body,
    color: colors.text,
  },
  filterChipTextActive: {
    color: colors.textInverse,
    fontWeight: typography.weights.semibold,
  },
  statsMain: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statsLabel: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  statsMedian: {
    fontSize: typography.sizes.hero,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  statsMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sampleSize: {
    fontSize: typography.sizes.md,
    color: colors.textTertiary,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
  },
  confidenceText: {
    color: colors.textInverse,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
  cacheInfo: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  limitationsContainer: {
    backgroundColor: colors.surfaceTertiary,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  limitationText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  useMedianContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  resultsHeader: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    color: colors.textTertiary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  compItem: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row',
  },
  compImage: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
  },
  compContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  compTitle: {
    fontSize: typography.sizes.body,
    color: colors.text,
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  compDetails: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  compPrice: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
  },
  compShipping: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  compMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  conditionBadge: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 2,
    borderRadius: radii.sm - 2,
  },
  conditionText: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  sellerInfo: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },
  compActions: {
    justifyContent: 'center',
    gap: spacing.sm - 2,
  },
  usePriceButton: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radii.sm,
  },
  usePriceText: {
    color: colors.textInverse,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  viewButton: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radii.sm,
  },
  viewButtonText: {
    color: colors.textTertiary,
    fontSize: typography.sizes.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryContainer: {
    marginTop: spacing.lg,
  },
});
