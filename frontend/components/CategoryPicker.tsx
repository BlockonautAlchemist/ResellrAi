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
import { TEMP_USER_ID } from '../lib/constants';

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
      const result = await suggestCategory(query, TEMP_USER_ID);
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
    if (confidence >= 0.8) return '#34C759';
    if (confidence >= 0.5) return '#FF9500';
    return '#FF3B30';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  };

  const getRelevanceColor = (relevance: string) => {
    switch (relevance) {
      case 'HIGH':
        return '#34C759';
      case 'MEDIUM':
        return '#FF9500';
      case 'LOW':
        return '#999';
      default:
        return '#999';
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
            <ActivityIndicator size="small" color="#007AFF" />
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
              <ActivityIndicator size="small" color="#007AFF" />
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
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  changeButton: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  valueContainer: {
    paddingVertical: 8,
  },
  categoryValue: {
    fontSize: 15,
    color: '#333',
    marginBottom: 2,
  },
  categoryId: {
    fontSize: 12,
    color: '#999',
  },
  placeholder: {
    fontSize: 15,
    color: '#999',
  },
  // AI mode styles
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  aiLoadingText: {
    fontSize: 14,
    color: '#666',
  },
  aiPrimaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  aiPrimaryInfo: {
    flex: 1,
    marginRight: 8,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  aiReason: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  alternativesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  alternativesLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  alternativeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 4,
    backgroundColor: '#f9f9f9',
  },
  alternativeItemSelected: {
    backgroundColor: '#E8F4FD',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  alternativeName: {
    fontSize: 13,
    color: '#555',
    flex: 1,
  },
  confidenceBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  confidenceTextSmall: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalDone: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#FFE5E5',
    marginHorizontal: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  categoryItem: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryItemSelected: {
    backgroundColor: '#E8F4FD',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  categoryPath: {
    fontSize: 12,
    color: '#666',
  },
  categoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  relevanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  relevanceText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  tipContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  tipText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
