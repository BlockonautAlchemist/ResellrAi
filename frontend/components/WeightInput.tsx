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
} from '../lib/api';

interface Props {
  weight: PackageWeight | null;
  dimensions: PackageDimensions | null;
  suggestedWeight: WeightSuggestion | null;
  suggestedDimensions: DimensionsSuggestion | null;
  onWeightChange: (weight: PackageWeight) => void;
  onDimensionsChange: (dimensions: PackageDimensions) => void;
  weightError?: string | null;
  dimensionsError?: string | null;
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

      {/* Suggested Values Banner */}
      {(suggestedWeight || suggestedDimensions) && hasNoValues && (
        <TouchableOpacity
          style={styles.suggestionBanner}
          onPress={handleUseSuggestions}
        >
          <Text style={styles.suggestionTitle}>Suggested values based on item type:</Text>
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
            placeholderTextColor="#999"
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
              placeholderTextColor="#999"
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
              placeholderTextColor="#999"
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
              placeholderTextColor="#999"
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  errorBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  errorBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionBanner: {
    backgroundColor: '#E8F4FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 6,
  },
  suggestionValue: {
    fontSize: 14,
    color: '#333',
    marginBottom: 2,
  },
  suggestionSource: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  useSuggestionText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
    marginTop: 6,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputRowError: {
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 8,
    padding: 4,
  },
  weightInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 8,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  unitButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  unitButtonActive: {
    backgroundColor: '#007AFF',
  },
  unitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  unitButtonTextActive: {
    color: '#fff',
  },
  dimensionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimensionInput: {
    flex: 1,
    alignItems: 'center',
  },
  dimensionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dimensionField: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  dimensionSeparator: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 8,
  },
  displayText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
