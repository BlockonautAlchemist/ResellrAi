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
  type GenerateListingResponse,
} from '../lib/api';
import CategoryPicker from '../components/CategoryPicker';

// Condition options with user-friendly labels
const CONDITION_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'LIKE_NEW', label: 'Like New' },
  { value: 'USED_EXCELLENT', label: 'Used - Excellent' },
  { value: 'USED_VERY_GOOD', label: 'Used - Very Good' },
  { value: 'USED_GOOD', label: 'Used - Good' },
  { value: 'USED_ACCEPTABLE', label: 'Used - Acceptable' },
  { value: 'FOR_PARTS_OR_NOT_WORKING', label: 'For Parts / Not Working' },
] as const;

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
    return CONDITION_OPTIONS.find(opt => opt.value === value)?.label || value;
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
            {isUpdatingCondition && (
              <ActivityIndicator size="small" color="#007AFF" />
            )}
          </View>
          <TouchableOpacity
            style={styles.conditionSelector}
            onPress={() => setShowConditionPicker(true)}
            disabled={isUpdatingCondition}
          >
            <Text style={styles.conditionValue}>
              {getConditionLabel(selectedCondition)}
            </Text>
            <Text style={styles.conditionChevron}>›</Text>
          </TouchableOpacity>
          {initialListing.listingDraft.condition?.requiresConfirmation && (
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
              <ScrollView style={styles.conditionList}>
                {CONDITION_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.conditionOption,
                      selectedCondition === option.value && styles.conditionOptionSelected,
                    ]}
                    onPress={() => handleConditionChange(option.value)}
                  >
                    <Text
                      style={[
                        styles.conditionOptionText,
                        selectedCondition === option.value && styles.conditionOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selectedCondition === option.value && (
                      <Text style={styles.conditionCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
  conditionValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
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
