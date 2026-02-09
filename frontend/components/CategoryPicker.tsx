import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { suggestCategory, type CategorySuggestion, type AiCategorySuggestion } from '../lib/api';
import { colors, spacing, typography, radii } from '../lib/theme';

interface CategoryPickerProps {
  value?: {
    categoryId: string;
    categoryName: string;
    categoryTreeId: string;
  };
  suggestedQuery?: string;
  onChange: (category: { categoryId: string; categoryName: string; categoryTreeId: string }) => void;
  aiSuggestion?: {
    primary: AiCategorySuggestion;
    alternatives: AiCategorySuggestion[];
  };
  isLoadingAi?: boolean;
}

export default function CategoryPicker({
  value,
  suggestedQuery,
  onChange,
  aiSuggestion,
  isLoadingAi,
}: CategoryPickerProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial suggestions when modal opens
  useEffect(() => {
    if (isModalVisible && suggestedQuery && suggestions.length === 0) {
      handleSearch(suggestedQuery);
      setSearchQuery(suggestedQuery);
    }
  }, [isModalVisible, suggestedQuery]);

  const handleSearch = async (query: string) => {
    if (query.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await suggestCategory(query);
      setSuggestions(result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCategory = (category: CategorySuggestion) => {
    onChange({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categoryTreeId: '0', // EBAY_US default, v1 single-marketplace
    });
    setIsModalVisible(false);
  };

  const handleSelectAiAlternative = (alt: AiCategorySuggestion) => {
    onChange({
      categoryId: alt.categoryId,
      categoryName: alt.categoryName,
      categoryTreeId: alt.categoryTreeId,
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return colors.success;
    if (confidence >= 0.5) return colors.warning;
    return colors.error;
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  };

  const getRelevanceColor = (relevance: string) => {
    switch (relevance) {
      case 'HIGH':
        return colors.success;
      case 'MEDIUM':
        return colors.warning;
      case 'LOW':
        return colors.textMuted;
      default:
        return colors.textMuted;
    }
  };

  const renderCategoryItem = ({ item }: { item: CategorySuggestion }) => (
    <TouchableOpacity
      style={[
        styles.categoryItem,
        value?.categoryId === item.categoryId && styles.categoryItemSelected,
      ]}
      onPress={() => handleSelectCategory(item)}
    >
      <View style={styles.categoryContent}>
        <Text style={styles.categoryName}>{item.categoryName}</Text>
        <Text style={styles.categoryPath}>{item.categoryPath.join(' > ')}</Text>
      </View>
      <View style={styles.categoryMeta}>
        <View
          style={[
            styles.relevanceBadge,
            { backgroundColor: getRelevanceColor(item.relevance) },
          ]}
        >
          <Text style={styles.relevanceText}>{item.relevance}</Text>
        </View>
        {value?.categoryId === item.categoryId && (
          <Text style={styles.checkmark}>✓</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  // AI-first display mode
  const showAiMode = !!aiSuggestion || isLoadingAi;

  return (
    <>
      {/* Category Display */}
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.label}>Category</Text>
          {!isLoadingAi && (
            <TouchableOpacity onPress={() => setIsModalVisible(true)}>
              <Text style={styles.changeButton}>
                {showAiMode ? 'Change category' : 'Change'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoadingAi ? (
          <View style={styles.aiLoadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.aiLoadingText}>AI selecting category...</Text>
          </View>
        ) : aiSuggestion && value ? (
          <View>
            {/* Primary AI selection */}
            <View style={styles.aiPrimaryRow}>
              <View style={styles.aiPrimaryInfo}>
                <Text style={styles.categoryValue}>{value.categoryName}</Text>
                <Text style={styles.categoryId}>ID: {value.categoryId}</Text>
              </View>
              <View
                style={[
                  styles.confidenceBadge,
                  { backgroundColor: getConfidenceColor(aiSuggestion.primary.confidence) },
                ]}
              >
                <Text style={styles.confidenceText}>
                  {getConfidenceLabel(aiSuggestion.primary.confidence)}
                </Text>
              </View>
            </View>
            <Text style={styles.aiReason}>{aiSuggestion.primary.reason}</Text>

            {/* Alternatives */}
            {aiSuggestion.alternatives.length > 0 && (
              <View style={styles.alternativesContainer}>
                <Text style={styles.alternativesLabel}>Other options:</Text>
                {aiSuggestion.alternatives.map((alt) => (
                  <TouchableOpacity
                    key={alt.categoryId}
                    style={[
                      styles.alternativeItem,
                      value.categoryId === alt.categoryId && styles.alternativeItemSelected,
                    ]}
                    onPress={() => handleSelectAiAlternative(alt)}
                  >
                    <Text style={styles.alternativeName}>{alt.categoryName}</Text>
                    <View
                      style={[
                        styles.confidenceBadgeSmall,
                        { backgroundColor: getConfidenceColor(alt.confidence) },
                      ]}
                    >
                      <Text style={styles.confidenceTextSmall}>
                        {Math.round(alt.confidence * 100)}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.valueContainer}
            onPress={() => setIsModalVisible(true)}
          >
            {value ? (
              <>
                <Text style={styles.categoryValue}>{value.categoryName}</Text>
                <Text style={styles.categoryId}>ID: {value.categoryId}</Text>
              </>
            ) : (
              <Text style={styles.placeholder}>Select a category...</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Category Selection Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <TouchableOpacity onPress={() => setIsModalVisible(false)}>
              <Text style={styles.modalDone}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                // Debounce search
                const timeout = setTimeout(() => handleSearch(text), 300);
                return () => clearTimeout(timeout);
              }}
              placeholder="Search categories..."
              returnKeyType="search"
              onSubmitEditing={() => handleSearch(searchQuery)}
            />
          </View>

          {/* Loading State */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Searching categories...</Text>
            </View>
          )}

          {/* Error State */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Suggestions List */}
          <FlatList
            data={suggestions}
            renderItem={renderCategoryItem}
            keyExtractor={(item) => item.categoryId}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              !isLoading && searchQuery.length > 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No categories found. Try different search terms.
                  </Text>
                </View>
              ) : !isLoading ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    Enter keywords to search for categories.
                  </Text>
                </View>
              ) : null
            }
          />

          {/* Tip */}
          <View style={styles.tipContainer}>
            <Text style={styles.tipText}>
              Tip: Use specific product names for better category matches
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  changeButton: {
    color: colors.primary,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
  },
  valueContainer: {
    paddingVertical: spacing.sm,
  },
  categoryValue: {
    fontSize: typography.sizes.input,
    color: colors.text,
    marginBottom: 2,
  },
  categoryId: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  placeholder: {
    fontSize: typography.sizes.input,
    color: colors.textMuted,
  },
  // AI mode styles
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  aiLoadingText: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
  },
  aiPrimaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  aiPrimaryInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
  },
  confidenceText: {
    color: colors.textInverse,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  aiReason: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  alternativesContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  alternativesLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  alternativeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceTertiary,
  },
  alternativeItemSelected: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  alternativeName: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    flex: 1,
  },
  confidenceBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.md,
    marginLeft: spacing.sm,
  },
  confidenceTextSmall: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: typography.weights.semibold,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  modalDone: {
    fontSize: typography.sizes.button,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  searchContainer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  searchInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typography.sizes.input,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textTertiary,
    fontSize: typography.sizes.body,
  },
  errorContainer: {
    padding: spacing.lg,
    backgroundColor: colors.errorLight,
    marginHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.sizes.body,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.lg,
  },
  categoryItem: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryItemSelected: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    fontSize: typography.sizes.input,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  categoryPath: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
  },
  categoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  relevanceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 10,
  },
  relevanceText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: typography.weights.semibold,
  },
  checkmark: {
    fontSize: typography.sizes.button,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: spacing.xxxl,
  },
  emptyText: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  tipContainer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tipText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
