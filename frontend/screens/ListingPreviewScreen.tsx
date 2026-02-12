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
  getCategoryItemAspects,
  suggestAiCategory,
  autofillItemSpecifics,
  getUsageStatus,
  type GenerateListingResponse,
  type CategoryCondition,
  type ItemAspectsMetadata,
  type PackageWeight,
  type PackageDimensions,
  type WeightSuggestion,
  type DimensionsSuggestion,
  type AiCategorySuggestResponse,
  type UsageStatus,
  PACKAGING_TYPE_LABELS,
} from '../lib/api';
import CategoryPicker from '../components/CategoryPicker';
import ItemSpecificsEditor from '../components/ItemSpecificsEditor';
import WeightInput from '../components/WeightInput';
import { colors, spacing, typography, radii } from '../lib/theme';
import { ScreenContainer, PrimaryButton, Card } from '../components/ui';

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

// Preferred order: used conditions first, NEW last (skew away from new)
const PREFERRED_CONDITION_ORDER = [
  'USED_GOOD',
  'USED_VERY_GOOD',
  'USED_EXCELLENT',
  'USED_ACCEPTABLE',
  'LIKE_NEW',
  'USED',
  'PRE_OWNED',
  'REFURBISHED',
  'SELLER_REFURBISHED',
  'CERTIFIED_REFURBISHED',
  'FOR_PARTS_OR_NOT_WORKING',
  'NEW',
  'NEW_OTHER',
  'NEW_WITH_DEFECTS',
];

const NEW_CONDITION_VALUES = new Set(['NEW', 'NEW_OTHER', 'NEW_WITH_DEFECTS', 'NEW_WITH_TAGS', 'NEW_WITHOUT_TAGS']);

// Map vision/generic condition strings to eBay apiEnum for fuzzy matching
const VISION_TO_EBAY_CONDITION: Record<string, string> = {
  good: 'USED_GOOD',
  'used_good': 'USED_GOOD',
  'used good': 'USED_GOOD',
  very_good: 'USED_VERY_GOOD',
  'used_very_good': 'USED_VERY_GOOD',
  'very good': 'USED_VERY_GOOD',
  excellent: 'USED_EXCELLENT',
  'used_excellent': 'USED_EXCELLENT',
  'used excellent': 'USED_EXCELLENT',
  like_new: 'LIKE_NEW',
  'like new': 'LIKE_NEW',
  acceptable: 'USED_ACCEPTABLE',
  fair: 'USED_ACCEPTABLE',
  'used_acceptable': 'USED_ACCEPTABLE',
  poor: 'FOR_PARTS_OR_NOT_WORKING',
  'for_parts': 'FOR_PARTS_OR_NOT_WORKING',
  'for parts': 'FOR_PARTS_OR_NOT_WORKING',
  'not working': 'FOR_PARTS_OR_NOT_WORKING',
  new: 'NEW',
  refurbished: 'CERTIFIED_REFURBISHED',
  'seller_refurbished': 'SELLER_REFURBISHED',
  pre_owned: 'USED',
  used: 'USED_GOOD',
};

/**
 * Get the best condition value from category options.
 * - Only returns currentValue if it exists in the category's valid options
 * - Skews away from NEW - prefers used conditions
 * - Maps vision strings (good, like_new, etc.) to best match in category options
 */
const getPreferredConditionValue = (
  options: CategoryCondition[],
  currentValue?: string
): string => {
  if (!options.length) {
    return currentValue || 'USED_GOOD';
  }

  const normalizedOptions = options.map((option) => ({
    ...option,
    apiEnum: option.apiEnum?.toUpperCase?.() ?? option.apiEnum,
    label: option.label?.toLowerCase?.() ?? option.label,
  }));

  const isValidInOptions = (val: string) =>
    normalizedOptions.some(
      (c) =>
        (c.apiEnum && c.apiEnum.toUpperCase() === val?.toUpperCase?.()) ||
        c.id === val
    );

  // Resolve vision/generic value to eBay enum for matching
  const normalizedCurrent = currentValue?.trim?.();
  const resolvedCurrent =
    normalizedCurrent &&
    (VISION_TO_EBAY_CONDITION[normalizedCurrent.toLowerCase()] ??
      normalizedCurrent.toUpperCase());

  // Only keep currentValue if it's valid for this category AND not NEW (we skew away from new)
  const currentValid =
    resolvedCurrent &&
    isValidInOptions(resolvedCurrent) &&
    !NEW_CONDITION_VALUES.has(resolvedCurrent);

  if (currentValid) {
    const match = normalizedOptions.find(
      (c) =>
        c.apiEnum?.toUpperCase() === resolvedCurrent ||
        c.id === resolvedCurrent
    );
    return match?.apiEnum ?? resolvedCurrent;
  }

  // Pick from preferred order (used conditions first, NEW last)
  for (const preferred of PREFERRED_CONDITION_ORDER) {
    const match = normalizedOptions.find((option) => option.apiEnum === preferred);
    if (match) {
      return match.apiEnum;
    }
  }

  // Fallback: first non-new option
  const firstNonNew = normalizedOptions.find(
    (option) => option.apiEnum && !NEW_CONDITION_VALUES.has(option.apiEnum)
  );
  if (firstNonNew?.apiEnum) return firstNonNew.apiEnum;

  return normalizedOptions[0]?.apiEnum || 'USED_GOOD';
};

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
    categoryTreeId: string;
  } | undefined>(
    initialListing.listingDraft.category.platformCategoryId
      ? {
          categoryId: initialListing.listingDraft.category.platformCategoryId,
          categoryName: initialListing.listingDraft.category.value,
          categoryTreeId: '0',
        }
      : undefined
  );
  const [selectedCondition, setSelectedCondition] = useState(() =>
    getPreferredConditionValue(
      DEFAULT_CONDITION_OPTIONS,
      initialListing.listingDraft.condition?.value
    )
  );
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [isUpdatingCondition, setIsUpdatingCondition] = useState(false);
  const [availableConditions, setAvailableConditions] = useState<CategoryCondition[]>(DEFAULT_CONDITION_OPTIONS);
  const [isLoadingConditions, setIsLoadingConditions] = useState(false);
  const [conditionsError, setConditionsError] = useState<string | null>(null);

  // Item specifics state
  const [itemAspectsMetadata, setItemAspectsMetadata] = useState<ItemAspectsMetadata | null>(null);
  const [itemSpecifics, setItemSpecifics] = useState<Record<string, string>>({});
  const [missingAspects, setMissingAspects] = useState<string[]>([]);
  const [isLoadingAspects, setIsLoadingAspects] = useState(false);

  // AI category suggestion state
  const [aiCategorySuggestion, setAiCategorySuggestion] = useState<AiCategorySuggestResponse | null>(null);
  const [isLoadingAiCategory, setIsLoadingAiCategory] = useState(false);
  const [isAutofillingSpecifics, setIsAutofillingSpecifics] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState<string[]>([]);

  // Category change handler: reset dependent state when category changes
  const handleCategoryChange = (category: { categoryId: string; categoryName: string; categoryTreeId: string }) => {
    setSelectedCategory(category);
    // Reset condition to preferred default — will be re-fetched by the conditions useEffect
    setSelectedCondition(getPreferredConditionValue(DEFAULT_CONDITION_OPTIONS));
    setAvailableConditions(DEFAULT_CONDITION_OPTIONS);
    // Reset item specifics — will be re-fetched by the aspects useEffect
    setItemSpecifics({});
    setItemAspectsMetadata(null);
    setMissingAspects([]);
    setAiFilledFields([]);
    // Clear AI suggestion when user manually changes category
    setAiCategorySuggestion(null);
  };

  // Package weight and dimensions state
  const [packageWeight, setPackageWeight] = useState<PackageWeight | null>(null);
  const [packageDimensions, setPackageDimensions] = useState<PackageDimensions | null>(null);
  const [suggestedWeight, setSuggestedWeight] = useState<WeightSuggestion | null>(null);
  const [suggestedDimensions, setSuggestedDimensions] = useState<DimensionsSuggestion | null>(null);
  const [userPackageOverride, setUserPackageOverride] = useState(false);

  // Usage status for premium gating (e.g. price comparables)
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);

  const pricing = initialListing?.pricingSuggestion;
  const isPremium = usageStatus?.isPremium ?? false;

  // Guard: show fallback UI if no listing data
  if (!initialListing) {
    return (
      <ScreenContainer edges={[]} noPadding>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackText}>No listing data available</Text>
          <PrimaryButton title="Go Home" onPress={() => navigation.navigate('Home')} />
        </View>
      </ScreenContainer>
    );
  }

  // Apply price selected from comps screen
  useEffect(() => {
    if (selectedPriceFromComps !== undefined) {
      setSelectedPrice(selectedPriceFromComps);
    }
  }, [selectedPriceFromComps]);

  // Fetch usage status for premium gating (e.g. price comparables)
  useEffect(() => {
    getUsageStatus()
      .then(setUsageStatus)
      .catch((err) => console.warn('[ListingPreview] Failed to fetch usage status:', err));
  }, []);

  // AI Category Suggestion: auto-suggest category when listing loads
  useEffect(() => {
    if (!initialListing?.itemId) return;
    // Skip if category already set from listing draft
    if (selectedCategory?.categoryId) return;

    let isCancelled = false;

    async function fetchAiCategory() {
      setIsLoadingAiCategory(true);
      try {
        const result = await suggestAiCategory(initialListing.itemId);
        if (isCancelled) return;

        setAiCategorySuggestion(result);

        // Auto-set the primary suggestion as selected category
        setSelectedCategory({
          categoryId: result.primary.categoryId,
          categoryName: result.primary.categoryName,
          categoryTreeId: result.primary.categoryTreeId,
        });
      } catch (err) {
        console.warn('[ListingPreview] AI category suggestion failed:', err);
        // Silently fail - user can still pick manually
      } finally {
        if (!isCancelled) {
          setIsLoadingAiCategory(false);
        }
      }
    }

    fetchAiCategory();

    return () => { isCancelled = true; };
  }, [initialListing?.itemId]);

  // Apply shipping estimate from AI vision model (or fallback defaults)
  useEffect(() => {
    const estimate = initialListing?.visionOutput?.shippingEstimate;
    if (estimate) {
      const confidenceLevel = estimate.confidence >= 0.7 ? 'high' : estimate.confidence >= 0.4 ? 'medium' : 'low';
      const source = `AI estimate (${PACKAGING_TYPE_LABELS[estimate.packagingType]})`;

      setSuggestedWeight({ value: estimate.packageWeightOz, unit: 'OUNCE', confidence: confidenceLevel, source });
      setSuggestedDimensions({
        length: estimate.packageDimensionsIn.l, width: estimate.packageDimensionsIn.w,
        height: estimate.packageDimensionsIn.h, unit: 'INCH', confidence: confidenceLevel, source,
      });

      if (!userPackageOverride) {
        setPackageWeight({ value: estimate.packageWeightOz, unit: 'OUNCE' });
        setPackageDimensions({
          length: estimate.packageDimensionsIn.l, width: estimate.packageDimensionsIn.w,
          height: estimate.packageDimensionsIn.h, unit: 'INCH',
        });
      }
    } else {
      // Fallback defaults
      setSuggestedWeight({ value: 16, unit: 'OUNCE', confidence: 'low', source: 'Default — adjust if needed' });
      setSuggestedDimensions({ length: 12, width: 10, height: 2, unit: 'INCH', confidence: 'low', source: 'Default — adjust if needed' });
    }
  }, [initialListing?.visionOutput?.shippingEstimate]);

  // Fetch valid conditions when category changes
  useEffect(() => {
    if (!selectedCategory?.categoryId || selectedCategory.categoryId.trim() === '') {
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
        const result = await getCategoryConditions(categoryId);

        if (isCancelled) return;

        if (result.conditions.length > 0) {
          setAvailableConditions(result.conditions);

          // Check if current condition is still valid for this category
          const currentConditionValid = result.conditions.some(
            (c) => c.apiEnum === selectedCondition || c.id === selectedCondition
          );

          // Use vision-detected condition as hint when picking from category options (maps good/like_new etc.)
          const conditionHint =
            initialListing?.listingDraft?.condition?.value || selectedCondition;
          const preferredCondition = getPreferredConditionValue(
            result.conditions,
            conditionHint
          );
          const shouldOverrideToPreferred =
            !!preferredCondition &&
            (NEW_CONDITION_VALUES.has(selectedCondition) || !currentConditionValid);

          if (shouldOverrideToPreferred) {
            const newCondition = preferredCondition;
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
          // No conditions from API - use defaults and set condition from them
          setAvailableConditions(DEFAULT_CONDITION_OPTIONS);
          const fallbackCondition = getPreferredConditionValue(
            DEFAULT_CONDITION_OPTIONS,
            initialListing?.listingDraft?.condition?.value
          );
          setSelectedCondition(fallbackCondition);
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

  // Fetch item aspects and autofill values when category changes
  useEffect(() => {
    if (!selectedCategory?.categoryId || selectedCategory.categoryId.trim() === '' ||
        !selectedCategory?.categoryTreeId || selectedCategory.categoryTreeId.trim() === '') {
      // No category selected or missing treeId - reset aspects
      setItemAspectsMetadata(null);
      setMissingAspects([]);
      return;
    }

    const categoryId = selectedCategory.categoryId;
    const categoryTreeId = selectedCategory.categoryTreeId;
    let isCancelled = false;

    if (__DEV__) {
      console.log(`[ListingPreview] Fetching aspects + AI autofill { categoryId: ${categoryId}, categoryTreeId: ${categoryTreeId} }`);
    }

    async function fetchAspectsAndAutofill() {
      setIsLoadingAspects(true);
      setIsAutofillingSpecifics(true);

      try {
        // Use AI autofill endpoint which fetches aspects AND fills specifics in one call
        if (initialListing?.itemId) {
          const result = await autofillItemSpecifics(
            initialListing.itemId,
            categoryId,
            itemSpecifics
          );

          if (isCancelled) return;

          // Set aspects metadata from the response
          if (result.aspectsMetadata) {
            setItemAspectsMetadata({
              categoryId,
              categoryTreeId,
              requiredAspects: result.aspectsMetadata.requiredAspects,
              recommendedAspects: result.aspectsMetadata.recommendedAspects,
              cached: false,
            });
          }

          // Merge AI-filled specifics (preserve user edits)
          setItemSpecifics(prev => {
            const merged = { ...result.itemSpecifics };
            // Keep any user edits that already existed
            for (const [key, val] of Object.entries(prev)) {
              if (val && val.trim() !== '') {
                merged[key] = val;
              }
            }
            return merged;
          });

          setAiFilledFields(result.filledByAi);
          setMissingAspects(result.stillMissing);
        } else {
          // Fallback: just fetch aspects metadata
          const metadata = await getCategoryItemAspects(categoryId);
          if (isCancelled) return;
          setItemAspectsMetadata(metadata);
          const missing = metadata.requiredAspects
            .filter(a => !itemSpecifics[a.name])
            .map(a => a.name);
          setMissingAspects(missing);
        }
      } catch (err) {
        console.error('[ListingPreview] Error fetching aspects/autofill:', err);
        if (!isCancelled) {
          setItemAspectsMetadata(null);
          setMissingAspects([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingAspects(false);
          setIsAutofillingSpecifics(false);
        }
      }
    }

    fetchAspectsAndAutofill();

    return () => {
      isCancelled = true;
    };
  }, [selectedCategory?.categoryId, selectedCategory?.categoryTreeId]);

  // Handle item specifics change
  const handleItemSpecificChange = (key: string, value: string) => {
    setItemSpecifics(prev => ({
      ...prev,
      [key]: value,
    }));

    // Remove from missing if it now has a value
    if (value.trim()) {
      setMissingAspects(prev => prev.filter(name => name !== key));
    } else if (itemAspectsMetadata?.requiredAspects.some(a => a.name === key)) {
      // Add to missing if it's required and now empty
      setMissingAspects(prev => prev.includes(key) ? prev : [...prev, key]);
    }
  };

  const handleWeightChange = (w: PackageWeight) => {
    setPackageWeight(w);
    setUserPackageOverride(true);
  };
  const handleDimensionsChange = (dims: PackageDimensions) => {
    setPackageDimensions(dims);
    setUserPackageOverride(true);
  };
  const handleResetToSuggested = () => {
    setUserPackageOverride(false);
    const estimate = initialListing?.visionOutput?.shippingEstimate;
    if (estimate) {
      setPackageWeight({ value: estimate.packageWeightOz, unit: 'OUNCE' });
      setPackageDimensions({
        length: estimate.packageDimensionsIn.l, width: estimate.packageDimensionsIn.w,
        height: estimate.packageDimensionsIn.h, unit: 'INCH',
      });
    }
  };

  const handleViewComps = () => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'Price comparables are a Premium feature. Upgrade to unlock detailed market insights.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Premium', onPress: () => navigation.navigate('Home') },
        ]
      );
      return;
    }
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
    // Merge existing attributes with item specifics for export
    const mergedAttributes = [
      ...initialListing.listingDraft.attributes,
      ...Object.entries(itemSpecifics)
        .filter(([key, value]) => value && !initialListing.listingDraft.attributes.some(a => a.key === key))
        .map(([key, value]) => ({ key, value, editable: true })),
    ];

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
          attributes: mergedAttributes,
        },
      },
      price: selectedPrice,
      itemSpecifics,
      missingItemSpecifics: missingAspects,
      packageWeight,
      packageDimensions,
    });
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return colors.success;
    if (confidence >= 0.6) return colors.warning;
    return colors.error;
  };

  return (
    <ScreenContainer edges={[]} noPadding>
      <ScrollView style={styles.scrollView}>
        {/* Photos */}
        <ScrollView horizontal style={styles.photosRow} showsHorizontalScrollIndicator={false}>
          {initialListing.photoUrls.map((url, index) => (
            <Image key={index} source={{ uri: url }} style={styles.photo} />
          ))}
        </ScrollView>

        {/* Platform Badge */}
        <View style={styles.platformBadge}>
          <Text style={styles.platformBadgeText}>eBay</Text>
        </View>

        {/* Title */}
        <Card>
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
                  <ActivityIndicator size="small" color={colors.primary} />
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
        </Card>

        {/* Description */}
        <Card>
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
                  <ActivityIndicator size="small" color={colors.primary} />
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
        </Card>

        {/* Category */}
        <CategoryPicker
          value={selectedCategory}
          suggestedQuery={`${initialListing.listingDraft.brand?.value || ''} ${title}`.trim()}
          onChange={handleCategoryChange}
          aiSuggestion={aiCategorySuggestion || undefined}
          isLoadingAi={isLoadingAiCategory}
        />

        {/* Pricing */}
        <Card>
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
          <View style={styles.compsButtonContainer}>
            <PrimaryButton
              title="View Price Comparables"
              onPress={handleViewComps}
              variant="secondary"
              size="sm"
            />
          </View>
        </Card>

        {/* Attributes */}
        <Card>
          <Text style={styles.sectionTitle}>Attributes</Text>
          {initialListing.listingDraft.attributes.map((attr, index) => (
            <View key={index} style={styles.attributeRow}>
              <Text style={styles.attributeKey}>{attr.key}</Text>
              <Text style={styles.attributeValue}>{attr.value}</Text>
            </View>
          ))}
        </Card>

        {/* Item Specifics (eBay category-specific) */}
        {!selectedCategory?.categoryId && !isLoadingAspects ? (
          <Card>
            <Text style={styles.conditionHint}>
              Select a category to see item specifics
            </Text>
          </Card>
        ) : (
          <ItemSpecificsEditor
            metadata={itemAspectsMetadata}
            values={itemSpecifics}
            onChange={handleItemSpecificChange}
            missingAspects={missingAspects}
            isLoading={isLoadingAspects}
          />
        )}

        {/* Package Weight */}
        <WeightInput
          weight={packageWeight}
          dimensions={packageDimensions}
          suggestedWeight={suggestedWeight}
          suggestedDimensions={suggestedDimensions}
          onWeightChange={handleWeightChange}
          onDimensionsChange={handleDimensionsChange}
          packagingType={initialListing?.visionOutput?.shippingEstimate?.packagingType ?? null}
          confidence={initialListing?.visionOutput?.shippingEstimate?.confidence ?? null}
          userOverride={userPackageOverride}
          onResetToSuggested={handleResetToSuggested}
        />

        {/* Condition */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Condition</Text>
            {(isUpdatingCondition || isLoadingConditions) && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.conditionSelector,
              !selectedCategory?.categoryId && styles.conditionSelectorDisabled,
            ]}
            onPress={() => setShowConditionPicker(true)}
            disabled={!selectedCategory?.categoryId || isUpdatingCondition || isLoadingConditions}
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
        </Card>

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
                  <ActivityIndicator size="large" color={colors.primary} />
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
        <PrimaryButton
          title={`Export Listing ($${selectedPrice})`}
          onPress={handleExport}
          variant="success"
          size="lg"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  photosRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: radii.md,
    marginRight: spacing.sm,
  },
  platformBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    marginLeft: spacing.lg,
    marginTop: spacing.md,
  },
  platformBadgeText: {
    color: colors.textInverse,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  actionText: {
    color: colors.primary,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
  },
  titleText: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    lineHeight: 24,
  },
  descriptionText: {
    fontSize: typography.sizes.input,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.borderMedium,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.sizes.input,
    color: colors.text,
  },
  descriptionInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  priceButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  priceButton: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    padding: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  priceButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  priceLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  priceValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  priceBasis: {
    fontSize: typography.sizes.md,
    color: colors.textTertiary,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  disclaimer: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  compsButtonContainer: {
    marginTop: spacing.lg,
  },
  attributeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  attributeKey: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
  },
  attributeValue: {
    fontSize: typography.sizes.body,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  conditionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    padding: 14,
    borderRadius: radii.md,
  },
  conditionSelectorDisabled: {
    opacity: 0.6,
  },
  conditionValue: {
    fontSize: typography.sizes.button,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  conditionValueDisabled: {
    color: colors.textMuted,
  },
  conditionChevron: {
    fontSize: 20,
    color: colors.textMuted,
  },
  conditionHint: {
    fontSize: typography.sizes.sm,
    color: colors.warning,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  modalCancel: {
    fontSize: typography.sizes.button,
    color: colors.primary,
  },
  conditionList: {
    paddingBottom: 34,
  },
  conditionOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  conditionOptionSelected: {
    backgroundColor: colors.primaryLight,
  },
  conditionOptionText: {
    fontSize: typography.sizes.button,
    color: colors.text,
  },
  conditionOptionTextSelected: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  conditionCheck: {
    fontSize: typography.sizes.title,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  conditionOptionContent: {
    flex: 1,
  },
  conditionOptionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  conditionLoading: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionLoadingText: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  conditionErrorBanner: {
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radii.md,
  },
  conditionErrorText: {
    fontSize: typography.sizes.md,
    color: colors.warningDark,
  },
  processingTime: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: 34,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  fallbackText: {
    fontSize: typography.sizes.button,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
});
