import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import type {
  PackageWeight,
  PackageDimensions,
  WeightSuggestion,
  DimensionsSuggestion,
  WeightUnit,
  PackagingType,
} from '../lib/api';
import { PACKAGING_TYPE_LABELS } from '../lib/api';
import { colors, spacing, typography, radii } from '../lib/theme';

interface Props {
  weight: PackageWeight | null;
  dimensions: PackageDimensions | null;
  suggestedWeight: WeightSuggestion | null;
  suggestedDimensions: DimensionsSuggestion | null;
  onWeightChange: (weight: PackageWeight) => void;
  onDimensionsChange: (dimensions: PackageDimensions) => void;
  weightError?: string | null;
  dimensionsError?: string | null;
  packagingType?: PackagingType | null;
  confidence?: number | null;
  userOverride?: boolean;
  onResetToSuggested?: () => void;
}

/**
 * Format weight for display (e.g., "1 lb 8 oz" for 24 oz)
 */
function formatWeightDisplay(value: number, unit: WeightUnit): string {
  if (unit === 'POUND') {
    return value === 1 ? '1 lb' : `${value} lb`;
  }

  // For ounces, show as lb + oz if >= 16 oz
  if (value >= 16) {
    const pounds = Math.floor(value / 16);
    const ounces = value % 16;
    if (ounces === 0) {
      return pounds === 1 ? '1 lb' : `${pounds} lb`;
    }
    return `${pounds} lb ${ounces} oz`;
  }

  return `${value} oz`;
}

export default function WeightInput({
  weight,
  dimensions,
  suggestedWeight,
  suggestedDimensions,
  onWeightChange,
  onDimensionsChange,
  weightError,
  dimensionsError,
  packagingType,
  confidence,
  userOverride,
  onResetToSuggested,
}: Props) {
  const currentWeightUnit = weight?.unit || 'OUNCE';
  const currentWeightValue = weight?.value || 0;
  const currentDimUnit = dimensions?.unit || 'INCH';

  const handleWeightValueChange = (text: string) => {
    const numValue = parseFloat(text) || 0;
    onWeightChange({
      value: numValue,
      unit: currentWeightUnit,
    });
  };

  const handleWeightUnitToggle = () => {
    const newUnit: WeightUnit = currentWeightUnit === 'OUNCE' ? 'POUND' : 'OUNCE';

    // Convert the value when switching units
    let newValue = currentWeightValue;
    if (currentWeightUnit === 'OUNCE' && newUnit === 'POUND') {
      newValue = Math.round((currentWeightValue / 16) * 100) / 100;
    } else if (currentWeightUnit === 'POUND' && newUnit === 'OUNCE') {
      newValue = Math.round(currentWeightValue * 16);
    }

    onWeightChange({
      value: newValue,
      unit: newUnit,
    });
  };

  const handleDimensionChange = (dim: 'length' | 'width' | 'height', text: string) => {
    const numValue = parseFloat(text) || 0;
    onDimensionsChange({
      length: dim === 'length' ? numValue : (dimensions?.length || 0),
      width: dim === 'width' ? numValue : (dimensions?.width || 0),
      height: dim === 'height' ? numValue : (dimensions?.height || 0),
      unit: currentDimUnit,
    });
  };

  const handleUseSuggestions = () => {
    if (suggestedWeight) {
      onWeightChange({
        value: suggestedWeight.value,
        unit: suggestedWeight.unit,
      });
    }
    if (suggestedDimensions) {
      onDimensionsChange({
        length: suggestedDimensions.length,
        width: suggestedDimensions.width,
        height: suggestedDimensions.height,
        unit: suggestedDimensions.unit,
      });
    }
  };

  const hasNoValues = (!weight || weight.value === 0) &&
    (!dimensions || (dimensions.length === 0 && dimensions.width === 0 && dimensions.height === 0));

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Package Details</Text>
        {(weightError || dimensionsError) && (
          <View style={styles.errorBadge}>
            <Text style={styles.errorBadgeText}>Required</Text>
          </View>
        )}
      </View>

      {/* Packaging Type + Confidence Badge */}
      {packagingType && (
        <View style={styles.packagingInfo}>
          <View style={styles.packagingBadge}>
            <Text style={styles.packagingBadgeText}>
              {PACKAGING_TYPE_LABELS[packagingType]}
            </Text>
          </View>
          {confidence != null && (
            <Text style={[
              styles.confidenceText,
              { color: confidence >= 0.7 ? colors.success : confidence >= 0.4 ? colors.warning : colors.error },
            ]}>
              {Math.round(confidence * 100)}% confidence
            </Text>
          )}
        </View>
      )}

      {/* Suggestion Banner: shown when no values and not auto-applied */}
      {(suggestedWeight || suggestedDimensions) && hasNoValues && !packagingType && (
        <TouchableOpacity
          style={styles.suggestionBanner}
          onPress={handleUseSuggestions}
        >
          <Text style={styles.suggestionTitle}>Suggested values:</Text>
          {suggestedWeight && (
            <Text style={styles.suggestionValue}>
              Weight: {formatWeightDisplay(suggestedWeight.value, suggestedWeight.unit)}
            </Text>
          )}
          {suggestedDimensions && (
            <Text style={styles.suggestionValue}>
              Dimensions: {suggestedDimensions.length} x {suggestedDimensions.width} x {suggestedDimensions.height} in
            </Text>
          )}
          <Text style={styles.suggestionSource}>
            {suggestedWeight?.source || suggestedDimensions?.source}
          </Text>
          <Text style={styles.useSuggestionText}>Tap to use these values</Text>
        </TouchableOpacity>
      )}

      {/* Currently using AI suggestion indicator */}
      {!userOverride && packagingType && !hasNoValues && (
        <View style={styles.aiAppliedBanner}>
          <Text style={styles.aiAppliedText}>
            Using AI-suggested values ({suggestedWeight?.source || 'AI estimate'})
          </Text>
        </View>
      )}

      {/* Weight Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Weight</Text>
        <View style={[
          styles.inputRow,
          weightError && styles.inputRowError,
        ]}>
          <TextInput
            style={styles.weightInput}
            value={currentWeightValue > 0 ? String(currentWeightValue) : ''}
            onChangeText={handleWeightValueChange}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />

          {/* Unit Toggle */}
          <View style={styles.unitToggle}>
            <TouchableOpacity
              style={[
                styles.unitButton,
                currentWeightUnit === 'OUNCE' && styles.unitButtonActive,
              ]}
              onPress={() => currentWeightUnit !== 'OUNCE' && handleWeightUnitToggle()}
            >
              <Text style={[
                styles.unitButtonText,
                currentWeightUnit === 'OUNCE' && styles.unitButtonTextActive,
              ]}>oz</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.unitButton,
                currentWeightUnit === 'POUND' && styles.unitButtonActive,
              ]}
              onPress={() => currentWeightUnit !== 'POUND' && handleWeightUnitToggle()}
            >
              <Text style={[
                styles.unitButtonText,
                currentWeightUnit === 'POUND' && styles.unitButtonTextActive,
              ]}>lb</Text>
            </TouchableOpacity>
          </View>
        </View>
        {weightError && (
          <Text style={styles.errorText}>{weightError}</Text>
        )}
        {currentWeightValue > 0 && (
          <Text style={styles.displayText}>
            {formatWeightDisplay(currentWeightValue, currentWeightUnit)}
          </Text>
        )}
      </View>

      {/* Dimensions Input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Dimensions (inches)</Text>
        <View style={[
          styles.dimensionsRow,
          dimensionsError && styles.inputRowError,
        ]}>
          <View style={styles.dimensionInput}>
            <Text style={styles.dimensionLabel}>L</Text>
            <TextInput
              style={styles.dimensionField}
              value={dimensions?.length ? String(dimensions.length) : ''}
              onChangeText={(text) => handleDimensionChange('length', text)}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.dimensionSeparator}>x</Text>
          <View style={styles.dimensionInput}>
            <Text style={styles.dimensionLabel}>W</Text>
            <TextInput
              style={styles.dimensionField}
              value={dimensions?.width ? String(dimensions.width) : ''}
              onChangeText={(text) => handleDimensionChange('width', text)}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.dimensionSeparator}>x</Text>
          <View style={styles.dimensionInput}>
            <Text style={styles.dimensionLabel}>H</Text>
            <TextInput
              style={styles.dimensionField}
              value={dimensions?.height ? String(dimensions.height) : ''}
              onChangeText={(text) => handleDimensionChange('height', text)}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        {dimensionsError && (
          <Text style={styles.errorText}>{dimensionsError}</Text>
        )}
        {dimensions && dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0 && (
          <Text style={styles.displayText}>
            {dimensions.length} x {dimensions.width} x {dimensions.height} in
          </Text>
        )}
      </View>

      {/* Reset to AI suggested button */}
      {userOverride && onResetToSuggested && (
        <TouchableOpacity style={styles.resetButton} onPress={onResetToSuggested}>
          <Text style={styles.resetButtonText}>Reset to AI suggested</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
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
  errorBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  errorBadgeText: {
    color: colors.textInverse,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  suggestionBanner: {
    backgroundColor: colors.primaryMuted,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  suggestionTitle: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
    marginBottom: 6,
  },
  suggestionValue: {
    fontSize: typography.sizes.body,
    color: colors.text,
    marginBottom: 2,
  },
  suggestionSource: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  useSuggestionText: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.medium,
    marginTop: 6,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inputRowError: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.md,
    padding: spacing.xs,
  },
  weightInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    padding: 14,
    borderRadius: radii.md,
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  unitButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  unitButtonActive: {
    backgroundColor: colors.primary,
  },
  unitButtonText: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.textTertiary,
  },
  unitButtonTextActive: {
    color: colors.textInverse,
  },
  dimensionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dimensionInput: {
    flex: 1,
    alignItems: 'center',
  },
  dimensionLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  dimensionField: {
    width: '100%',
    backgroundColor: colors.inputBackground,
    padding: spacing.md,
    borderRadius: radii.md,
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  dimensionSeparator: {
    fontSize: typography.sizes.button,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  errorText: {
    fontSize: typography.sizes.sm,
    color: colors.error,
    marginTop: spacing.sm,
  },
  displayText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  packagingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: 10,
  },
  packagingBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
  },
  packagingBadgeText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
  },
  confidenceText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
  aiAppliedBanner: {
    backgroundColor: colors.successLight,
    padding: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  aiAppliedText: {
    fontSize: typography.sizes.sm,
    color: '#2D7A3A',
    fontStyle: 'italic',
  },
  resetButton: {
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: 10,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: typography.sizes.body,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
});
