import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import {
  regenerateField,
  updateListing,
  getCategoryConditions,
  type GenerateListingResponse,
  type CategoryCondition,
} from '../lib/api';
import CategoryPicker from '../components/CategoryPicker';
import { TEMP_USER_ID } from '../lib/constants';

// Default condition options (used before category is selected or if API fails)
const DEFAULT_CONDITION_OPTIONS: CategoryCondition[] = [
  { id: '1000', label: 'New', apiEnum: 'NEW' },
  { id: '2750', label: 'Like New', apiEnum: 'LIKE_NEW' },
  { id: '3000', label: 'Used - Excellent', apiEnum: 'USED_EXCELLENT' },
  { id: '4000', label: 'Used - Very Good', apiEnum: 'USED_VERY_GOOD' },
  { id: '5000', label: 'Used - Good', apiEnum: 'USED_GOOD' },
  { id: '6000', label: 'Used - Acceptable', apiEnum: 'USED_ACCEPTABLE' },
  { id: '7000', label: 'For Parts / Not Working', apiEnum: 'FOR_PARTS_OR_NOT_WORKING' },
];

interface PreviewScreenProps {
  navigation: any;
  route: {
    params?: {
      listing?: GenerateListingResponse;
      selectedPriceFromComps?: number;
    };
  };
}

export default function ListingPreviewScreen({ navigation, route }: PreviewScreenProps) {
  const initialListing = route?.params?.listing;
  const selectedPriceFromComps = route?.params?.selectedPriceFromComps;

  const [title, setTitle] = useState(initialListing.listingDraft.title.value);
  const [description, setDescription] = useState(initialListing.listingDraft.description.value);
  const [selectedPrice, setSelectedPrice] = useState(initialListing.pricingSuggestion.midPrice);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<{
    categoryId: string;
    categoryName: string;
  } | undefined>(
    initialListing.listingDraft.category.platformCategoryId
      ? {
          categoryId: initialListing.listingDraft.category.platformCategoryId,
          categoryName: initialListing.listingDraft.category.value,
        }
      : undefined
  );
  const [selectedCondition, setSelectedCondition] = useState(
    initialListing.listingDraft.condition?.value || 'USED_GOOD'
  );
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [isUpdatingCondition, setIsUpdatingCondition] = useState(false);
  const [availableConditions, setAvailableConditions] = useState<CategoryCondition[]>(DEFAULT_CONDITION_OPTIONS);
  const [isLoadingConditions, setIsLoadingConditions] = useState(false);
  const [conditionsError, setConditionsError] = useState<string | null>(null);

  const pricing = initialListing?.pricingSuggestion;

  // Guard: show fallback UI if no listing data
  if (!initialListing) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 16, color: '#666', marginBottom: 16, textAlign: 'center' }}>
            No listing data available
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Apply price selected from comps screen
  useEffect(() => {
    if (selectedPriceFromComps !== undefined) {
      setSelectedPrice(selectedPriceFromComps);
    }
  }, [selectedPriceFromComps]);

  // Fetch valid conditions when category changes
  useEffect(() => {
    if (!selectedCategory?.categoryId) {
      // No category selected - use default conditions
      setAvailableConditions(DEFAULT_CONDITION_OPTIONS);
      setConditionsError(null);
      return;
    }

    // Capture values for use in async function
    const categoryId = selectedCategory.categoryId;
    const itemId = initialListing?.itemId;
    let isCancelled = false;

    async function fetchConditions() {
      setIsLoadingConditions(true);
      setConditionsError(null);

      try {
        const result = await getCategoryConditions(categoryId, TEMP_USER_ID);

        if (isCancelled) return;

        if (result.conditions.length > 0) {
          setAvailableConditions(result.conditions);

          // Check if current condition is still valid
          const currentConditionValid = result.conditions.some(
            (c) => c.apiEnum === selectedCondition || c.id === selectedCondition
          );

          if (!currentConditionValid && result.conditions.length > 0) {
            // Auto-select first valid condition
            const newCondition = result.conditions[0].apiEnum;
            setSelectedCondition(newCondition);
            // Persist the change
            if (itemId) {
              try {
                await updateListing(itemId, { condition: newCondition });
              } catch (err) {
                console.warn('[ListingPreview] Failed to update condition:', err);
              }
            }
          }
        } else {
          // No conditions from API - use defaults
          setAvailableConditions(DEFAULT_CONDITION_OPTIONS);
        }
      } catch (err) {
        console.error('[ListingPreview] Error fetching conditions:', err);
        if (!isCancelled) {
          setConditionsError('Could not load conditions for this category');
          setAvailableConditions(DEFAULT_CONDITION_OPTIONS);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingConditions(false);
        }
      }
    }

    fetchConditions();

    return () => {
      isCancelled = true;
    };
  }, [selectedCategory?.categoryId]);

  const handleViewComps = () => {
    navigation.navigate('Comps', {
      keywords: title,
      categoryId: selectedCategory?.categoryId,
      listing: initialListing,
    });
  };

  const handleRegenerate = async (field: 'title' | 'description' | 'price') => {
    setIsRegenerating(field);
    try {
      const updated = await regenerateField(initialListing.itemId, field);
      
      if (field === 'title' && updated.listing_draft) {
        setTitle(updated.listing_draft.title.value);
      } else if (field === 'description' && updated.listing_draft) {
        setDescription(updated.listing_draft.description.value);
      }
      // Price regeneration would update pricing_suggestion
    } catch (err) {
      Alert.alert('Error', 'Failed to regenerate. Please try again.');
    } finally {
      setIsRegenerating(null);
    }
  };

  const handleConditionChange = async (conditionValue: string) => {
    const previousCondition = selectedCondition;
    setSelectedCondition(conditionValue);
    setShowConditionPicker(false);
    setIsUpdatingCondition(true);

    try {
      await updateListing(initialListing.itemId, {
        condition: conditionValue,
      });
    } catch (err) {
      // Revert on failure
      setSelectedCondition(previousCondition);
      Alert.alert('Error', 'Failed to update condition. Please try again.');
    } finally {
      setIsUpdatingCondition(false);
    }
  };

  const getConditionLabel = (value: string) => {
    // Find in available conditions by apiEnum or id
    const found = availableConditions.find(
      (opt) => opt.apiEnum === value || opt.id === value
    );
    return found?.label || value;
  };

  const handleExport = () => {
    navigation.navigate('Export', {
      listing: {
        ...initialListing,
        listingDraft: {
          ...initialListing.listingDraft,
          title: { value: title, charCount: title.length },
          description: { value: description, charCount: description.length },
          category: {
            ...initialListing.listingDraft.category,
            platformCategoryId: selectedCategory?.categoryId || initialListing.listingDraft.category.platformCategoryId,
            value: selectedCategory?.categoryName || initialListing.listingDraft.category.value,
          },
          condition: {
            ...initialListing.listingDraft.condition,
            value: selectedCondition,
          },
        },
      },
      price: selectedPrice,
    });
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return '#34C759';
    if (confidence >= 0.6) return '#FF9500';
    return '#FF3B30';
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Photos */}
        <ScrollView horizontal style={styles.photosRow} showsHorizontalScrollIndicator={false}>
          {initialListing.photoUrls.map((url, index) => (
            <Image key={index} source={{ uri: url }} style={styles.photo} />
          ))}
        </ScrollView>

        {/* Platform Badge */}
        <View style={styles.platformBadge}>
          <Text style={styles.platformBadgeText}>
            eBay
          </Text>
        </View>

        {/* Title */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Title</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity
                onPress={() => setIsEditing(isEditing === 'title' ? null : 'title')}
              >
                <Text style={styles.actionText}>
                  {isEditing === 'title' ? 'Done' : 'Edit'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRegenerate('title')}
                disabled={isRegenerating === 'title'}
              >
                {isRegenerating === 'title' ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={styles.actionText}>Regenerate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          {isEditing === 'title' ? (
            <TextInput
              style={styles.editInput}
              value={title}
              onChangeText={setTitle}
              multiline
            />
          ) : (
            <Text style={styles.titleText}>{title}</Text>
          )}
          <Text style={styles.charCount}>{title.length}/80 characters</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Description</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity
                onPress={() => setIsEditing(isEditing === 'description' ? null : 'description')}
              >
                <Text style={styles.actionText}>
                  {isEditing === 'description' ? 'Done' : 'Edit'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRegenerate('description')}
                disabled={isRegenerating === 'description'}
              >
                {isRegenerating === 'description' ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={styles.actionText}>Regenerate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          {isEditing === 'description' ? (
            <TextInput
              style={[styles.editInput, styles.descriptionInput]}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          ) : (
            <Text style={styles.descriptionText}>{description}</Text>
          )}
        </View>

        {/* Category */}
        <CategoryPicker
          value={selectedCategory}
          suggestedQuery={`${initialListing.listingDraft.brand?.value || ''} ${title}`.trim()}
          onChange={setSelectedCategory}
        />

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggested Price</Text>
          <View style={styles.priceButtons}>
            <TouchableOpacity
              style={[
                styles.priceButton,
                selectedPrice === pricing.lowPrice && styles.priceButtonActive,
              ]}
              onPress={() => setSelectedPrice(pricing.lowPrice)}
            >
              <Text style={styles.priceLabel}>Quick Sale</Text>
              <Text style={styles.priceValue}>${pricing.lowPrice}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.priceButton,
                selectedPrice === pricing.midPrice && styles.priceButtonActive,
              ]}
              onPress={() => setSelectedPrice(pricing.midPrice)}
            >
              <Text style={styles.priceLabel}>Fair Price</Text>
              <Text style={styles.priceValue}>${pricing.midPrice}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.priceButton,
                selectedPrice === pricing.highPrice && styles.priceButtonActive,
              ]}
              onPress={() => setSelectedPrice(pricing.highPrice)}
            >
              <Text style={styles.priceLabel}>Best Price</Text>
              <Text style={styles.priceValue}>${pricing.highPrice}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.priceBasis}>{pricing.basis}</Text>
          <Text style={styles.disclaimer}>{pricing.disclaimer}</Text>

          {/* View Comps Button */}
          <TouchableOpacity style={styles.viewCompsButton} onPress={handleViewComps}>
            <Text style={styles.viewCompsText}>View Price Comparables</Text>
          </TouchableOpacity>
        </View>

        {/* Attributes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attributes</Text>
          {initialListing.listingDraft.attributes.map((attr, index) => (
            <View key={index} style={styles.attributeRow}>
              <Text style={styles.attributeKey}>{attr.key}</Text>
              <Text style={styles.attributeValue}>{attr.value}</Text>
            </View>
          ))}
        </View>

        {/* Condition */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Condition</Text>
            {(isUpdatingCondition || isLoadingConditions) && (
              <ActivityIndicator size="small" color="#007AFF" />
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.conditionSelector,
              !selectedCategory?.categoryId && styles.conditionSelectorDisabled,
            ]}
            onPress={() => setShowConditionPicker(true)}
            disabled={isUpdatingCondition || isLoadingConditions}
          >
            <Text
              style={[
                styles.conditionValue,
                !selectedCategory?.categoryId && styles.conditionValueDisabled,
              ]}
            >
              {getConditionLabel(selectedCondition)}
            </Text>
            <Text style={styles.conditionChevron}>›</Text>
          </TouchableOpacity>
          {!selectedCategory?.categoryId && (
            <Text style={styles.conditionHint}>
              Select a category to see valid conditions
            </Text>
          )}
          {initialListing.listingDraft.condition?.requiresConfirmation && selectedCategory?.categoryId && (
            <Text style={styles.conditionHint}>
              AI detected: {initialListing.listingDraft.condition.value}
            </Text>
          )}
        </View>

        {/* Condition Picker Modal */}
        <Modal
          visible={showConditionPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowConditionPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Condition</Text>
                <TouchableOpacity onPress={() => setShowConditionPicker(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
              {isLoadingConditions ? (
                <View style={styles.conditionLoading}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.conditionLoadingText}>Loading conditions...</Text>
                </View>
              ) : !selectedCategory?.categoryId ? (
                <View style={styles.conditionLoading}>
                  <Text style={styles.conditionLoadingText}>
                    Select a category first to see valid conditions
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.conditionList}>
                  {conditionsError && (
                    <View style={styles.conditionErrorBanner}>
                      <Text style={styles.conditionErrorText}>{conditionsError}</Text>
                    </View>
                  )}
                  {availableConditions.map((option) => (
                    <TouchableOpacity
                      key={option.id || option.apiEnum}
                      style={[
                        styles.conditionOption,
                        (selectedCondition === option.apiEnum || selectedCondition === option.id) &&
                          styles.conditionOptionSelected,
                      ]}
                      onPress={() => handleConditionChange(option.apiEnum)}
                    >
                      <View style={styles.conditionOptionContent}>
                        <Text
                          style={[
                            styles.conditionOptionText,
                            (selectedCondition === option.apiEnum || selectedCondition === option.id) &&
                              styles.conditionOptionTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        {option.description && (
                          <Text style={styles.conditionOptionDescription}>
                            {option.description}
                          </Text>
                        )}
                      </View>
                      {(selectedCondition === option.apiEnum || selectedCondition === option.id) && (
                        <Text style={styles.conditionCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Processing Time */}
        <Text style={styles.processingTime}>
          Generated in {(initialListing.processingTimeMs / 1000).toFixed(1)}s
        </Text>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
          <Text style={styles.exportButtonText}>Export Listing (${selectedPrice})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  photosRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
  },
  platformBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 16,
    marginTop: 12,
  },
  platformBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  titleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    lineHeight: 24,
  },
  descriptionText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#333',
  },
  descriptionInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  priceButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  priceButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  priceButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FF',
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  priceBasis: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
    fontStyle: 'italic',
  },
  disclaimer: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
  },
  viewCompsButton: {
    backgroundColor: '#E3F2FF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  viewCompsText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  attributeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  attributeKey: {
    fontSize: 14,
    color: '#666',
  },
  attributeValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  conditionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 8,
  },
  conditionSelectorDisabled: {
    opacity: 0.6,
  },
  conditionValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  conditionValueDisabled: {
    color: '#999',
  },
  conditionChevron: {
    fontSize: 20,
    color: '#999',
  },
  conditionHint: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCancel: {
    fontSize: 16,
    color: '#007AFF',
  },
  conditionList: {
    paddingBottom: 34,
  },
  conditionOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  conditionOptionSelected: {
    backgroundColor: '#E3F2FF',
  },
  conditionOptionText: {
    fontSize: 16,
    color: '#333',
  },
  conditionOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  conditionCheck: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
  },
  conditionOptionContent: {
    flex: 1,
  },
  conditionOptionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  conditionLoading: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionLoadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  conditionErrorBanner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  conditionErrorText: {
    fontSize: 13,
    color: '#856404',
  },
  processingTime: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginVertical: 16,
  },
  footer: {
    padding: 16,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  exportButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
